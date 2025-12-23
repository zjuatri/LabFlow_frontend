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
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const suppressNextDragRef = useRef(false);
  const nextBlockIdRef = useRef(1);

  const reorderBlocks = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    const fromIndex = blocks.findIndex((b) => b.id === fromId);
    const toIndex = blocks.findIndex((b) => b.id === toId);
    if (fromIndex === -1 || toIndex === -1) return;

    const next = [...blocks];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
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
      const items = (b.content ?? '').split(/\r?\n/);
      const content = items.map((x) => (x.trim() ? `- ${x}` : '')).join('\n');
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
          draggable
          onMouseDownCapture={(e) => {
            const target = e.target as HTMLElement | null;
            suppressNextDragRef.current = !!target?.closest('input, textarea, [contenteditable="true"]');
          }}
          onMouseUpCapture={() => {
            suppressNextDragRef.current = false;
          }}
          onDragStart={(e) => {
            // If the user began this interaction inside an input/textarea,
            // do not start a block drag (otherwise text selection becomes impossible).
            if (suppressNextDragRef.current) {
              e.preventDefault();
              return;
            }

            setDraggingId(block.id);
            setDragOverId(null);
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', block.id);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            if (draggingId && draggingId !== block.id) setDragOverId(block.id);
          }}
          onDragLeave={() => {
            if (dragOverId === block.id) setDragOverId(null);
          }}
          onDrop={(e) => {
            e.preventDefault();
            const fromId = e.dataTransfer.getData('text/plain') || draggingId;
            if (fromId) reorderBlocks(fromId, block.id);
            setDraggingId(null);
            setDragOverId(null);
          }}
          onDragEnd={() => {
            setDraggingId(null);
            setDragOverId(null);
            suppressNextDragRef.current = false;
          }}
          className={
            dragOverId === block.id
              ? 'outline outline-2 outline-blue-400 rounded-lg'
              : draggingId === block.id
                ? 'opacity-70'
                : ''
          }
        >
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




