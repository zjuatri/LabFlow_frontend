'use client';

import { create } from 'zustand';
import {
    TypstBlock,
    DocumentSettings,
    defaultDocumentSettings,
} from '@/lib/typst/types';
import {
    blocksToTypst,
    typstToBlocks,
    stripDocumentSettings,
    injectDocumentSettings,
} from '@/lib/typst';
import { getProject, updateProject, listProjects, type Project } from '@/lib/api';
import { getToken } from '@/lib/auth';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EditorMode = 'visual' | 'source';
export type SyncSource = 'code' | 'blocks';
export type SaveStatus = 'saved' | 'saving' | null;

type HistorySnapshot = {
    blocks: TypstBlock[];
    settings: DocumentSettings;
};

interface EditorState {
    // Project metadata
    projectId: string;
    title: string;
    projectType: 'report' | 'cover' | 'template';

    // Document content
    blocks: TypstBlock[];
    code: string;
    syncSource: SyncSource;
    docSettings: DocumentSettings;

    // AI debug info (from generated projects)
    aiDebug: string | null;
    showAiDebug: boolean;

    // Editor mode
    mode: EditorMode;

    // UI state
    showSettings: boolean;
    showCoverModal: boolean;
    covers: Project[];
    loadingCovers: boolean;
    error: string | null;
    saveStatus: SaveStatus;

    // Preview state
    svgPages: string[];
    isRendering: boolean;

    // History (undo/redo)
    history: HistorySnapshot[];
    historyIndex: number;
    isRestoring: boolean;
}

interface EditorActions {
    // Initialization
    loadProject: (id: string) => Promise<void>;
    reset: () => void;

    // Document mutations
    setTitle: (title: string) => void;
    setBlocks: (blocks: TypstBlock[]) => void;
    setCode: (code: string) => void;
    setDocSettings: (settings: DocumentSettings) => void;
    setSyncSource: (source: SyncSource) => void;

    // Mode switching
    setMode: (mode: EditorMode) => void;
    switchMode: (newMode: EditorMode) => void;

    // UI toggles
    setShowSettings: (show: boolean) => void;
    setShowCoverModal: (show: boolean) => void;
    setShowAiDebug: (show: boolean) => void;
    setError: (error: string | null) => void;

    // Cover modal
    openCoverModal: () => Promise<void>;
    insertCover: (coverId: string, fixedOnePage: boolean) => Promise<void>;

    // Preview
    setSvgPages: (pages: string[]) => void;
    setIsRendering: (rendering: boolean) => void;

    // Save
    saveProject: () => Promise<void>;

    // History
    pushHistory: () => void;
    undo: () => void;
    redo: () => void;
    canUndo: () => boolean;
    canRedo: () => boolean;
}

type EditorStore = EditorState & EditorActions;

// ---------------------------------------------------------------------------
// Helper: Extract AI debug comment
// ---------------------------------------------------------------------------

function extractAiDebug(typstCode: string): { debugText: string | null; rest: string } {
    const start = typstCode.indexOf('/* LF_AI_DEBUG v1');
    if (start < 0) return { debugText: null, rest: typstCode };
    const end = typstCode.indexOf('*/', start);
    if (end < 0) return { debugText: typstCode.slice(start), rest: '' };
    const debugText = typstCode.slice(start, end + 2);
    const rest = (typstCode.slice(0, start) + typstCode.slice(end + 2)).trimStart();
    return { debugText, rest };
}

// ---------------------------------------------------------------------------
// Default state
// ---------------------------------------------------------------------------

const DEFAULT_TYPST_CODE = `= LabFlow 文档

这是一个新文档。开始在这里编辑您的内容。
`;

const initialState: EditorState = {
    projectId: '',
    title: '',
    projectType: 'report',

    blocks: [],
    code: '',
    syncSource: 'code',
    docSettings: { ...defaultDocumentSettings },

    aiDebug: null,
    showAiDebug: false,

    mode: 'visual',

    showSettings: false,
    showCoverModal: false,
    covers: [],
    loadingCovers: false,
    error: null,
    saveStatus: null,

    svgPages: [],
    isRendering: false,

    history: [],
    historyIndex: 0,
    isRestoring: false,
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

const BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? '';

export const useEditorStore = create<EditorStore>((set, get) => ({
    ...initialState,

    // -------------------------------------------------------------------------
    // Initialization
    // -------------------------------------------------------------------------

    loadProject: async (id: string) => {
        try {
            const project = await getProject(id);
            const type = project.type as 'report' | 'cover' | 'template';

            const rawCode = (project.typst_code ?? '').trim()
                ? (project.typst_code ?? '')
                : DEFAULT_TYPST_CODE;

            const { debugText, rest } = extractAiDebug(rawCode);
            const { code: initialCode, settings } = stripDocumentSettings(rest);

            const blocks = typstToBlocks(initialCode);

            // For covers, disable numbering by default
            const docSettings =
                type === 'cover'
                    ? { ...settings, tableCaptionNumbering: false, imageCaptionNumbering: false }
                    : settings;

            set({
                projectId: id,
                title: project.title,
                projectType: type,
                code: initialCode,
                blocks,
                docSettings,
                aiDebug: debugText,
                syncSource: 'code',
                history: [{ blocks, settings: docSettings }],
                historyIndex: 0,
                error: null,
            });
        } catch (err) {
            const msg = err instanceof Error ? err.message : '加载项目失败';
            set({ error: msg });
            throw err;
        }
    },

    reset: () => set(initialState),

    // -------------------------------------------------------------------------
    // Document mutations
    // -------------------------------------------------------------------------

    setTitle: (title) => set({ title }),

    setBlocks: (blocks) => {
        const state = get();
        set({ blocks, syncSource: 'blocks' });

        // Auto-sync code when blocks change
        if (!state.isRestoring) {
            const code = blocksToTypst(blocks, { settings: state.docSettings });
            set({ code });
            // Push to history
            get().pushHistory();
        }
    },

    setCode: (code) => {
        set({ code, syncSource: 'code' });
    },

    setDocSettings: (docSettings) => {
        set({ docSettings });
        // Re-sync code if blocks are the source
        const state = get();
        if (state.syncSource === 'blocks' && !state.isRestoring) {
            const code = blocksToTypst(state.blocks, { settings: docSettings });
            set({ code });
            get().pushHistory();
        }
    },

    setSyncSource: (syncSource) => set({ syncSource }),

    // -------------------------------------------------------------------------
    // Mode switching
    // -------------------------------------------------------------------------

    setMode: (mode) => set({ mode }),

    switchMode: (newMode) => {
        const state = get();
        if (newMode === state.mode) return;

        if (newMode === 'visual') {
            // Switching to visual: parse code into blocks
            const blocks = typstToBlocks(state.code);
            set({ blocks, syncSource: 'code', mode: newMode });
        } else {
            // Switching to source: serialize blocks to code
            const code = blocksToTypst(state.blocks, { settings: state.docSettings });
            set({ code, syncSource: 'blocks', mode: newMode });
        }
    },

    // -------------------------------------------------------------------------
    // UI toggles
    // -------------------------------------------------------------------------

    setShowSettings: (showSettings) => set({ showSettings }),
    setShowCoverModal: (showCoverModal) => set({ showCoverModal }),
    setShowAiDebug: (showAiDebug) => set({ showAiDebug }),
    setError: (error) => set({ error }),

    // -------------------------------------------------------------------------
    // Cover modal
    // -------------------------------------------------------------------------

    openCoverModal: async () => {
        set({ showCoverModal: true, loadingCovers: true });
        try {
            const data = await listProjects('cover');
            set({ covers: data, loadingCovers: false });
        } catch (err) {
            console.error('Failed to load covers', err);
            set({ loadingCovers: false });
        }
    },

    insertCover: async (coverId, fixedOnePage) => {
        try {
            const coverProject = await getProject(coverId);
            const rawCode = (coverProject.typst_code ?? '').trim()
                ? (coverProject.typst_code ?? '')
                : DEFAULT_TYPST_CODE;

            const { rest } = extractAiDebug(rawCode);
            const { code: coverBody } = stripDocumentSettings(rest);
            const coverBlocks = typstToBlocks(coverBody);

            const coverContainer: TypstBlock = {
                id: `cover-${Date.now()}`,
                type: 'cover',
                content: '',
                children: coverBlocks,
                coverFixedOnePage: fixedOnePage,
                uiCollapsed: true,
            };

            const state = get();
            const newBlocks = [coverContainer, ...state.blocks];

            set({ blocks: newBlocks, syncSource: 'blocks', showCoverModal: false });
            const code = blocksToTypst(newBlocks, { settings: state.docSettings });
            set({ code });
            get().pushHistory();
        } catch (err) {
            set({ error: err instanceof Error ? err.message : '插入封面失败' });
        }
    },

    // -------------------------------------------------------------------------
    // Preview
    // -------------------------------------------------------------------------

    setSvgPages: (svgPages) => set({ svgPages }),
    setIsRendering: (isRendering) => set({ isRendering }),

    // -------------------------------------------------------------------------
    // Save
    // -------------------------------------------------------------------------

    saveProject: async () => {
        const state = get();
        try {
            set({ saveStatus: 'saving' });
            const saveCode = injectDocumentSettings(state.code, state.docSettings);
            await updateProject(state.projectId, { title: state.title, typst_code: saveCode });
            set({ saveStatus: 'saved' });
            setTimeout(() => set({ saveStatus: null }), 2000);
        } catch (err) {
            set({ saveStatus: null, error: err instanceof Error ? err.message : '保存失败' });
        }
    },

    // -------------------------------------------------------------------------
    // History (undo/redo)
    // -------------------------------------------------------------------------

    pushHistory: () => {
        const state = get();
        if (state.isRestoring) return;

        const snapshot: HistorySnapshot = {
            blocks: state.blocks.map((b) => ({ ...b })),
            settings: { ...state.docSettings },
        };

        const base = state.history.slice(0, state.historyIndex + 1);
        const next = [...base, snapshot].slice(-50);

        set({
            history: next,
            historyIndex: Math.min(state.historyIndex + 1, 49),
        });
    },

    undo: () => {
        const state = get();
        if (!get().canUndo()) return;

        const nextIndex = state.historyIndex - 1;
        const snap = state.history[nextIndex];
        if (!snap) return;

        set({ isRestoring: true });
        set({
            blocks: snap.blocks,
            docSettings: snap.settings,
            syncSource: 'blocks',
            historyIndex: nextIndex,
            code: blocksToTypst(snap.blocks, { settings: snap.settings }),
        });
        // Use queueMicrotask to reset after current update cycle
        queueMicrotask(() => set({ isRestoring: false }));
    },

    redo: () => {
        const state = get();
        if (!get().canRedo()) return;

        const nextIndex = state.historyIndex + 1;
        const snap = state.history[nextIndex];
        if (!snap) return;

        set({ isRestoring: true });
        set({
            blocks: snap.blocks,
            docSettings: snap.settings,
            syncSource: 'blocks',
            historyIndex: nextIndex,
            code: blocksToTypst(snap.blocks, { settings: snap.settings }),
        });
        queueMicrotask(() => set({ isRestoring: false }));
    },

    canUndo: () => get().historyIndex > 0,
    canRedo: () => get().historyIndex < get().history.length - 1,
}));
