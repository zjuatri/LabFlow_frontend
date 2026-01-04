import { EditorPlugin } from './types';

class PluginRegistry {
    private plugins: Map<string, EditorPlugin> = new Map();
    private listeners: Set<() => void> = new Set();
    private loadedUrls: Set<string> = new Set();

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
     * Load a remote plugin from a URL (UMD/IIFE).
     */
    async loadRemote(url: string): Promise<void> {
        if (this.loadedUrls.has(url)) return; // Already loaded

        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = url;
            script.async = true;
            script.onload = () => {
                this.loadedUrls.add(url);
                resolve();
            };
            script.onerror = () => {
                reject(new Error(`Failed to load plugin from ${url}`));
            };
            document.head.appendChild(script);
        });
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
     * Subscribe to registry changes.
     */
    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    }

    private notifyListeners() {
        this.listeners.forEach(listener => listener());
    }
}

export const pluginRegistry = new PluginRegistry();
