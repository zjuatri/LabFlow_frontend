import { EditorPlugin } from './types';

const INSTALLED_PLUGINS_KEY = 'labflow_installed_plugins';

interface InstalledPluginMeta {
    id: string;
    name: string;
    source: 'file' | 'url';
    url?: string;
    // For file-based plugins, we store the code in IndexedDB
}

class PluginRegistry {
    private plugins: Map<string, EditorPlugin> = new Map();
    private listeners: Set<() => void> = new Set();
    private loadedIds: Set<string> = new Set();
    private initialized = false;
    private db: IDBDatabase | null = null;

    /**
     * Register a new plugin.
     */
    register(plugin: EditorPlugin) {
        if (this.plugins.has(plugin.id)) {
            console.warn(`Plugin with ID "${plugin.id}" is already registered. Overwriting.`);
        }
        this.plugins.set(plugin.id, plugin);
        this.notifyListeners();
    }

    /**
     * Initialize IndexedDB for storing plugin code.
     */
    private async initDB(): Promise<IDBDatabase> {
        if (this.db) return this.db;

        return new Promise((resolve, reject) => {
            const request = indexedDB.open('labflow_plugins', 1);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };
            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;
                if (!db.objectStoreNames.contains('plugin_code')) {
                    db.createObjectStore('plugin_code', { keyPath: 'id' });
                }
            };
        });
    }

    /**
     * Load a plugin from a File object (uploaded by user).
     */
    async loadFromFile(file: File): Promise<string> {
        const code = await file.text();
        return this.loadFromCode(code, file.name);
    }

    /**
     * Load a plugin from JavaScript code string.
     */
    async loadFromCode(code: string, filename?: string): Promise<string> {
        // Execute the code to register the plugin
        const beforeIds = new Set(this.plugins.keys());

        // Create a blob URL and load it as a script
        const blob = new Blob([code], { type: 'application/javascript' });
        const blobUrl = URL.createObjectURL(blob);

        await new Promise<void>((resolve, reject) => {
            const script = document.createElement('script');
            script.src = blobUrl;
            script.async = true;
            script.onload = () => {
                URL.revokeObjectURL(blobUrl);
                resolve();
            };
            script.onerror = () => {
                URL.revokeObjectURL(blobUrl);
                reject(new Error(`Failed to execute plugin code${filename ? ` from ${filename}` : ''}`));
            };
            document.head.appendChild(script);
        });

        // Find the newly registered plugin
        const afterIds = new Set(this.plugins.keys());
        const newIds = [...afterIds].filter(id => !beforeIds.has(id));

        if (newIds.length === 0) {
            throw new Error('Plugin did not register itself. Make sure it calls pluginRegistry.register()');
        }

        // Store the plugin code in IndexedDB
        const pluginId = newIds[0];
        await this.storePluginCode(pluginId, code);
        this.loadedIds.add(pluginId);

        // Update metadata
        this.persistPluginMeta(pluginId, 'file');

        return pluginId;
    }

    /**
     * Load a remote plugin from a URL (UMD/IIFE).
     */
    async loadRemote(url: string): Promise<string> {
        // Check if already loaded by URL
        const existingMeta = this.getInstalledPlugins().find(p => p.url === url);
        if (existingMeta && this.loadedIds.has(existingMeta.id)) {
            return existingMeta.id;
        }

        const beforeIds = new Set(this.plugins.keys());

        await new Promise<void>((resolve, reject) => {
            const script = document.createElement('script');
            script.src = url;
            script.async = true;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error(`Failed to load plugin from ${url}`));
            document.head.appendChild(script);
        });

        const afterIds = new Set(this.plugins.keys());
        const newIds = [...afterIds].filter(id => !beforeIds.has(id));

        if (newIds.length === 0) {
            throw new Error('Plugin did not register itself');
        }

        const pluginId = newIds[0];
        this.loadedIds.add(pluginId);
        this.persistPluginMeta(pluginId, 'url', url);

        return pluginId;
    }

    /**
     * Store plugin code in IndexedDB.
     */
    private async storePluginCode(id: string, code: string): Promise<void> {
        const db = await this.initDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('plugin_code', 'readwrite');
            const store = tx.objectStore('plugin_code');
            const request = store.put({ id, code });
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get plugin code from IndexedDB.
     */
    private async getPluginCode(id: string): Promise<string | null> {
        const db = await this.initDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('plugin_code', 'readonly');
            const store = tx.objectStore('plugin_code');
            const request = store.get(id);
            request.onsuccess = () => resolve(request.result?.code || null);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Delete plugin code from IndexedDB.
     */
    private async deletePluginCode(id: string): Promise<void> {
        const db = await this.initDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('plugin_code', 'readwrite');
            const store = tx.objectStore('plugin_code');
            const request = store.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Uninstall a plugin.
     */
    async uninstall(pluginId: string): Promise<void> {
        const metas = this.getInstalledPlugins().filter(p => p.id !== pluginId);
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem(INSTALLED_PLUGINS_KEY, JSON.stringify(metas));
        }
        await this.deletePluginCode(pluginId);
        // Plugin will be removed from registry on next page refresh
    }

    /**
     * Get all installed plugin metadata.
     */
    getInstalledPlugins(): InstalledPluginMeta[] {
        if (typeof localStorage === 'undefined') return [];
        try {
            const saved = localStorage.getItem(INSTALLED_PLUGINS_KEY);
            return saved ? JSON.parse(saved) : [];
        } catch {
            return [];
        }
    }

    /**
     * Load all persisted plugins. Call this on app startup.
     */
    async loadPersistedPlugins(): Promise<void> {
        if (this.initialized) return;
        this.initialized = true;

        const metas = this.getInstalledPlugins();
        for (const meta of metas) {
            if (this.loadedIds.has(meta.id)) continue;

            try {
                if (meta.source === 'file') {
                    const code = await this.getPluginCode(meta.id);
                    if (code) {
                        await this.loadFromCode(code);
                    }
                } else if (meta.source === 'url' && meta.url) {
                    await this.loadRemote(meta.url);
                }
            } catch (e) {
                console.error(`Failed to load persisted plugin: ${meta.id}`, e);
            }
        }
    }

    /**
     * Get a plugin by ID.
     */
    get(id: string): EditorPlugin | undefined {
        return this.plugins.get(id);
    }

    /**
     * Get all registered plugins.
     */
    getAll(): EditorPlugin[] {
        return Array.from(this.plugins.values());
    }

    /**
     * Check if a plugin is installed (persisted).
     */
    isInstalled(id: string): boolean {
        return this.getInstalledPlugins().some(p => p.id === id);
    }

    /**
     * Subscribe to registry changes.
     */
    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    }

    private notifyListeners() {
        this.listeners.forEach(listener => listener());
    }

    private persistPluginMeta(id: string, source: 'file' | 'url', url?: string) {
        if (typeof localStorage === 'undefined') return;
        const metas = this.getInstalledPlugins();
        const existing = metas.findIndex(p => p.id === id);

        const plugin = this.plugins.get(id);
        const meta: InstalledPluginMeta = {
            id,
            name: plugin?.name || id,
            source,
            url,
        };

        if (existing >= 0) {
            metas[existing] = meta;
        } else {
            metas.push(meta);
        }
        localStorage.setItem(INSTALLED_PLUGINS_KEY, JSON.stringify(metas));
    }
}

export const pluginRegistry = new PluginRegistry();
