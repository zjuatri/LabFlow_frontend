import { useRef, useCallback } from 'react';
import BlockEditor from '@/components/editor/BlockEditor';
import { useEditorStore } from '@/stores/useEditorStore';
import { useShallow } from 'zustand/react/shallow';

interface VisualEditorPaneProps {
    projectId: string;
    onBlockClick: (index: number) => void;
    editorScrollRef: React.RefObject<HTMLDivElement | null>;
}

export function VisualEditorPane({
    projectId,
    onBlockClick,
    editorScrollRef,
}: VisualEditorPaneProps) {
    const { blocks, setBlocks } = useEditorStore(
        useShallow((s) => ({
            blocks: s.blocks,
            setBlocks: s.setBlocks,
        }))
    );

    const blankCursorRef = useRef(0);

    const findAnswerBlankIndexes = useCallback((): number[] => {
        const idx: number[] = [];
        for (let i = 0; i < blocks.length; i++) {
            const b = blocks[i];
            if (b.type !== 'paragraph') continue;
            if (!b.placeholder) continue;
            const txt = (b.content ?? '').replace(/\u200B/g, '').trim();
            if (txt.length === 0) idx.push(i);
        }
        return idx;
    }, [blocks]);

    const jumpToNextBlank = useCallback(() => {
        const blanks = findAnswerBlankIndexes();
        if (blanks.length === 0) return;
        const start = blankCursorRef.current % blanks.length;
        const targetIndex = blanks[start];
        blankCursorRef.current = start + 1;

        const container = editorScrollRef.current;
        if (!container) return;
        const el = container.querySelector(`[data-block-index="${targetIndex}"]`) as HTMLElement | null;
        if (!el) return;
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Focus first editable inside the block if possible.
        const editable = el.querySelector('[contenteditable="true"]') as HTMLElement | null;
        editable?.focus();
    }, [findAnswerBlankIndexes, editorScrollRef]);


    return (
        <div className="flex-1 overflow-y-auto bg-amber-50/10 dark:bg-zinc-950/50" ref={editorScrollRef}>
            {(() => {
                const blanks = findAnswerBlankIndexes();
                if (blanks.length === 0) return null;
                return (
                    <div className="sticky top-0 z-10 px-4 py-2 bg-amber-50/95 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800 flex items-center justify-between gap-3 backdrop-blur-sm">
                        <div className="text-xs text-amber-800 dark:text-amber-200">
                            发现 {blanks.length} 处“待填写答案”。虚线框段落为答案区。
                        </div>
                        <button
                            type="button"
                            onClick={jumpToNextBlank}
                            className="text-xs px-2 py-1 rounded border border-amber-300 dark:border-amber-700 bg-white/80 dark:bg-zinc-950/40 text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
                        >
                            跳到下一处
                        </button>
                    </div>
                );
            })()}
            <BlockEditor
                blocks={blocks}
                onChange={setBlocks}
                projectId={projectId}
                onBlockClick={onBlockClick}
            />
        </div>
    );
}
