import { create } from 'zustand';
import { InlineMathState } from '@/components/editor/BlockEditor-utils/types';

interface TableState {
    // blockId of the table currently being edited
    activeBlockId: string | null;

    // Active cell coordinates
    activeCell: { r: number; c: number } | null;

    // Selection range
    selection: { r1: number; c1: number; r2: number; c2: number } | null;

    // Whether selection mode is enabled (click-to-select range)
    selectionMode: boolean;

    // Whether the color picker is visible
    showColorPicker: boolean;

    // Active inline math state (if any)
    activeInlineMath: InlineMathState | null;

    // Whether the cell is currently being edited (focused)
    isEditingCell: boolean;
}

interface TableActions {
    setActiveTable: (id: string | null) => void;
    setActiveCell: (cell: { r: number; c: number } | null) => void;
    setSelection: (selection: { r1: number; c1: number; r2: number; c2: number } | null) => void;
    setSelectionMode: (enabled: boolean) => void;
    toggleSelectionMode: () => void;
    setShowColorPicker: (show: boolean) => void;
    setActiveInlineMath: (math: InlineMathState | null) => void;
    setIsEditingCell: (isEditing: boolean) => void;

    // Helper to reset ephemeral state when switching tables or closing
    reset: () => void;
}

const initialState: TableState = {
    activeBlockId: null,
    activeCell: null,
    selection: null,
    selectionMode: false,
    showColorPicker: false,
    activeInlineMath: null,
    isEditingCell: false,
};

export const useTableStore = create<TableState & TableActions>((set) => ({
    ...initialState,

    setActiveTable: (id) => set({ activeBlockId: id }),

    setActiveCell: (cell) => set({ activeCell: cell }),

    setSelection: (selection) => set({ selection }),

    setSelectionMode: (enabled) => set({ selectionMode: enabled }),
    toggleSelectionMode: () => set((state) => ({ selectionMode: !state.selectionMode })),

    setShowColorPicker: (show) => set({ showColorPicker: show }),

    setActiveInlineMath: (math) => set({ activeInlineMath: math }),

    setIsEditingCell: (isEditing) => set({ isEditingCell: isEditing }),

    reset: () => set(initialState),
}));
