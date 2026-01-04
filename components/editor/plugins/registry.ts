import { EditorPlugin } from './types';

class PluginRegistry {
    private plugins: Map<string, EditorPlugin> = new Map();

    /**
     * Register a new plugin.
     */
    register(plugin: EditorPlugin) {
        if (this.plugins.has(plugin.id)) {
            console.warn(`Plugin with ID "${plugin.id}" is already registered. Overwriting.`);
        }
        this.plugins.set(plugin.id, plugin);
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
}

export const pluginRegistry = new PluginRegistry();
