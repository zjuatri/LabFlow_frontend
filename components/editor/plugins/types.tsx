import { TypstBlock } from '@/lib/typst';

/**
 * Props passed to every editor plugin component.
 */
export interface EditorPluginProps {
    /** The ID of the current project */
    projectId: string;

    /** Current document blocks (read-only for reference) */
    existingBlocks: TypstBlock[];

    /** callback to insert new blocks into the document */
    onInsertBlocks: (blocks: TypstBlock[]) => void;

    /** Callback to close the plugin sidebar */
    onClose: () => void;
}

/**
 * Definition of an Editor Plugin.
 */
export interface EditorPlugin {
    /** Unique ID for the plugin (e.g., "ai-assistant", "todo-list") */
    id: string;

    /** Display name shown in UI (tooltips, menus) */
    name: string;

    /** Icon component (Lucide icon or similar) */
    icon: React.ComponentType<{ size?: number; className?: string }>;

    /** 
     * The main component rendered in the sidebar.
     * It will receive `EditorPluginProps`.
     */
    component: React.ComponentType<EditorPluginProps>;

    /** Optional description */
    description?: string;
}
