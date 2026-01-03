import { create } from 'zustand';
import { Project, listProjects, createProject, deleteProject, updateProject } from '@/lib/api';

interface WorkspaceState {
    projects: Project[];
    loading: boolean;
    error: string | null;
    activeTab: 'report' | 'cover' | 'template';
    selectedIds: Set<string>;

    // Modal States
    showCreateModal: boolean;
    showTemplateModal: boolean;
    batchDeleting: boolean;
    deletingProject: Project | null;
    renamingProject: Project | null;

    // Actions
    setProjects: (projects: Project[]) => void;
    setLoading: (loading: boolean) => void;
    setError: (error: string | null) => void;
    setActiveTab: (tab: 'report' | 'cover' | 'template') => void;

    // Selection
    toggleSelect: (id: string) => void;
    selectAll: () => void;
    deselectAll: () => void;

    // Modal Actions
    setShowCreateModal: (show: boolean) => void;
    setShowTemplateModal: (show: boolean) => void;
    setBatchDeleting: (batchDeleting: boolean) => void;
    setDeletingProject: (project: Project | null) => void;
    setRenamingProject: (project: Project | null) => void;

    // Async Actions
    loadProjects: () => Promise<void>;
    createProject: (title: string, type?: string, sourceId?: string) => Promise<Project>;
    deleteProject: (id: string) => Promise<void>;
    deleteSelectedProjects: () => Promise<void>;
    updateProject: (id: string, data: Partial<Project>) => Promise<void>;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
    projects: [],
    loading: false,
    error: null,
    activeTab: 'report',
    selectedIds: new Set(),

    showCreateModal: false,
    showTemplateModal: false,
    batchDeleting: false,
    deletingProject: null,
    renamingProject: null,

    setProjects: (projects) => set({ projects }),
    setLoading: (loading) => set({ loading }),
    setError: (error) => set({ error }),
    setActiveTab: (activeTab) => set({ activeTab, selectedIds: new Set() }),

    toggleSelect: (id) => set((state) => {
        const next = new Set(state.selectedIds);
        if (next.has(id)) {
            next.delete(id);
        } else {
            next.add(id);
        }
        return { selectedIds: next };
    }),

    selectAll: () => set((state) => ({
        selectedIds: new Set(state.projects.map((p) => p.id))
    })),

    deselectAll: () => set({ selectedIds: new Set() }),

    setShowCreateModal: (showCreateModal) => set({ showCreateModal }),
    setShowTemplateModal: (showTemplateModal) => set({ showTemplateModal }),
    setBatchDeleting: (batchDeleting) => set({ batchDeleting }),
    setDeletingProject: (deletingProject) => set({ deletingProject }),
    setRenamingProject: (renamingProject) => set({ renamingProject }),

    loadProjects: async () => {
        const { activeTab } = get();
        set({ loading: true, error: null });
        try {
            const projects = await listProjects(activeTab);
            set((state) => {
                const nextSelected = new Set<string>();
                projects.forEach(p => {
                    if (state.selectedIds.has(p.id)) nextSelected.add(p.id);
                });
                return { projects, loading: false, selectedIds: nextSelected };
            });
        } catch (err) {
            set({
                loading: false,
                error: err instanceof Error ? err.message : '加载失败'
            });
            // We don't rethrow here to prevent unhandled promise rejections if UI doesn't catch it
            // The error state is sufficient for UI
        }
    },

    createProject: async (title, type, sourceId) => {
        const { activeTab } = get();
        const targetType = type || activeTab;
        const p = await createProject(title, targetType, sourceId);
        if (targetType === activeTab) {
            set(state => ({ projects: [p, ...state.projects] }));
        }
        return p;
    },

    deleteProject: async (id) => {
        await deleteProject(id);
        set(state => ({
            projects: state.projects.filter(p => p.id !== id),
            selectedIds: new Set([...state.selectedIds].filter(sid => sid !== id))
        }));
    },

    deleteSelectedProjects: async () => {
        const { selectedIds } = get();
        const ids = Array.from(selectedIds);
        // Best effort sequential delete
        for (const id of ids) {
            try {
                await deleteProject(id);
            } catch (e) {
                console.error(`Failed to delete ${id}`, e);
            }
        }
        await get().loadProjects();
        set({ selectedIds: new Set() });
    },

    updateProject: async (id, data) => {
        await updateProject(id, data);
        set(state => ({
            projects: state.projects.map(p => p.id === id ? { ...p, ...data } : p)
        }));
    }
}));
