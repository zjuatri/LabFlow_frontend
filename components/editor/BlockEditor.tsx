'use client';

import { TypstBlock } from '@/lib/typst';
import { getToken } from '@/lib/auth';
import { useRef, useState, useEffect, useCallback } from 'react';
import BlockItem from './BlockItem';

import { parseTablePayload } from './BlockEditor-utils/table-utils';

interface BlockEditorProps {
  blocks: TypstBlock[];
  onChange: (blocks: TypstBlock[]) => void;
  projectId: string;
  onBlockClick?: (index: number) => void;
}

type ChartType = 'scatter' | 'bar' | 'pie' | 'hbar';
type ChartRenderRequest = {
  chart_type: ChartType;
  title: string;
  x_label: string;
  y_label: string;
  legend: boolean;
  data: Array<Record<string, unknown>>;
};

export default function BlockEditor({ blocks, onChange, projectId, onBlockClick }: BlockEditorProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  // Track drop position: which block and whether to insert before or after
  type DropPosition = { targetId: string; position: 'before' | 'after' } | null;
  const [dropPosition, setDropPosition] = useState<DropPosition>(null);
  const suppressNextDragRef = useRef(false);
  const nextBlockIdRef = useRef(1);

  const reorderBlocks = (fromId: string, toId: string, position: 'before' | 'after') => {
    if (fromId === toId) return;
    const fromIndex = blocks.findIndex((b) => b.id === fromId);
    const toIndex = blocks.findIndex((b) => b.id === toId);
    if (fromIndex === -1 || toIndex === -1) return;

    const next = [...blocks];
    const [moved] = next.splice(fromIndex, 1);

    // Calculate the correct insertion index
    // After removing the dragged item, indices shift if fromIndex < toIndex
    let insertIndex = toIndex;
    if (fromIndex < toIndex) {
      insertIndex = toIndex - 1; // Adjust for the removed item
    }
    if (position === 'after') {
      insertIndex += 1;
    }

    next.splice(insertIndex, 0, moved);
    onChange(next);
  };

  const updateBlock = (id: string, updates: Partial<TypstBlock>) => {
    onChange(blocks.map(b => b.id === id ? { ...b, ...updates } : b));
  };

  // Migrate legacy list blocks into paragraph blocks.
  // Lists are now represented inside paragraphs as lines starting with "- " or "1.".
  useEffect(() => {
    const hasLegacyList = blocks.some((b) => b.type === 'list');
    if (!hasLegacyList) return;

    const migrated: TypstBlock[] = blocks.map((b): TypstBlock => {
      if (b.type !== 'list') return b;
      // Strip any existing prefixes (numbers or bullets) from each line,
      // then re-add consistent numbering.
      const items = (b.content ?? '')
        .split(/\r?\n/)
        .map((x) => x.trim())
        .filter((x) => x.length > 0)
        .map((x) => {
          // Strip leading number prefix like "1. " or "2) "
          let stripped = x.replace(/^\s*\d+[.)]\s*/, '');
          // Also strip bullet prefixes like "- " or "* "
          stripped = stripped.replace(/^\s*[-*•]\s*/, '');
          return stripped.trim() || x; // Fallback to original if stripping leaves empty
        });

      const content = items.map((x, i) => `${i + 1}. ${x}`).join('\n');
      return { ...b, type: 'paragraph', content };
    });

    onChange(migrated);
  }, [blocks, onChange]);

  const deleteBlock = (id: string) => {
    onChange(blocks.filter(b => b.id !== id));
  };

  const addBlock = (afterId?: string) => {
    let nextId = '';
    do {
      nextId = `block-${nextBlockIdRef.current++}`;
    } while (blocks.some((b) => b.id === nextId));

    const newBlock: TypstBlock = {
      id: nextId,
      type: 'paragraph',
      content: '',
    };

    if (!afterId) {
      onChange([...blocks, newBlock]);
    } else {
      const index = blocks.findIndex(b => b.id === afterId);
      const newBlocks = [...blocks];
      newBlocks.splice(index + 1, 0, newBlock);
      onChange(newBlocks);
    }
  };

  type LastTableSelection = { blockId: string; r1: number; c1: number; r2: number; c2: number };
  const [lastTableSelection, setLastTableSelection] = useState<LastTableSelection | null>(null);

  const handleTableSelectionSnapshot = useCallback((snap: LastTableSelection | null) => {
    setLastTableSelection(snap);
  }, []);

  const renderChart = async (payload: ChartRenderRequest): Promise<string> => {
    const token = getToken();
    const res = await fetch(`/api/projects/${projectId}/charts/render`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.detail || '生成图表失败');
    }

    const data = await res.json();
    return (data?.url as string) || '';
  };

  const moveBlock = (id: string, direction: 'up' | 'down') => {
    const index = blocks.findIndex(b => b.id === id);
    if (direction === 'up' && index > 0) {
      const newBlocks = [...blocks];
      [newBlocks[index - 1], newBlocks[index]] = [newBlocks[index], newBlocks[index - 1]];
      onChange(newBlocks);
    } else if (direction === 'down' && index < blocks.length - 1) {
      const newBlocks = [...blocks];
      [newBlocks[index], newBlocks[index + 1]] = [newBlocks[index + 1], newBlocks[index]];
      onChange(newBlocks);
    }
  };

  /**
   * Moves existing blocks from the document into a composite row's children array.
   * The blocks are removed from the top-level blocks and added as children of the composite row.
   * Supports both single blockId (string) and multiple blockIds (string[]).
   */
  const moveBlockToComposite = (compositeBlockId: string, blockIdToMove: string | string[]) => {
    const blockIds = Array.isArray(blockIdToMove) ? blockIdToMove : [blockIdToMove];
    const compositeBlock = blocks.find(b => b.id === compositeBlockId && b.type === 'composite_row');

    if (!compositeBlock) return;

    const currentChildren = Array.isArray(compositeBlock.children) ? compositeBlock.children : [];
    const availableSlots = 4 - currentChildren.length;

    if (availableSlots <= 0) return;

    // Find all blocks to move (filter out covers and composite rows)
    const blocksToMove = blockIds
      .slice(0, availableSlots) // Limit to available slots
      .map(id => blocks.find(b => b.id === id))
      .filter((b): b is TypstBlock =>
        b !== undefined && b.type !== 'cover' && b.type !== 'composite_row'
      );

    if (blocksToMove.length === 0) return;

    const idsToRemove = new Set(blocksToMove.map(b => b.id));

    // Remove the blocks from top-level and add them to composite row's children
    const newBlocks = blocks
      .filter(b => !idsToRemove.has(b.id))
      .map(b => {
        if (b.id === compositeBlockId) {
          return {
            ...b,
            children: [...currentChildren, ...blocksToMove],
          };
        }
        return b;
      });

    onChange(newBlocks);
  };



  const uploadImage = async (file: File, blockId: string) => {
    const token = getToken();
    const form = new FormData();
    form.append('file', file);

    const res = await fetch(`/api/projects/${projectId}/images/upload`, {
      method: 'POST',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: form,
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.detail || '上传失败');
    }

    const data = await res.json();
    const url = data?.url as string;
    if (url) {
      updateBlock(blockId, { content: url });
    }
  };

  // Build a lightweight list of table blocks for chart import UI.
  const availableTables = blocks
    .filter((b) => b.type === 'table')
    .map((b, idx) => {
      let caption = '';
      try {
        const payload = parseTablePayload(b.content);
        caption = typeof payload.caption === 'string' ? payload.caption.trim() : '';
      } catch {
        caption = '';
      }
      const label = caption ? `表格 ${idx + 1}: ${caption}` : `表格 ${idx + 1}`;
      return { id: b.id, label };
    });

  return (
    <div className="flex flex-col gap-2 p-4">
      {blocks.map((block, index) => (
        <div
          key={block.id}
          data-block-index={index}
          draggable={block.type !== 'cover'}
          onMouseDownCapture={(e) => {
            const target = e.target as HTMLElement | null;
            suppressNextDragRef.current = !!target?.closest('input, textarea, [contenteditable="true"]');
          }}
          onMouseUpCapture={() => {
            suppressNextDragRef.current = false;
          }}
          onDragStart={(e) => {
            if (block.type === 'cover') {
              e.preventDefault();
              return;
            }
            // If the user began this interaction inside an input/textarea,
            // do not start a block drag (otherwise text selection becomes impossible).
            if (suppressNextDragRef.current) {
              e.preventDefault();
              return;
            }

            setDraggingId(block.id);
            setDropPosition(null);
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', block.id);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            if (!draggingId || draggingId === block.id) return;

            // Calculate cursor position relative to block midpoint
            const rect = e.currentTarget.getBoundingClientRect();
            const midY = rect.top + rect.height / 2;
            const position = e.clientY < midY ? 'before' : 'after';

            setDropPosition({ targetId: block.id, position });
          }}
          onDragLeave={() => {
            if (dropPosition?.targetId === block.id) setDropPosition(null);
          }}
          onDrop={(e) => {
            e.preventDefault();
            const fromId = e.dataTransfer.getData('text/plain') || draggingId;
            if (fromId && dropPosition) {
              reorderBlocks(fromId, dropPosition.targetId, dropPosition.position);
            }
            setDraggingId(null);
            setDropPosition(null);
          }}
          onDragEnd={() => {
            setDraggingId(null);
            setDropPosition(null);
            suppressNextDragRef.current = false;
          }}
          className={`relative ${draggingId === block.id ? 'opacity-50' : ''}`}
        >
          {/* Insertion indicator line - before */}
          {dropPosition?.targetId === block.id && dropPosition.position === 'before' && (
            <div className="absolute -top-1 left-0 right-0 h-0.5 bg-blue-500 rounded-full z-10" />
          )}
          {/* Insertion indicator line - after */}
          {dropPosition?.targetId === block.id && dropPosition.position === 'after' && (
            <div className="absolute -bottom-1 left-0 right-0 h-0.5 bg-blue-500 rounded-full z-10" />
          )}
          <BlockItem
            block={block}
            isFirst={index === 0}
            isLast={index === blocks.length - 1}
            allBlocks={blocks}
            availableTables={availableTables}
            onUpdate={(updates) => updateBlock(block.id, updates)}
            onDelete={() => deleteBlock(block.id)}
            onAddAfter={() => addBlock(block.id)}
            onMove={(dir) => moveBlock(block.id, dir)}
            onUploadImage={(file) => uploadImage(file, block.id)}
            onTableSelectionSnapshot={handleTableSelectionSnapshot}
            lastTableSelection={lastTableSelection}
            onRenderChart={async (chartPayload) => {
              const url = await renderChart(chartPayload);
              return url;
            }}
            onClick={() => onBlockClick?.(index)}
            onMoveBlockToComposite={moveBlockToComposite}
          />
        </div>
      ))}

      {blocks.length === 0 && (
        <button
          onClick={() => addBlock()}
          className="p-4 border-2 border-dashed border-zinc-300 dark:border-zinc-700 rounded hover:border-zinc-400 dark:hover:border-zinc-600 text-zinc-500 dark:text-zinc-400"
        >
          + 添加第一个块
        </button>
      )}
    </div>
  );
}




