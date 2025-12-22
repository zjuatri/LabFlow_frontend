'use client';

import { TypstBlock, BlockType } from '@/lib/typst';
import { latexToTypstMath, typstToLatexMath } from '@/lib/math-convert';
import { getToken } from '@/lib/auth';
import { Trash2, Plus, ChevronUp, ChevronDown, Bold, Italic, Strikethrough, Palette, Sigma, MousePointer2 } from 'lucide-react';
import { useRef, useState, useEffect, useCallback, type MouseEvent as ReactMouseEvent, type ClipboardEvent as ReactClipboardEvent } from 'react';
import Image from 'next/image';

// Import types and utilities from separated modules
import type { InlineMathFormat, InlineMathState, TableStyle, TablePayload } from './BlockEditor/types';
import {
  typstInlineToHtml,
  htmlToTypstInline,
  generateInlineMathId,
  typstInlineToPlainText,
} from './BlockEditor/utils';
import {
  defaultTablePayload,
  parseTablePayload,
  normalizeTablePayload,
  flattenTableMerges,
  mergeTableRect,
  unmergeTableCell,
} from './BlockEditor/table-utils';

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

interface BlockItemProps {
  block: TypstBlock;
  isFirst: boolean;
  isLast: boolean;
  allBlocks: TypstBlock[];
  availableTables: Array<{ id: string; label: string }>;
  onUpdate: (updates: Partial<TypstBlock>) => void;
  onDelete: () => void;
  onAddAfter: () => void;
  onMove: (direction: 'up' | 'down') => void;
  onUploadImage: (file: File) => void;
  onTableSelectionSnapshot: (snap: { blockId: string; r1: number; c1: number; r2: number; c2: number } | null) => void;
  lastTableSelection: { blockId: string; r1: number; c1: number; r2: number; c2: number } | null;
  onRenderChart: (payload: ChartRenderRequest) => Promise<string>;
  onClick: () => void;
}

function BlockItem({ block, isFirst, isLast, allBlocks, availableTables, onUpdate, onDelete, onAddAfter, onMove, onUploadImage, onTableSelectionSnapshot, lastTableSelection, onRenderChart, onClick }: BlockItemProps) {
  const paragraphEditorRef = useRef<HTMLDivElement>(null);
  const tableCellEditorRef = useRef<HTMLDivElement>(null);
  const colorPickerRef = useRef<HTMLDivElement>(null);
  const tableColorPickerRef = useRef<HTMLDivElement>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showTableColorPicker, setShowTableColorPicker] = useState(false);
  const [isEditingParagraph, setIsEditingParagraph] = useState(false);
  const [isEditingTableCell, setIsEditingTableCell] = useState(false);
  const [activeInlineMath, setActiveInlineMath] = useState<InlineMathState | null>(null);

  const [activeTableCell, setActiveTableCell] = useState<{ r: number; c: number } | null>(null);
  const [tableSelection, setTableSelection] = useState<{ r1: number; c1: number; r2: number; c2: number } | null>(null);
  const [tableSelectionMode, setTableSelectionMode] = useState(false);
  const tableRowsInputRef = useRef<HTMLInputElement>(null);
  const tableColsInputRef = useRef<HTMLInputElement>(null);

  // Chart editor table-pick helpers (used by scatter/bar/hbar/pie table import previews)
  const [chartSelectionMode, setChartSelectionMode] = useState(false);
  const [chartPickAnchor, setChartPickAnchor] = useState<{ key: string; r: number; c: number } | null>(null);

  const syncParagraphFromDom = useCallback(() => {
    const el = paragraphEditorRef.current;
    if (!el) return;
    const next = htmlToTypstInline(el);
    onUpdate({ content: next });
  }, [onUpdate]);

  const syncTableCellFromDom = useCallback(() => {
    if (block.type !== 'table') return;
    const pos = activeTableCell;
    const el = tableCellEditorRef.current;
    if (!pos || !el) return;
    const payload = normalizeTablePayload(parseTablePayload(block.content));
    const cell = payload.cells[pos.r]?.[pos.c];
    if (!cell || cell.hidden) return;
    payload.cells[pos.r][pos.c] = { ...cell, content: htmlToTypstInline(el) };
    onUpdate({ content: JSON.stringify(payload) });
  }, [activeTableCell, block.content, block.type, onUpdate]);

  useEffect(() => {
    if (block.type !== 'table') return;
    if (!tableSelection) return;
    onTableSelectionSnapshot({ blockId: block.id, ...tableSelection });
  }, [block.id, block.type, tableSelection, onTableSelectionSnapshot]);

  type TableAxisMode = 'cols' | 'rows';
  type TableSelection = { blockId: string; r1: number; c1: number; r2: number; c2: number };

  type ScatterSeries = {
    name: string;
    // Each axis chooses its own source.
    xSource?: 'manual' | 'table';
    ySource?: 'manual' | 'table';
    // Manual input stores two TSV rows: x row and y row.
    xRow?: string;
    yRow?: string;
    // Table input stores a 1D selection (either a single row or a single column).
    xTableSelection?: TableSelection;
    yTableSelection?: TableSelection;
  };

  type BarSeries = {
    name: string;
    source: 'manual' | 'table';
    axisMode: TableAxisMode;
    // Manual: values aligned to barXRow.
    yRow?: string;
    // Table: selection provides both x labels and y values (2 rows/cols).
    tableSelection?: TableSelection;
  };

  type PieRow = { label: string; value: string };

  const safeParseChartContent = (content: string) => {
    try {
      const parsedUnknown: unknown = JSON.parse(content || '{}');
      if (!parsedUnknown || typeof parsedUnknown !== 'object') throw new Error('bad');
      const parsed = parsedUnknown as Record<string, unknown>;
      const chartTypeRaw = (parsed['chartType'] ?? 'scatter');
      const chartType: ChartType =
        chartTypeRaw === 'scatter' || chartTypeRaw === 'bar' || chartTypeRaw === 'pie' || chartTypeRaw === 'hbar'
          ? (chartTypeRaw as ChartType)
          : 'scatter';
      const readSelection = (selUnknown: unknown) => {
        let tableSelection: { blockId: string; r1: number; c1: number; r2: number; c2: number } | undefined = undefined;
        if (selUnknown && typeof selUnknown === 'object') {
          const sel = selUnknown as Record<string, unknown>;
          const blockId = typeof sel['blockId'] === 'string' ? (sel['blockId'] as string) : '';
          const r1 = Number(sel['r1']);
          const c1 = Number(sel['c1']);
          const r2 = Number(sel['r2']);
          const c2 = Number(sel['c2']);
          if (blockId && Number.isFinite(r1) && Number.isFinite(c1) && Number.isFinite(r2) && Number.isFinite(c2)) {
            tableSelection = { blockId, r1, c1, r2, c2 };
          }
        }
        return tableSelection;
      };

      const legacySelection = readSelection(parsed['tableSelection']);

      const seriesUnknown = parsed['scatterSeries'];
      let scatterSeries: ScatterSeries[] = [];
      if (Array.isArray(seriesUnknown)) {
        scatterSeries = seriesUnknown
          .map((item, idx): ScatterSeries | null => {
            if (!item || typeof item !== 'object') return null;
            const it = item as Record<string, unknown>;
            const name = typeof it['name'] === 'string' ? (it['name'] as string) : `系列${idx + 1}`;
            const legacySource = it['source'] === 'table' ? 'table' : 'manual';
            const xSource = it['xSource'] === 'table' ? 'table' : it['xSource'] === 'manual' ? 'manual' : undefined;
            const ySource = it['ySource'] === 'table' ? 'table' : it['ySource'] === 'manual' ? 'manual' : undefined;
            const xRow = typeof it['xRow'] === 'string' ? (it['xRow'] as string) : '';
            const yRow = typeof it['yRow'] === 'string' ? (it['yRow'] as string) : '';
            const xTableSelection = readSelection(it['xTableSelection']);
            const yTableSelection = readSelection(it['yTableSelection']);

            // Migrate old combined tableSelection/axisMode into per-axis selections.
            const axisMode: TableAxisMode = it['axisMode'] === 'rows' ? 'rows' : 'cols';
            const legacySel = readSelection(it['tableSelection']);
            let nextXSel = xTableSelection;
            let nextYSel = yTableSelection;
            if ((!nextXSel || !nextYSel) && legacySource === 'table' && legacySel) {
              const top = Math.min(legacySel.r1, legacySel.r2);
              const bottom = Math.max(legacySel.r1, legacySel.r2);
              const left = Math.min(legacySel.c1, legacySel.c2);
              const right = Math.max(legacySel.c1, legacySel.c2);
              if (axisMode === 'rows') {
                const rX = top;
                const rY = Math.min(bottom, top + 1);
                nextXSel = { blockId: legacySel.blockId, r1: rX, r2: rX, c1: left, c2: right };
                nextYSel = { blockId: legacySel.blockId, r1: rY, r2: rY, c1: left, c2: right };
              } else {
                const cX = left;
                const cY = Math.min(right, left + 1);
                nextXSel = { blockId: legacySel.blockId, r1: top, r2: bottom, c1: cX, c2: cX };
                nextYSel = { blockId: legacySel.blockId, r1: top, r2: bottom, c1: cY, c2: cY };
              }
            }

            const finalXSource = xSource ?? legacySource;
            const finalYSource = ySource ?? legacySource;
            return { name, xSource: finalXSource, ySource: finalYSource, xRow, yRow, xTableSelection: nextXSel, yTableSelection: nextYSel };
          })
          .filter(Boolean) as ScatterSeries[];
      }

      // bar/hbar series
      const barSeriesUnknown = parsed['barSeries'];
      let barSeries: BarSeries[] = [];
      if (Array.isArray(barSeriesUnknown)) {
        barSeries = barSeriesUnknown
          .map((item, idx): BarSeries | null => {
            if (!item || typeof item !== 'object') return null;
            const it = item as Record<string, unknown>;
            const name = typeof it['name'] === 'string' ? (it['name'] as string) : `系列${idx + 1}`;
            const source = it['source'] === 'table' ? 'table' : 'manual';
            const axisMode: TableAxisMode = it['axisMode'] === 'rows' ? 'rows' : 'cols';
            const yRow = typeof it['yRow'] === 'string' ? (it['yRow'] as string) : '';
            const tableSelection = readSelection(it['tableSelection']);
            return { name, source, axisMode, yRow, tableSelection };
          })
          .filter(Boolean) as BarSeries[];
      }

      const barXRow = typeof parsed['barXRow'] === 'string' ? (parsed['barXRow'] as string) : '';

      // pie
      const pieAxisMode: TableAxisMode = parsed['pieAxisMode'] === 'rows' ? 'rows' : 'cols';
      const pieTableSelection = readSelection(parsed['pieTableSelection']);
      const pieRowsUnknown = parsed['pieRows'];
      let pieRows: PieRow[] = [];
      if (Array.isArray(pieRowsUnknown)) {
        pieRows = pieRowsUnknown
          .map((item): PieRow | null => {
            if (!item || typeof item !== 'object') return null;
            const it = item as Record<string, unknown>;
            const label = typeof it['label'] === 'string' ? (it['label'] as string) : '';
            const value = typeof it['value'] === 'string' ? (it['value'] as string) : '';
            return { label, value };
          })
          .filter(Boolean) as PieRow[];
      }

      // Migrate legacy single-source fields to new series model (scatter only).
      const dataSource: 'manual' | 'table' = parsed['dataSource'] === 'table' ? 'table' : 'manual';
      const manualText = typeof parsed['manualText'] === 'string' ? (parsed['manualText'] as string) : '';
      if (scatterSeries.length === 0) {
        if (dataSource === 'table' && legacySelection) {
          // Best-effort: treat legacy selection as two columns (X=left col, Y=right col)
          const top = Math.min(legacySelection.r1, legacySelection.r2);
          const bottom = Math.max(legacySelection.r1, legacySelection.r2);
          const left = Math.min(legacySelection.c1, legacySelection.c2);
          const right = Math.max(legacySelection.c1, legacySelection.c2);
          const cX = left;
          const cY = Math.min(right, left + 1);
          scatterSeries = [{
            name: '系列1',
            xSource: 'table',
            ySource: 'table',
            xRow: '',
            yRow: '',
            xTableSelection: { blockId: legacySelection.blockId, r1: top, r2: bottom, c1: cX, c2: cX },
            yTableSelection: { blockId: legacySelection.blockId, r1: top, r2: bottom, c1: cY, c2: cY },
          }];
        } else {
          const lines = (manualText ?? '').replace(/\r/g, '').split('\n');
          const xRow = lines[0] ?? '';
          const yRow = lines[1] ?? '';
          scatterSeries = [{ name: '系列1', xSource: 'manual', ySource: 'manual', xRow, yRow, xTableSelection: undefined, yTableSelection: undefined }];
        }
      }

      // Best-effort migration for bar/hbar and pie from legacy manualText.
      // Old formats supported:
      // - bar/hbar: [label,value] or [series,label,value]
      // - pie: [label,value] or [series,label,value]
      if ((chartType === 'bar' || chartType === 'hbar') && barSeries.length === 0 && barXRow.trim() === '' && manualText.trim()) {
        const lines = manualText.replace(/\r/g, '').split('\n').map((l) => l.trim()).filter(Boolean);
        const rows = lines.map((l) => l.split(/\t|,/).map((x) => x.trim()));
        const labelsOrder: string[] = [];
        const seriesMap = new Map<string, Map<string, string>>();
        for (const r of rows) {
          if (r.length >= 3) {
            const s = r[0] ?? '';
            const label = r[1] ?? '';
            const val = r[2] ?? '';
            if (!label) continue;
            if (!labelsOrder.includes(label)) labelsOrder.push(label);
            if (!seriesMap.has(s)) seriesMap.set(s, new Map());
            seriesMap.get(s)!.set(label, val);
          } else if (r.length >= 2) {
            const label = r[0] ?? '';
            const val = r[1] ?? '';
            if (!label) continue;
            if (!labelsOrder.includes(label)) labelsOrder.push(label);
            if (!seriesMap.has('')) seriesMap.set('', new Map());
            seriesMap.get('')!.set(label, val);
          }
        }
        const xRowMigrated = labelsOrder.join('\t');
        const nextSeries: BarSeries[] = [];
        const keys = Array.from(seriesMap.keys());
        for (let i = 0; i < keys.length; i++) {
          const key = keys[i];
          const name = (key || '').trim() || `系列${i + 1}`;
          const m = seriesMap.get(key)!;
          const yCells = labelsOrder.map((lab) => m.get(lab) ?? '');
          nextSeries.push({ name, source: 'manual', axisMode: 'cols', yRow: yCells.join('\t'), tableSelection: undefined });
        }
        if (nextSeries.length > 0 && xRowMigrated) {
          barSeries = nextSeries;
        }
      }

      if (chartType === 'pie' && pieRows.length === 0 && manualText.trim()) {
        const lines = manualText.replace(/\r/g, '').split('\n').map((l) => l.trim()).filter(Boolean);
        const rows = lines.map((l) => l.split(/\t|,/).map((x) => x.trim()));
        pieRows = rows
          .map((r) => {
            if (r.length >= 2) return { label: r.length >= 3 ? (r[1] ?? '') : (r[0] ?? ''), value: r.length >= 3 ? (r[2] ?? '') : (r[1] ?? '') };
            return null;
          })
          .filter(Boolean) as PieRow[];
      }

      return {
        chartType,
        title: typeof parsed['title'] === 'string' ? (parsed['title'] as string) : '',
        xLabel: typeof parsed['xLabel'] === 'string' ? (parsed['xLabel'] as string) : '',
        yLabel: typeof parsed['yLabel'] === 'string' ? (parsed['yLabel'] as string) : '',
        legend: typeof parsed['legend'] === 'boolean' ? (parsed['legend'] as boolean) : true,
        dataSource,
        manualText,
        // legacy single-selection field kept for backward compatibility (non-scatter)
        tableSelection: legacySelection,
        scatterSeries,
        barXRow,
        barSeries,
        pieRows,
        pieAxisMode,
        pieTableSelection,
        imageUrl: typeof parsed['imageUrl'] === 'string' ? (parsed['imageUrl'] as string) : '',
      };
    } catch {
      return {
        chartType: 'scatter',
        title: '',
        xLabel: '',
        yLabel: '',
        legend: true,
        dataSource: 'manual',
        manualText: '',
        tableSelection: undefined,
        scatterSeries: [{ name: '系列1', source: 'manual', axisMode: 'cols', xRow: '', yRow: '', tableSelection: undefined }],
        barXRow: '',
        barSeries: [{ name: '系列1', source: 'manual', axisMode: 'cols', yRow: '', tableSelection: undefined }],
        pieRows: [{ label: '', value: '' }],
        pieAxisMode: 'cols',
        pieTableSelection: undefined,
        imageUrl: '',
      };
    }
  };

  const chart = block.type === 'chart' ? safeParseChartContent(block.content) : null;

  const updateChart = (partial: Partial<NonNullable<typeof chart>>) => {
    if (block.type !== 'chart') return;
    const payload = safeParseChartContent(block.content);
    const next = { ...payload, ...partial };
    onUpdate({ content: JSON.stringify(next) });
  };

  // (Legacy multi-row grid helpers removed; charts now use dedicated XY/name-value editors.)

  const setScatterSeries = (updater: (prev: ScatterSeries[]) => ScatterSeries[]) => {
    if (block.type !== 'chart') return;
    const payload = safeParseChartContent(block.content);
    const prev = (payload.scatterSeries ?? []) as ScatterSeries[];
    const next = updater(prev);
    updateChart({ scatterSeries: next } as Partial<NonNullable<typeof payload>>);
  };

  const applyLastTableSelectionToScatterAxis = (seriesIndex: number, axis: 'x' | 'y') => {
    if (block.type !== 'chart') return;
    const snap = lastTableSelection;
    if (!snap) return;
    setScatterSeries((prev) => {
      const next = prev.slice();
      const base: ScatterSeries = next[seriesIndex]
        ?? { name: `系列${seriesIndex + 1}`, xSource: 'manual', ySource: 'manual', xRow: '', yRow: '', xTableSelection: undefined, yTableSelection: undefined };

      const top = Math.min(snap.r1, snap.r2);
      const bottom = Math.max(snap.r1, snap.r2);
      const left = Math.min(snap.c1, snap.c2);
      const right = Math.max(snap.c1, snap.c2);

      // Reduce any rectangle to a 1D vector: if it's already 1 row/col keep it;
      // otherwise pick the longer dimension.
      const height = bottom - top;
      const width = right - left;
      const asRow = height === 0 || (height !== 0 && width >= height);
      const normalized: TableSelection = asRow
        ? { blockId: snap.blockId, r1: top, r2: top, c1: left, c2: right }
        : { blockId: snap.blockId, r1: top, r2: bottom, c1: left, c2: left };

      if (axis === 'x') {
        next[seriesIndex] = { ...base, xSource: 'table', xTableSelection: normalized };
      } else {
        next[seriesIndex] = { ...base, ySource: 'table', yTableSelection: normalized };
      }
      return next;
    });
  };

  const setBarSeries = (updater: (prev: BarSeries[]) => BarSeries[]) => {
    if (block.type !== 'chart') return;
    const payload = safeParseChartContent(block.content);
    const prev = (payload.barSeries ?? []) as BarSeries[];
    const next = updater(prev);
    updateChart({ barSeries: next } as Partial<NonNullable<typeof payload>>);
  };

  const applyLastTableSelectionToBarSeries = (seriesIndex: number) => {
    if (block.type !== 'chart') return;
    const snap = lastTableSelection;
    if (!snap) return;
    setBarSeries((prev) => {
      const next = prev.slice();
      const base: BarSeries = next[seriesIndex]
        ?? { name: `系列${seriesIndex + 1}`, source: 'table', axisMode: 'cols', yRow: '', tableSelection: undefined };

      const top = Math.min(snap.r1, snap.r2);
      const bottom = Math.max(snap.r1, snap.r2);
      const left = Math.min(snap.c1, snap.c2);
      const right = Math.max(snap.c1, snap.c2);
      const normalized = base.axisMode === 'rows'
        ? { blockId: snap.blockId, r1: top, r2: top + 1, c1: left, c2: right }
        : { blockId: snap.blockId, r1: top, r2: bottom, c1: left, c2: left + 1 };

      next[seriesIndex] = { ...base, source: 'table', tableSelection: normalized };
      return next;
    });
  };

  const applyLastTableSelectionToPie = () => {
    if (block.type !== 'chart') return;
    const snap = lastTableSelection;
    if (!snap) return;
    const payload = safeParseChartContent(block.content);

    const top = Math.min(snap.r1, snap.r2);
    const bottom = Math.max(snap.r1, snap.r2);
    const left = Math.min(snap.c1, snap.c2);
    const right = Math.max(snap.c1, snap.c2);
    const normalized = (payload.pieAxisMode ?? 'cols') === 'rows'
      ? { blockId: snap.blockId, r1: top, r2: top + 1, c1: left, c2: right }
      : { blockId: snap.blockId, r1: top, r2: bottom, c1: left, c2: left + 1 };

    updateChart({ dataSource: 'table', pieTableSelection: normalized });
  };

  const getTablePayloadById = (id: string) => {
    const tableBlock = allBlocks.find((b) => b.id === id && b.type === 'table');
    if (!tableBlock) return null;
    try {
      return normalizeTablePayload(parseTablePayload(tableBlock.content));
    } catch {
      return null;
    }
  };

  const getCellPlain = (payload: ReturnType<typeof getTablePayloadById>, r: number, c: number) => {
    if (!payload) return '';
    const cell = payload.cells?.[r]?.[c];
    if (!cell || cell.hidden) return '';
    return typstInlineToPlainText(cell.content ?? '').trim();
  };

  const parseTsvRow = (row: string | undefined) => (row ?? '').split('\t').map((x) => x.trim());

  const seriesToScatterData = (series: ScatterSeries, idx: number): Array<{ x: string | number; y: number; series?: string }> => {
    const label = (series.name ?? '').trim() || `系列${idx + 1}`;

    const readVectorFromSelection = (sel: TableSelection | undefined): string[] => {
      if (!sel?.blockId) return [];
      const payload = getTablePayloadById(sel.blockId);
      if (!payload) return [];
      const top = Math.min(sel.r1, sel.r2);
      const bottom = Math.max(sel.r1, sel.r2);
      const left = Math.min(sel.c1, sel.c2);
      const right = Math.max(sel.c1, sel.c2);

      // Enforce 1D: if single row => iterate columns; else treat as single column => iterate rows.
      const out: string[] = [];
      if (top === bottom) {
        for (let c = left; c <= right; c++) {
          out.push(getCellPlain(payload, top, c));
        }
        return out;
      }
      if (left === right) {
        for (let r = top; r <= bottom; r++) {
          out.push(getCellPlain(payload, r, left));
        }
        return out;
      }

      // If somehow a rectangle slipped in, pick the longer dimension.
      if ((right - left) >= (bottom - top)) {
        for (let c = left; c <= right; c++) out.push(getCellPlain(payload, top, c));
        return out;
      }
      for (let r = top; r <= bottom; r++) out.push(getCellPlain(payload, r, left));
      return out;
    };

    const xsRaw = (series.xSource ?? 'manual') === 'manual'
      ? parseTsvRow(series.xRow)
      : readVectorFromSelection(series.xTableSelection);
    const ysRaw = (series.ySource ?? 'manual') === 'manual'
      ? parseTsvRow(series.yRow)
      : readVectorFromSelection(series.yTableSelection);

    const xs = xsRaw.map((x) => (x ?? '').trim());
    const ys = ysRaw.map((y) => (y ?? '').trim());
    const n = Math.min(xs.length, ys.length);

    const out: Array<{ x: string | number; y: number; series?: string }> = [];
    for (let i = 0; i < n; i++) {
      const rawX = xs[i];
      const rawY = ys[i];
      if (!rawX) continue;
      const y = Number(rawY);
      if (!Number.isFinite(y)) continue;
      const asNum = Number(rawX);
      const x: string | number = Number.isFinite(asNum) && rawX !== '' ? asNum : rawX;
      if ((typeof x === 'string' && !x.trim())) continue;
      out.push({ x, y, series: label });
    }
    return out;
  };

  const barSeriesToData = (payload: ReturnType<typeof safeParseChartContent>) => {
    const series = (payload.barSeries ?? []) as BarSeries[];
    const safeSeries = series.length > 0
      ? series
      : [{ name: '系列1', source: 'manual', axisMode: 'cols', yRow: '', tableSelection: undefined }];

    const out: Array<{ label: string; value: number; series?: string }> = [];

    // Mixed mode: each series independently chooses manual or table.
    const xs = parseTsvRow(payload.barXRow).filter((x) => x.length > 0);

    for (let si = 0; si < safeSeries.length; si++) {
      const s = safeSeries[si];
      const seriesLabel = (s.name ?? '').trim() || `系列${si + 1}`;

      if ((s.source ?? 'manual') === 'manual') {
        const ys = parseTsvRow(s.yRow);
        const n = Math.min(xs.length, ys.length);
        for (let i = 0; i < n; i++) {
          const lab = xs[i];
          if (!lab) continue;
          const v = Number(ys[i]);
          if (!Number.isFinite(v)) continue;
          out.push({ label: lab, value: v, series: seriesLabel });
        }
        continue;
      }

      const sel = s.tableSelection;
      if (!sel?.blockId) continue;
      const tablePayload = getTablePayloadById(sel.blockId);
      if (!tablePayload) continue;
      const rows = tablePayload.rows;
      const cols = tablePayload.cols;
      const top = Math.min(sel.r1, sel.r2);
      const bottom = Math.max(sel.r1, sel.r2);
      const left = Math.min(sel.c1, sel.c2);
      const right = Math.max(sel.c1, sel.c2);

      if (s.axisMode === 'rows') {
        const rX = top;
        const rY = Math.min(rows - 1, top + 1);
        for (let c = left; c <= right; c++) {
          const lab = getCellPlain(tablePayload, rX, c);
          if (!lab) continue;
          const v = Number(getCellPlain(tablePayload, rY, c));
          if (!Number.isFinite(v)) continue;
          out.push({ label: lab, value: v, series: seriesLabel });
        }
      } else {
        const cX = left;
        const cY = Math.min(cols - 1, left + 1);
        for (let r = top; r <= bottom; r++) {
          const lab = getCellPlain(tablePayload, r, cX);
          if (!lab) continue;
          const v = Number(getCellPlain(tablePayload, r, cY));
          if (!Number.isFinite(v)) continue;
          out.push({ label: lab, value: v, series: seriesLabel });
        }
      }
    }

    return out;
  };

  const pieToData = (payload: ReturnType<typeof safeParseChartContent>) => {
    const out: Array<{ label: string; value: number }> = [];
    if ((payload.dataSource ?? 'manual') === 'manual') {
      const rows = (payload.pieRows ?? []) as PieRow[];
      for (const r of rows) {
        const label = (r.label ?? '').trim();
        const v = Number((r.value ?? '').trim());
        if (!label) continue;
        if (!Number.isFinite(v)) continue;
        out.push({ label, value: v });
      }
      return out;
    }

    const sel = payload.pieTableSelection;
    if (!sel?.blockId) return out;
    const tablePayload = getTablePayloadById(sel.blockId);
    if (!tablePayload) return out;
    const rows = tablePayload.rows;
    const cols = tablePayload.cols;
    const top = Math.min(sel.r1, sel.r2);
    const bottom = Math.max(sel.r1, sel.r2);
    const left = Math.min(sel.c1, sel.c2);
    const right = Math.max(sel.c1, sel.c2);
    const axisMode: TableAxisMode = payload.pieAxisMode === 'rows' ? 'rows' : 'cols';

    if (axisMode === 'rows') {
      const rL = top;
      const rV = Math.min(rows - 1, top + 1);
      for (let c = left; c <= right; c++) {
        const label = getCellPlain(tablePayload, rL, c);
        if (!label) continue;
        const v = Number(getCellPlain(tablePayload, rV, c));
        if (!Number.isFinite(v)) continue;
        out.push({ label, value: v });
      }
      return out;
    }

    const cL = left;
    const cV = Math.min(cols - 1, left + 1);
    for (let r = top; r <= bottom; r++) {
      const label = getCellPlain(tablePayload, r, cL);
      if (!label) continue;
      const v = Number(getCellPlain(tablePayload, r, cV));
      if (!Number.isFinite(v)) continue;
      out.push({ label, value: v });
    }
    return out;
  };

  const parseManualTextToData = (chartType: string, manualText: string) => {
    const lines = (manualText ?? '').split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
    const rows = lines.map((l) => l.split(/\t|,/).map((x) => x.trim()));

    if (chartType === 'scatter') {
      // [x,y] or [series,x,y]
      return rows
        .map((r) => {
          if (r.length >= 3) {
            const x = Number(r[1]);
            const y = Number(r[2]);
            if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
            return { series: r[0], x, y };
          }
          if (r.length >= 2) {
            const x = Number(r[0]);
            const y = Number(r[1]);
            if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
            return { x, y };
          }
          return null;
        })
        .filter(Boolean);
    }

    if (chartType === 'pie') {
      // [label,value] or [series,label,value]
      return rows
        .map((r) => {
          if (r.length >= 3) {
            const v = Number(r[2]);
            if (!Number.isFinite(v)) return null;
            return { series: r[0], label: r[1], value: v };
          }
          if (r.length >= 2) {
            const v = Number(r[1]);
            if (!Number.isFinite(v)) return null;
            return { label: r[0], value: v };
          }
          return null;
        })
        .filter(Boolean);
    }

    // bar/hbar: [label,value] or [series,label,value]
    return rows
      .map((r) => {
        if (r.length >= 3) {
          const v = Number(r[2]);
          if (!Number.isFinite(v)) return null;
          return { series: r[0], label: r[1], value: v };
        }
        if (r.length >= 2) {
          const v = Number(r[1]);
          if (!Number.isFinite(v)) return null;
          return { label: r[0], value: v };
        }
        return null;
      })
      .filter(Boolean);
  };

  const handleRenderChartClick = async () => {
    if (block.type !== 'chart') return;

    const payload = safeParseChartContent(block.content);
    const scatterSeries = ((payload.scatterSeries ?? []) as ScatterSeries[]);
    const data = payload.chartType === 'scatter'
      ? scatterSeries.flatMap((s, idx) => seriesToScatterData(s, idx))
      : (payload.chartType === 'bar' || payload.chartType === 'hbar')
        ? barSeriesToData(payload)
        : payload.chartType === 'pie'
          ? pieToData(payload)
          : (payload.dataSource === 'manual'
            ? parseManualTextToData(payload.chartType, payload.manualText)
            : []);

    const req: ChartRenderRequest = {
      chart_type: payload.chartType as ChartType,
      title: payload.title,
      x_label: payload.xLabel,
      y_label: payload.yLabel,
      legend: payload.legend,
      data: (data as Array<Record<string, unknown>>),
    };

    const url = await onRenderChart(req);
    const next = { ...payload, imageUrl: url };
    onUpdate({ content: JSON.stringify(next) });
  };

  // Close color picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (colorPickerRef.current && !colorPickerRef.current.contains(event.target as Node)) {
        setShowColorPicker(false);
      }
      if (tableColorPickerRef.current && !tableColorPickerRef.current.contains(event.target as Node)) {
        setShowTableColorPicker(false);
      }
      // Close inline math editor if clicking outside
      if (
        activeInlineMath &&
        !(event.target as HTMLElement).closest('.inline-math-editor') &&
        !(event.target as HTMLElement).closest('.inline-math-pill')
      ) {
        // Ensure the latest pill contents are persisted to block content
        if (activeInlineMath.scope === 'main') syncParagraphFromDom();
        else syncTableCellFromDom();
        setActiveInlineMath(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showColorPicker, activeInlineMath, syncParagraphFromDom, syncTableCellFromDom]);

  const getInlineMathRoot = (scope: 'main' | 'table'): HTMLDivElement | null => {
    return scope === 'main' ? paragraphEditorRef.current : tableCellEditorRef.current;
  };

  const getInlineMathPill = (scope: 'main' | 'table', id: string): HTMLElement | null => {
    const root = getInlineMathRoot(scope);
    if (!root) return null;
    return root.querySelector(`[data-inline-math-id="${id}"]`) as HTMLElement | null;
  };

  const updateInlineMathPillAttrs = (state: InlineMathState) => {
    const pill = getInlineMathPill(state.scope, state.id);
    if (!pill) return;
    pill.setAttribute('data-format', state.format);
    pill.setAttribute('data-latex', state.latex);
    pill.setAttribute('data-typst', state.typst);
  };

  const insertInlineMath = (scope: 'main' | 'table') => {
    const editor = getInlineMathRoot(scope);
    if (!editor) return;
    editor.focus();

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) return;

    const id = generateInlineMathId();
    const pill = document.createElement('span');
    pill.className = 'inline-math-pill';
    pill.setAttribute('data-inline-math-id', id);
    pill.setAttribute('data-format', 'latex');
    pill.setAttribute('data-latex', '');
    pill.setAttribute('data-typst', '');
    pill.contentEditable = 'false';
    pill.textContent = '∑';
    
    range.deleteContents();
    range.insertNode(pill);
    range.collapse(false);
    
    // Add a space after the pill to allow continuing typing
    const space = document.createTextNode('\u00A0');
    range.insertNode(space);
    range.collapse(false);

    if (scope === 'main') syncParagraphFromDom();
    else syncTableCellFromDom();
    setActiveInlineMath({ scope, id, format: 'latex', latex: '', typst: '' });
  };

  const handleRichEditorClick = (scope: 'main' | 'table', e: ReactMouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const pill = target.closest('.inline-math-pill') as HTMLElement | null;
    if (pill) {
      const id = pill.getAttribute('data-inline-math-id') ?? generateInlineMathId();
      // If this pill was generated from source and doesn't have an id yet, assign one.
      if (!pill.getAttribute('data-inline-math-id')) pill.setAttribute('data-inline-math-id', id);

      const typst = (pill.getAttribute('data-typst') ?? '').trim();
      const latex = (pill.getAttribute('data-latex') ?? '').trim() || (typst ? typstToLatexMath(typst) : '');
      const format = ((pill.getAttribute('data-format') ?? 'latex') as InlineMathFormat);
      setActiveInlineMath({ scope, id, format, latex, typst });
    }
  };

  const applyFormat = (format: 'bold' | 'italic' | 'strike' | 'color', color?: string) => {
    if (block.type !== 'paragraph' && block.type !== 'heading') return;
    const editor = paragraphEditorRef.current;
    if (!editor) return;
    editor.focus();

    // Use execCommand for native toggle behavior and better browser support
    if (format === 'bold') {
      document.execCommand('bold');
    } else if (format === 'italic') {
      document.execCommand('italic');
    } else if (format === 'strike') {
      document.execCommand('strikeThrough');
    } else if (format === 'color') {
      document.execCommand('foreColor', false, color ?? '#000000');
    }

    syncParagraphFromDom();
  };

  const applyList = (kind: 'ordered' | 'bullet') => {
    if (block.type !== 'paragraph' && block.type !== 'heading') return;
    const editor = paragraphEditorRef.current;
    if (!editor) return;
    editor.focus();
    document.execCommand(kind === 'ordered' ? 'insertOrderedList' : 'insertUnorderedList');
    syncParagraphFromDom();
  };

  const applyFormatToTableCell = (format: 'bold' | 'italic' | 'strike' | 'color', color?: string) => {
    const editor = tableCellEditorRef.current;
    if (!editor) return;
    editor.focus();

    if (format === 'bold') {
      document.execCommand('bold');
    } else if (format === 'italic') {
      document.execCommand('italic');
    } else if (format === 'strike') {
      document.execCommand('strikeThrough');
    } else if (format === 'color') {
      document.execCommand('foreColor', false, color ?? '#000000');
    }

    syncTableCellFromDom();
  };

  const applyListToTableCell = (kind: 'ordered' | 'bullet') => {
    const editor = tableCellEditorRef.current;
    if (!editor) return;
    editor.focus();
    document.execCommand(kind === 'ordered' ? 'insertOrderedList' : 'insertUnorderedList');
    syncTableCellFromDom();
  };

  const isSelectionInside = (root: HTMLElement, selector: string): HTMLElement | null => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const node = sel.anchorNode;
    if (!node) return null;
    const el = (node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node.parentElement) as HTMLElement | null;
    if (!el) return null;
    const closest = el.closest(selector) as HTMLElement | null;
    if (!closest) return null;
    return root.contains(closest) ? closest : null;
  };

  const moveCaretToStart = (el: HTMLElement) => {
    const sel = window.getSelection();
    if (!sel) return;
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  };

  const insertDivAfter = (afterEl: HTMLElement, text: string) => {
    const div = document.createElement('div');
    if (text) {
      div.textContent = text;
    } else {
      div.appendChild(document.createElement('br'));
    }

    const parent = afterEl.parentElement;
    if (!parent) return;
    if (afterEl.nextSibling) parent.insertBefore(div, afterEl.nextSibling);
    else parent.appendChild(div);

    moveCaretToStart(div);
  };

  const createEmptyLineDiv = (): HTMLDivElement => {
    const div = document.createElement('div');
    div.appendChild(document.createElement('br'));
    return div;
  };

  const handleEmptyListItemExit = (scope: 'main' | 'table', li: HTMLElement, list: HTMLElement) => {
    const editor = scope === 'main' ? paragraphEditorRef.current : tableCellEditorRef.current;
    if (!editor) return;

    // Remove current empty list item and convert it into a normal empty line (<div><br/></div>)
    // placed at the same logical position.
    const lineDiv = createEmptyLineDiv();

    const allLis = Array.from(list.children).filter((c) => (c as HTMLElement).tagName.toLowerCase() === 'li') as HTMLElement[];
    const liIndex = allLis.indexOf(li);
    const isOrdered = list.tagName.toLowerCase() === 'ol';

    // Collect following <li> siblings after the current one.
    const followingLis = allLis.slice(liIndex + 1);

    // Remove the current <li>
    li.remove();

    // If we have following items, split the list into two lists.
    let newList: HTMLElement | null = null;
    if (followingLis.length > 0) {
      newList = document.createElement(isOrdered ? 'ol' : 'ul');
      // Preserve start attr when present; browser uses it for numbering.
      const start = list.getAttribute('start');
      if (start) newList.setAttribute('start', start);
      for (const liEl of followingLis) {
        newList.appendChild(liEl);
      }
    }

    const parent = list.parentElement;
    if (!parent) return;

    // If list becomes empty, replace it with the empty line.
    const remainingLis = Array.from(list.children).filter((c) => (c as HTMLElement).tagName.toLowerCase() === 'li');
    if (remainingLis.length === 0) {
      parent.replaceChild(lineDiv, list);
      if (newList) parent.insertBefore(newList, lineDiv.nextSibling);
      moveCaretToStart(lineDiv);
    } else {
      // Insert the empty line either before or after the list depending on position,
      // or between the two split lists.
      if (liIndex <= 0) {
        parent.insertBefore(lineDiv, list);
        moveCaretToStart(lineDiv);
      } else {
        // Insert after the (possibly shortened) list.
        if (list.nextSibling) parent.insertBefore(lineDiv, list.nextSibling);
        else parent.appendChild(lineDiv);
        if (newList) {
          if (lineDiv.nextSibling) parent.insertBefore(newList, lineDiv.nextSibling);
          else parent.appendChild(newList);
        }
        moveCaretToStart(lineDiv);
      }
    }

    if (scope === 'main') syncParagraphFromDom();
    else syncTableCellFromDom();
  };

  const handleListBackspaceKey = (scope: 'main' | 'table', e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Backspace' || e.shiftKey || e.altKey || e.metaKey) return;
    const editor = scope === 'main' ? paragraphEditorRef.current : tableCellEditorRef.current;
    if (!editor) return;

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (!range.collapsed) return;

    const li = isSelectionInside(editor, 'li');
    if (!li) return;

    const list = li.closest('ol, ul') as HTMLElement | null;
    if (!list) return;

    // Only override Backspace when the list item is empty (shows only marker like "4." or "•").
    const text = (li.textContent ?? '').replace(/\u00A0/g, ' ').trim();
    if (text.length !== 0) return;

    e.preventDefault();
    handleEmptyListItemExit(scope, li, list);
  };

  const handleListEnterKey = (scope: 'main' | 'table', e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Enter' || e.shiftKey) return;
    const editor = scope === 'main' ? paragraphEditorRef.current : tableCellEditorRef.current;
    if (!editor) return;

    const li = isSelectionInside(editor, 'li');
    if (li) {
      // Common behavior: pressing Enter on an empty list item exits the list.
      const text = (li.textContent ?? '').replace(/\u00A0/g, ' ').trim();
      if (text.length === 0) {
        e.preventDefault();
        const list = li.closest('ol, ul') as HTMLElement | null;
        if (!list) return;
        handleEmptyListItemExit(scope, li, list);
      }
      return; // Let browser handle normal list continuation.
    }

    // Plain-text style continuation: "1. " -> "2. ", "- " -> "- "
    const lineEl = isSelectionInside(editor, 'div, p') as HTMLElement | null;
    if (!lineEl) return;
    const lineText = (lineEl.textContent ?? '').replace(/\u00A0/g, ' ');
    const ordered = lineText.match(/^\s*(\d+)[.)]\s*(.*)$/);
    const bullet = lineText.match(/^\s*[-*]\s*(.*)$/);

    if (ordered) {
      const n = parseInt(ordered[1], 10);
      const rest = (ordered[2] ?? '').trim();
      e.preventDefault();
      if (!rest) {
        insertDivAfter(lineEl, '');
      } else {
        insertDivAfter(lineEl, `${Math.max(1, n + 1)}. `);
      }
      if (scope === 'main') syncParagraphFromDom();
      else syncTableCellFromDom();
      return;
    }

    if (bullet) {
      const rest = (bullet[1] ?? '').trim();
      e.preventDefault();
      if (!rest) {
        insertDivAfter(lineEl, '');
      } else {
        insertDivAfter(lineEl, '- ');
      }
      if (scope === 'main') syncParagraphFromDom();
      else syncTableCellFromDom();
      return;
    }
  };

  const handleListKeyDown = (scope: 'main' | 'table', e: React.KeyboardEvent<HTMLDivElement>) => {
    handleListBackspaceKey(scope, e);
    handleListEnterKey(scope, e);
  };

  // Keep paragraph editor in sync when not actively editing.
  useEffect(() => {
    if (block.type !== 'paragraph' && block.type !== 'heading') return;
    if (isEditingParagraph) return;
    // While editing an inline formula, do not overwrite the contentEditable DOM;
    // otherwise the pill node gets replaced and edits appear to "disappear".
    if (activeInlineMath) return;
    if (!paragraphEditorRef.current) return;
    paragraphEditorRef.current.innerHTML = typstInlineToHtml(block.content ?? '');
  }, [block.content, block.type, isEditingParagraph, activeInlineMath]);

  useEffect(() => {
    if (block.type !== 'table') return;
    const payload = normalizeTablePayload(parseTablePayload(block.content));
    if (tableRowsInputRef.current) tableRowsInputRef.current.value = String(payload.rows);
    if (tableColsInputRef.current) tableColsInputRef.current.value = String(payload.cols);

    if (!activeTableCell) return;
    if (isEditingTableCell) return;
    if (activeInlineMath?.scope === 'table') return;
    const el = tableCellEditorRef.current;
    if (!el) return;
    const cell = payload.cells[activeTableCell.r]?.[activeTableCell.c];
    if (!cell || cell.hidden) return;
    el.innerHTML = typstInlineToHtml(cell.content ?? '');
  }, [block.content, block.type, activeTableCell, isEditingTableCell, activeInlineMath]);

  return (
    <div
      className="group relative border border-zinc-200 dark:border-zinc-700 rounded-lg p-3 hover:border-zinc-400 dark:hover:border-zinc-500 bg-white dark:bg-zinc-900 cursor-pointer"
      onClick={onClick}
    >
      {/* 工具栏 */}
      <div className="flex items-center gap-2 mb-2">
        <select
          value={block.type === 'list' ? 'paragraph' : block.type}
          onChange={(e) => {
            const nextType = e.target.value as BlockType;
            if (nextType === 'math' && block.type !== 'math') {
              onUpdate({
                type: nextType,
                content: '',
                mathFormat: 'latex',
                mathLatex: '',
                mathTypst: '',
              });
              return;
            }
            if (nextType === 'table' && block.type !== 'table') {
              onUpdate({
                type: nextType,
                content: JSON.stringify(defaultTablePayload(2, 2)),
              });
              return;
            }
            onUpdate({ type: nextType });
          }}
          className="text-xs px-2 py-1 border border-zinc-300 dark:border-zinc-600 rounded bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
        >
          <option value="heading">标题</option>
          <option value="paragraph">段落</option>
          <option value="code">代码</option>
          <option value="math">数学</option>
          <option value="image">图片</option>
          <option value="table">表格</option>
          <option value="chart">图表</option>
        </select>

        {block.type === 'heading' && (
          <select
            value={block.level || 1}
            onChange={(e) => onUpdate({ level: Number(e.target.value) })}
            className="text-xs px-2 py-1 border border-zinc-300 dark:border-zinc-600 rounded bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
          >
            {[1, 2, 3, 4, 5, 6].map(l => (
              <option key={l} value={l}>{['一', '二', '三', '四', '五', '六'][l - 1]}级标题</option>
            ))}
          </select>
        )}

        {block.type === 'code' && (
          <input
            type="text"
            value={block.language || 'python'}
            onChange={(e) => onUpdate({ language: e.target.value })}
            placeholder="语言"
            className="text-xs px-2 py-1 border border-zinc-300 dark:border-zinc-600 rounded bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 w-24"
          />
        )}

        <div className="ml-auto flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onMove('up')}
            disabled={isFirst}
            className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded disabled:opacity-30 disabled:cursor-not-allowed"
            title="上移"
          >
            <ChevronUp size={14} />
          </button>
          <button
            onClick={() => onMove('down')}
            disabled={isLast}
            className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded disabled:opacity-30 disabled:cursor-not-allowed"
            title="下移"
          >
            <ChevronDown size={14} />
          </button>
          <button
            onClick={onDelete}
            className="p-1 hover:bg-red-100 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 rounded"
            title="删除"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* 内容编辑 */}
      {block.type === 'code' ? (
        <textarea
          value={block.content}
          onChange={(e) => onUpdate({ content: e.target.value })}
          className="w-full p-2 font-mono text-sm border border-zinc-200 dark:border-zinc-700 rounded bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 resize-none"
          rows={Math.max(3, block.content.split('\n').length)}
          placeholder="输入代码..."
        />
      ) : block.type === 'chart' ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2 items-center">
            <label className="text-xs text-zinc-600 dark:text-zinc-400">类型</label>
            <select
              value={chart?.chartType ?? 'scatter'}
              onChange={(e) => {
                updateChart({ chartType: e.target.value as ChartType });
              }}
              className="text-xs px-2 py-1 border border-zinc-300 dark:border-zinc-600 rounded bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
            >
              <option value="scatter">散点图</option>
              <option value="bar">柱形图</option>
              <option value="pie">饼图</option>
              <option value="hbar">条形图</option>
            </select>

            <label className="text-xs text-zinc-600 dark:text-zinc-400 ml-2">图例</label>
            <input
              type="checkbox"
              checked={!!chart?.legend}
              onChange={(e) => {
                updateChart({ legend: e.target.checked });
              }}
            />
          </div>

          <div>
            <label className="text-xs text-zinc-600 dark:text-zinc-400 block mb-2">
              宽度: {(() => {
                const w = block.width || '100%';
                return parseFloat(w) || 100;
              })()}%
            </label>
            <input
              type="range"
              min="0"
              max="100"
              value={(() => {
                const w = block.width || '100%';
                return parseFloat(w) || 100;
              })()}
              onChange={(e) => {
                const val = e.target.value;
                onUpdate({ width: `${val}%` });
              }}
              className="w-full h-2 bg-zinc-200 dark:bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
          </div>

          <input
            type="text"
            value={chart?.title ?? ''}
            onChange={(e) => {
              updateChart({ title: e.target.value });
            }}
            className="w-full p-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100"
            placeholder="图表标题"
          />

          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              value={chart?.xLabel ?? ''}
              onChange={(e) => {
                updateChart({ xLabel: e.target.value });
              }}
              className="w-full p-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100"
              placeholder="X 轴标签"
            />
            <input
              type="text"
              value={chart?.yLabel ?? ''}
              onChange={(e) => {
                updateChart({ yLabel: e.target.value });
              }}
              className="w-full p-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100"
              placeholder="Y 轴标签"
            />
          </div>

          {(chart?.chartType ?? 'scatter') === 'pie' ? (
            <div className="flex items-center gap-3 flex-wrap">
              <label className="text-xs text-zinc-600 dark:text-zinc-400">数据来源</label>
              <label className="text-xs flex items-center gap-1">
                <input
                  type="radio"
                  name={`chart-source-${block.id}`}
                  checked={(chart?.dataSource ?? 'manual') === 'manual'}
                  onChange={() => updateChart({ dataSource: 'manual' })}
                />
                手动输入
              </label>
              <label className="text-xs flex items-center gap-1">
                <input
                  type="radio"
                  name={`chart-source-${block.id}`}
                  checked={(chart?.dataSource ?? 'manual') === 'table'}
                  onChange={() => updateChart({ dataSource: 'table' })}
                />
                从表格导入
              </label>
            </div>
          ) : null}

          {(chart?.chartType ?? 'scatter') === 'scatter' ? (
            <div className="flex flex-col gap-3">
              {(() => {
                const series = (chart?.scatterSeries ?? []) as ScatterSeries[];
                const safeSeries: ScatterSeries[] = series.length > 0
                  ? series
                  : [{ name: '系列1', xSource: 'manual', ySource: 'manual', xRow: '', yRow: '', xTableSelection: undefined, yTableSelection: undefined }];

                const upsertSeries = (idx: number, patch: Partial<(typeof safeSeries)[number]>) => {
                  setScatterSeries((prev) => {
                    const base: ScatterSeries[] = prev.length > 0 ? prev : safeSeries;
                    const next = base.slice();
                    const cur: ScatterSeries = next[idx]
                      ?? safeSeries[idx]
                      ?? { name: `系列${idx + 1}`, xSource: 'manual', ySource: 'manual', xRow: '', yRow: '', xTableSelection: undefined, yTableSelection: undefined };
                    next[idx] = { ...cur, ...patch } as ScatterSeries;
                    return next;
                  });
                };

                const removeSeries = (idx: number) => {
                  setScatterSeries((prev) => {
                    const next = prev.slice();
                    next.splice(idx, 1);
                    return next.length > 0
                      ? next
                      : [{ name: '系列1', xSource: 'manual', ySource: 'manual', xRow: '', yRow: '', xTableSelection: undefined, yTableSelection: undefined }];
                  });
                };

                const addSeries = () => {
                  setScatterSeries((prev) => {
                    const next = prev.slice();
                    const n = next.length + 1;
                    next.push({ name: `系列${n}`, xSource: 'manual', ySource: 'manual', xRow: '', yRow: '', xTableSelection: undefined, yTableSelection: undefined });
                    return next;
                  });
                };

                const parseRow = (row: string | undefined) => (row ?? '').split('\t');
                const toRow = (cells: string[]) => {
                  // Keep a compact row; trailing empties trimmed.
                  let end = cells.length - 1;
                  while (end >= 0 && (cells[end] ?? '').trim() === '') end--;
                  const trimmed = cells.slice(0, Math.max(0, end + 1));
                  return trimmed.join('\t');
                };

                const renderManualAxisRow = (axis: 'x' | 'y', s: ScatterSeries, idx: number) => {
                  const rowText = axis === 'x' ? (s.xRow ?? '') : (s.yRow ?? '');
                  const cells0 = parseRow(rowText);
                  const cols = Math.max(10, cells0.length + 2);
                  const cells = Array.from({ length: cols }, (_, i) => cells0[i] ?? '');

                  const setCell = (c: number, val: string) => {
                    const next = cells.slice();
                    next[c] = val;
                    if (axis === 'x') upsertSeries(idx, { xRow: toRow(next) });
                    else upsertSeries(idx, { yRow: toRow(next) });
                  };

                  const handlePaste = (e: ReactClipboardEvent<HTMLInputElement>, c0: number) => {
                    const text = e.clipboardData.getData('text/plain');
                    if (!text) return;
                    if (!/\t|\n|\r/.test(text)) return;
                    e.preventDefault();
                    const firstLine = text.replace(/\r/g, '').split('\n')[0] ?? '';
                    const parts = firstLine.split('\t');
                    const next = cells.slice();
                    for (let dc = 0; dc < parts.length; dc++) {
                      const cc = c0 + dc;
                      if (cc >= cols) continue;
                      next[cc] = parts[dc] ?? '';
                    }
                    if (axis === 'x') upsertSeries(idx, { xRow: toRow(next) });
                    else upsertSeries(idx, { yRow: toRow(next) });
                  };

                  return (
                    <div className="overflow-auto border border-zinc-200 dark:border-zinc-700 rounded">
                      <table className="w-full text-xs border-collapse">
                        <tbody>
                          <tr>
                            <td className="border border-zinc-200 dark:border-zinc-700 px-2 py-1 bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 w-10">{axis.toUpperCase()}</td>
                            {cells.map((cell, c) => (
                              <td key={c} className="border border-zinc-200 dark:border-zinc-700 p-0">
                                <input
                                  type="text"
                                  value={cell}
                                  onChange={(e) => setCell(c, e.target.value)}
                                  onPaste={(e) => handlePaste(e, c)}
                                  className="w-full px-2 py-1 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 outline-none"
                                />
                              </td>
                            ))}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  );
                };

                const isInRect = (r: number, c: number, sel: { r1: number; c1: number; r2: number; c2: number } | undefined) => {
                  if (!sel) return false;
                  const top = Math.min(sel.r1, sel.r2);
                  const bottom = Math.max(sel.r1, sel.r2);
                  const left = Math.min(sel.c1, sel.c2);
                  const right = Math.max(sel.c1, sel.c2);
                  return r >= top && r <= bottom && c >= left && c <= right;
                };

                const renderAxisTableSelector = (axis: 'x' | 'y', s: ScatterSeries, idx: number) => {
                  const sel = axis === 'x' ? s.xTableSelection : s.yTableSelection;
                  const blockId = sel?.blockId ?? '';
                  const tablePayload = blockId ? getTablePayloadById(blockId) : null;
                  const rows = tablePayload?.rows ?? 0;
                  const cols = tablePayload?.cols ?? 0;

                  const pickKey = `scatter-${axis}-${block.id}-${idx}`;

                  const constrainToVector = (anchor: { r: number; c: number }, r: number, c: number) => {
                    const dr = Math.abs(r - anchor.r);
                    const dc = Math.abs(c - anchor.c);
                    // Prefer row-vector when horizontal movement dominates.
                    if (dc >= dr) {
                      const left = Math.min(anchor.c, c);
                      const right = Math.max(anchor.c, c);
                      const rr = Math.max(0, Math.min(rows - 1, anchor.r));
                      return { r1: rr, r2: rr, c1: Math.max(0, Math.min(cols - 1, left)), c2: Math.max(0, Math.min(cols - 1, right)) };
                    }
                    const top = Math.min(anchor.r, r);
                    const bottom = Math.max(anchor.r, r);
                    const cc = Math.max(0, Math.min(cols - 1, anchor.c));
                    return { r1: Math.max(0, Math.min(rows - 1, top)), r2: Math.max(0, Math.min(rows - 1, bottom)), c1: cc, c2: cc };
                  };

                  const pickCell = (e: ReactMouseEvent, r: number, c: number) => {
                    e.preventDefault();
                    if (!blockId) return;

                    const anchor = chartPickAnchor && chartPickAnchor.key === pickKey ? chartPickAnchor : null;
                    const curSel = sel;

                    if (chartSelectionMode) {
                      if (!curSel || (curSel.r1 === curSel.r2 && curSel.c1 === curSel.c2) === false) {
                        setChartPickAnchor({ key: pickKey, r, c });
                        const nextSel: TableSelection = { blockId, r1: r, r2: r, c1: c, c2: c };
                        if (axis === 'x') upsertSeries(idx, { xSource: 'table', xTableSelection: nextSel });
                        else upsertSeries(idx, { ySource: 'table', yTableSelection: nextSel });
                        return;
                      }
                      // Use existing single cell as anchor.
                      setChartPickAnchor(null);
                      const a = { r: curSel.r1, c: curSel.c1 };
                      const constrained = constrainToVector(a, r, c);
                      const nextSel: TableSelection = { blockId, ...constrained };
                      if (axis === 'x') upsertSeries(idx, { xSource: 'table', xTableSelection: nextSel });
                      else upsertSeries(idx, { ySource: 'table', yTableSelection: nextSel });
                      return;
                    }

                    if (e.shiftKey && anchor) {
                      const constrained = constrainToVector({ r: anchor.r, c: anchor.c }, r, c);
                      const nextSel: TableSelection = { blockId, ...constrained };
                      if (axis === 'x') upsertSeries(idx, { xSource: 'table', xTableSelection: nextSel });
                      else upsertSeries(idx, { ySource: 'table', yTableSelection: nextSel });
                      return;
                    }

                    setChartPickAnchor({ key: pickKey, r, c });
                    const nextSel: TableSelection = { blockId, r1: r, r2: r, c1: c, c2: c };
                    if (axis === 'x') upsertSeries(idx, { xSource: 'table', xTableSelection: nextSel });
                    else upsertSeries(idx, { ySource: 'table', yTableSelection: nextSel });
                  };

                  return (
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <label className="text-xs text-zinc-600 dark:text-zinc-400">表格</label>
                        <select
                          value={blockId}
                          onChange={(e) => {
                            const nextId = e.target.value;
                            if (!nextId) {
                              if (axis === 'x') upsertSeries(idx, { xTableSelection: undefined });
                              else upsertSeries(idx, { yTableSelection: undefined });
                              return;
                            }
                            // Default selection: first row, 10 columns.
                            const nextSel: TableSelection = { blockId: nextId, r1: 0, r2: 0, c1: 0, c2: 9 };
                            if (axis === 'x') upsertSeries(idx, { xSource: 'table', xTableSelection: nextSel });
                            else upsertSeries(idx, { ySource: 'table', yTableSelection: nextSel });
                          }}
                          className="text-xs px-2 py-1 border border-zinc-300 dark:border-zinc-600 rounded bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
                        >
                          <option value="">请选择表格</option>
                          {availableTables.map((t) => (
                            <option key={t.id} value={t.id}>{t.label}</option>
                          ))}
                        </select>

                        <button
                          type="button"
                          onClick={() => applyLastTableSelectionToScatterAxis(idx, axis)}
                          disabled={!lastTableSelection}
                          className="ml-auto px-2 py-1 text-xs rounded border border-zinc-300 dark:border-zinc-600 disabled:opacity-40"
                          title={lastTableSelection ? '使用最近一次在表格块中框选的区域' : '请先在任意表格块中框选一块区域'}
                        >
                          使用最近选区
                        </button>

                        <button
                          type="button"
                          onClick={() => setChartSelectionMode((v) => !v)}
                          className={`px-2 py-1 text-xs rounded flex items-center gap-1 border border-zinc-300 dark:border-zinc-600 transition-colors ${
                            chartSelectionMode
                              ? 'bg-blue-500 hover:bg-blue-600 text-white'
                              : 'bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 text-zinc-700 dark:text-zinc-300'
                          }`}
                          title={chartSelectionMode ? '已开启：点击两次即可框选' : '开启：无需按 Shift 框选区域'}
                        >
                          <MousePointer2 size={14} />
                          选区模式
                        </button>
                      </div>

                      {tablePayload ? (
                        <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                          {chartSelectionMode
                            ? '选区模式：第一次点击设定起点；第二次点击设定终点。'
                            : '普通模式：点击设定起点；Shift+点击设定终点。'} 会自动约束为 1 行或 1 列（按拖动方向）。
                        </div>
                      ) : (
                        <div className="text-[11px] text-zinc-500 dark:text-zinc-400">先选择一个表格。</div>
                      )}

                      {tablePayload ? (
                        <div className="overflow-auto border border-zinc-200 dark:border-zinc-700 rounded max-h-72">
                          <table className="w-full text-xs border-collapse">
                            <tbody>
                              {Array.from({ length: rows }, (_, r) => (
                                <tr key={r}>
                                  {Array.from({ length: cols }, (_, c) => {
                                    const active = isInRect(r, c, sel);
                                    return (
                                      <td
                                        key={c}
                                        onMouseDown={(e) => pickCell(e, r, c)}
                                        className={`border border-zinc-200 dark:border-zinc-700 px-2 py-1 select-none cursor-pointer ${
                                          active ? 'bg-blue-100 dark:bg-blue-900/25' : 'bg-white dark:bg-zinc-950'
                                        }`}
                                        title={`R${r + 1}C${c + 1}`}
                                      >
                                        {getCellPlain(tablePayload, r, c)}
                                      </td>
                                    );
                                  })}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : null}
                    </div>
                  );
                };

                return (
                  <div className="flex flex-col gap-3">
                    {safeSeries.map((s, idx) => (
                      <div key={idx} className="border border-zinc-200 dark:border-zinc-700 rounded p-2 flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-zinc-600 dark:text-zinc-400">系列 {idx + 1}</span>
                          <input
                            type="text"
                            value={s.name}
                            onChange={(e) => upsertSeries(idx, { name: e.target.value })}
                            className="flex-1 px-2 py-1 text-xs border border-zinc-300 dark:border-zinc-600 rounded bg-white dark:bg-zinc-800"
                            placeholder="系列名称（可选）"
                          />
                          {safeSeries.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeSeries(idx)}
                              className="px-2 py-1 text-xs rounded border border-zinc-300 dark:border-zinc-600"
                              title="删除该系列"
                            >
                              删除
                            </button>
                          )}
                        </div>

                        <div className="flex flex-col gap-2">
                          <div className="flex items-center gap-3 flex-wrap">
                            <span className="text-xs text-zinc-600 dark:text-zinc-400">X</span>
                            <label className="text-xs flex items-center gap-1">
                              <input
                                type="radio"
                                name={`scatter-x-source-${block.id}-${idx}`}
                                checked={(s.xSource ?? 'manual') === 'manual'}
                                onChange={() => upsertSeries(idx, { xSource: 'manual' })}
                              />
                              手动
                            </label>
                            <label className="text-xs flex items-center gap-1">
                              <input
                                type="radio"
                                name={`scatter-x-source-${block.id}-${idx}`}
                                checked={(s.xSource ?? 'manual') === 'table'}
                                onChange={() => {
                                  const existing = s.xTableSelection;
                                  const fallbackTableId = availableTables[0]?.id ?? '';
                                  const nextSel = existing?.blockId
                                    ? existing
                                    : (fallbackTableId
                                      ? { blockId: fallbackTableId, r1: 0, r2: 0, c1: 0, c2: 9 }
                                      : undefined);
                                  upsertSeries(idx, { xSource: 'table', xTableSelection: nextSel });
                                }}
                              />
                              表格
                            </label>
                          </div>

                          {(s.xSource ?? 'manual') === 'manual'
                            ? renderManualAxisRow('x', s, idx)
                            : renderAxisTableSelector('x', s, idx)}
                        </div>

                        <div className="flex flex-col gap-2">
                          <div className="flex items-center gap-3 flex-wrap">
                            <span className="text-xs text-zinc-600 dark:text-zinc-400">Y</span>
                            <label className="text-xs flex items-center gap-1">
                              <input
                                type="radio"
                                name={`scatter-y-source-${block.id}-${idx}`}
                                checked={(s.ySource ?? 'manual') === 'manual'}
                                onChange={() => upsertSeries(idx, { ySource: 'manual' })}
                              />
                              手动
                            </label>
                            <label className="text-xs flex items-center gap-1">
                              <input
                                type="radio"
                                name={`scatter-y-source-${block.id}-${idx}`}
                                checked={(s.ySource ?? 'manual') === 'table'}
                                onChange={() => {
                                  const existing = s.yTableSelection;
                                  const fallbackTableId = availableTables[0]?.id ?? '';
                                  const nextSel = existing?.blockId
                                    ? existing
                                    : (fallbackTableId
                                      ? { blockId: fallbackTableId, r1: 0, r2: 0, c1: 0, c2: 9 }
                                      : undefined);
                                  upsertSeries(idx, { ySource: 'table', yTableSelection: nextSel });
                                }}
                              />
                              表格
                            </label>
                          </div>

                          {(s.ySource ?? 'manual') === 'manual'
                            ? renderManualAxisRow('y', s, idx)
                            : renderAxisTableSelector('y', s, idx)}
                        </div>
                      </div>
                    ))}

                    <div className="flex">
                      <button
                        type="button"
                        onClick={addSeries}
                        className="px-2 py-1 text-xs rounded border border-zinc-300 dark:border-zinc-600"
                      >
                        + 添加系列
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>
          ) : ((chart?.chartType ?? 'scatter') === 'bar' || (chart?.chartType ?? 'scatter') === 'hbar') ? (
            <div className="flex flex-col gap-3">
              {(() => {
                const series = (chart?.barSeries ?? []) as BarSeries[];
                const safeSeries: BarSeries[] = series.length > 0
                  ? series
                  : [{ name: '系列1', source: 'manual', axisMode: 'cols', yRow: '', tableSelection: undefined }];

                const upsert = (idx: number, patch: Partial<BarSeries>) => {
                  setBarSeries((prev) => {
                    const base = prev.length > 0 ? prev : safeSeries;
                    const next = base.slice();
                    const cur = next[idx]
                      ?? safeSeries[idx]
                      ?? { name: `系列${idx + 1}`, source: 'manual', axisMode: 'cols', yRow: '', tableSelection: undefined };
                    next[idx] = { ...cur, ...patch } as BarSeries;
                    return next;
                  });
                };

                const removeSeries = (idx: number) => {
                  setBarSeries((prev) => {
                    const next = prev.slice();
                    next.splice(idx, 1);
                    return next.length > 0
                      ? next
                      : [{ name: '系列1', source: 'manual', axisMode: 'cols', yRow: '', tableSelection: undefined }];
                  });
                };

                const addSeries = () => {
                  setBarSeries((prev) => {
                    const next = prev.slice();
                    const n = next.length + 1;
                    next.push({ name: `系列${n}`, source: 'manual', axisMode: 'cols', yRow: '', tableSelection: undefined });
                    return next;
                  });
                };

                const parseRow = (row: string | undefined) => (row ?? '').split('\t');
                const toRow = (cells: string[]) => {
                  let end = cells.length - 1;
                  while (end >= 0 && (cells[end] ?? '').trim() === '') end--;
                  const trimmed = cells.slice(0, Math.max(0, end + 1));
                  return trimmed.join('\t');
                };

                const anyManual = safeSeries.some((s) => (s.source ?? 'manual') === 'manual');

                const renderXRow = () => {
                  const xCells0 = parseRow(chart?.barXRow);
                  const cols = Math.max(10, xCells0.length + 2);
                  const xCells = Array.from({ length: cols }, (_, i) => xCells0[i] ?? '');
                  const setCell = (c: number, val: string) => {
                    const next = xCells.slice();
                    next[c] = val;
                    updateChart({ barXRow: toRow(next) });
                  };
                  const handlePaste = (e: ReactClipboardEvent<HTMLInputElement>, c0: number) => {
                    const text = e.clipboardData.getData('text/plain');
                    if (!text) return;
                    if (!/\t|\n|\r/.test(text)) return;
                    e.preventDefault();
                    const pasteRows = text.replace(/\r/g, '').split('\n').map((l) => l.split('\t'));
                    const next = xCells.slice();
                    for (let dc = 0; dc < (pasteRows[0]?.length ?? 0); dc++) {
                      const cc = c0 + dc;
                      if (cc >= cols) continue;
                      next[cc] = pasteRows[0][dc] ?? '';
                    }
                    updateChart({ barXRow: toRow(next) });
                  };
                  return (
                    <div className="overflow-auto border border-zinc-200 dark:border-zinc-700 rounded">
                      <table className="w-full text-xs border-collapse">
                        <tbody>
                          <tr>
                            <td className="border border-zinc-200 dark:border-zinc-700 px-2 py-1 bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 w-10">X</td>
                            {xCells.map((cell, c) => (
                              <td key={c} className="border border-zinc-200 dark:border-zinc-700 p-0">
                                <input
                                  type="text"
                                  value={cell}
                                  onChange={(e) => setCell(c, e.target.value)}
                                  onPaste={(e) => handlePaste(e, c)}
                                  className="w-full px-2 py-1 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 outline-none"
                                />
                              </td>
                            ))}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  );
                };

                const renderYRow = (s: BarSeries, idx: number) => {
                  const yCells0 = parseRow(s.yRow);
                  const cols = Math.max(10, (chart?.barXRow ?? '').split('\t').length + 2, yCells0.length + 2);
                  const yCells = Array.from({ length: cols }, (_, i) => yCells0[i] ?? '');
                  const setCell = (c: number, val: string) => {
                    const next = yCells.slice();
                    next[c] = val;
                    upsert(idx, { yRow: toRow(next) });
                  };
                  const handlePaste = (e: ReactClipboardEvent<HTMLInputElement>, c0: number) => {
                    const text = e.clipboardData.getData('text/plain');
                    if (!text) return;
                    if (!/\t|\n|\r/.test(text)) return;
                    e.preventDefault();
                    const pasteRows = text.replace(/\r/g, '').split('\n').map((l) => l.split('\t'));
                    const next = yCells.slice();
                    for (let dc = 0; dc < (pasteRows[0]?.length ?? 0); dc++) {
                      const cc = c0 + dc;
                      if (cc >= cols) continue;
                      next[cc] = pasteRows[0][dc] ?? '';
                    }
                    upsert(idx, { yRow: toRow(next) });
                  };
                  return (
                    <div className="overflow-auto border border-zinc-200 dark:border-zinc-700 rounded">
                      <table className="w-full text-xs border-collapse">
                        <tbody>
                          <tr>
                            <td className="border border-zinc-200 dark:border-zinc-700 px-2 py-1 bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 w-10">Y</td>
                            {yCells.map((cell, c) => (
                              <td key={c} className="border border-zinc-200 dark:border-zinc-700 p-0">
                                <input
                                  type="text"
                                  value={cell}
                                  onChange={(e) => setCell(c, e.target.value)}
                                  onPaste={(e) => handlePaste(e, c)}
                                  className="w-full px-2 py-1 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 outline-none"
                                />
                              </td>
                            ))}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  );
                };

                const isInRect = (r: number, c: number, sel: { r1: number; c1: number; r2: number; c2: number } | undefined) => {
                  if (!sel) return false;
                  const top = Math.min(sel.r1, sel.r2);
                  const bottom = Math.max(sel.r1, sel.r2);
                  const left = Math.min(sel.c1, sel.c2);
                  const right = Math.max(sel.c1, sel.c2);
                  return r >= top && r <= bottom && c >= left && c <= right;
                };

                const renderTableSelector = (s: BarSeries, idx: number) => {
                  const blockId = s.tableSelection?.blockId ?? '';
                  const tablePayload = blockId ? getTablePayloadById(blockId) : null;
                  const rows = tablePayload?.rows ?? 0;
                  const cols = tablePayload?.cols ?? 0;
                  const sel = s.tableSelection;
                  const pickKey = `bar-${block.id}-${idx}`;

                  const constrainTo2Axis = (
                    axisMode: TableAxisMode,
                    rect: { r1: number; c1: number; r2: number; c2: number },
                  ) => {
                    const top = Math.min(rect.r1, rect.r2);
                    const bottom = Math.max(rect.r1, rect.r2);
                    const left = Math.min(rect.c1, rect.c2);
                    const right = Math.max(rect.c1, rect.c2);
                    if (axisMode === 'rows') {
                      const r1 = Math.max(0, Math.min(rows - 1, top));
                      const r2 = Math.max(0, Math.min(rows - 1, r1 + 1));
                      return { r1, r2, c1: left, c2: right };
                    }
                    const c1 = Math.max(0, Math.min(cols - 1, left));
                    const c2 = Math.max(0, Math.min(cols - 1, c1 + 1));
                    return { r1: top, r2: bottom, c1, c2 };
                  };

                  const pickCell = (e: ReactMouseEvent, r: number, c: number) => {
                    e.preventDefault();
                    if (!blockId) return;

                    const anchor = chartPickAnchor && chartPickAnchor.key === pickKey ? chartPickAnchor : null;

                    if (chartSelectionMode) {
                      if (!sel || sel.r1 !== sel.r2 || sel.c1 !== sel.c2) {
                        setChartPickAnchor({ key: pickKey, r, c });
                        upsert(idx, { tableSelection: { blockId, r1: r, c1: c, r2: r, c2: c } });
                        return;
                      }
                      setChartPickAnchor(null);
                      const constrained = constrainTo2Axis(s.axisMode, { r1: sel.r1, c1: sel.c1, r2: r, c2: c });
                      upsert(idx, { tableSelection: { blockId, ...constrained } });
                      return;
                    }

                    if (e.shiftKey && anchor) {
                      const constrained = constrainTo2Axis(s.axisMode, { r1: anchor.r, c1: anchor.c, r2: r, c2: c });
                      upsert(idx, { tableSelection: { blockId, ...constrained } });
                      return;
                    }

                    setChartPickAnchor({ key: pickKey, r, c });
                    upsert(idx, { tableSelection: { blockId, r1: r, c1: c, r2: r, c2: c } });
                  };

                  return (
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <label className="text-xs text-zinc-600 dark:text-zinc-400">表格</label>
                        <select
                          value={blockId}
                          onChange={(e) => {
                            const nextId = e.target.value;
                            if (!nextId) {
                              upsert(idx, { tableSelection: undefined });
                              return;
                            }
                            upsert(idx, { tableSelection: { blockId: nextId, r1: 0, r2: 9, c1: 0, c2: 1 } });
                          }}
                          className="text-xs px-2 py-1 border border-zinc-300 dark:border-zinc-600 rounded bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
                        >
                          <option value="">请选择表格</option>
                          {availableTables.map((t) => (
                            <option key={t.id} value={t.id}>{t.label}</option>
                          ))}
                        </select>

                        <label className="text-xs text-zinc-600 dark:text-zinc-400 ml-2">X/Y 方向</label>
                        <label className="text-xs flex items-center gap-1">
                          <input
                            type="radio"
                            name={`bar-axis-${block.id}-${idx}`}
                            checked={s.axisMode === 'cols'}
                            onChange={() => {
                              const cur = s.tableSelection;
                              if (!cur?.blockId) {
                                upsert(idx, { axisMode: 'cols' });
                                return;
                              }
                              const left = Math.min(cur.c1, cur.c2);
                              upsert(idx, { axisMode: 'cols', tableSelection: { ...cur, c1: left, c2: left + 1 } });
                            }}
                          />
                          按列（X=左列，Y=右列）
                        </label>
                        <label className="text-xs flex items-center gap-1">
                          <input
                            type="radio"
                            name={`bar-axis-${block.id}-${idx}`}
                            checked={s.axisMode === 'rows'}
                            onChange={() => {
                              const cur = s.tableSelection;
                              if (!cur?.blockId) {
                                upsert(idx, { axisMode: 'rows' });
                                return;
                              }
                              const top = Math.min(cur.r1, cur.r2);
                              upsert(idx, { axisMode: 'rows', tableSelection: { ...cur, r1: top, r2: top + 1 } });
                            }}
                          />
                          按行（X=上行，Y=下行）
                        </label>

                        <button
                          type="button"
                          onClick={() => applyLastTableSelectionToBarSeries(idx)}
                          disabled={!lastTableSelection}
                          className="ml-auto px-2 py-1 text-xs rounded border border-zinc-300 dark:border-zinc-600 disabled:opacity-40"
                          title={lastTableSelection ? '使用最近一次在表格块中框选的区域' : '请先在任意表格块中框选一块区域'}
                        >
                          使用最近选区
                        </button>

                        <button
                          type="button"
                          onClick={() => setChartSelectionMode((v) => !v)}
                          className={`px-2 py-1 text-xs rounded flex items-center gap-1 border border-zinc-300 dark:border-zinc-600 transition-colors ${
                            chartSelectionMode
                              ? 'bg-blue-500 hover:bg-blue-600 text-white'
                              : 'bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 text-zinc-700 dark:text-zinc-300'
                          }`}
                          title={chartSelectionMode ? '已开启：点击两次即可框选' : '开启：无需按 Shift 框选区域'}
                        >
                          <MousePointer2 size={14} />
                          选区模式
                        </button>
                      </div>

                      {tablePayload ? (
                        <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                          {chartSelectionMode
                            ? '选区模式：第一次点击设定起点；第二次点击设定终点。'
                            : '普通模式：点击设定起点；Shift+点击设定终点。'} 会按上面的“方向”自动约束为 2 行或 2 列。
                        </div>
                      ) : (
                        <div className="text-[11px] text-zinc-500 dark:text-zinc-400">先选择一个表格。</div>
                      )}

                      {tablePayload ? (
                        <div className="overflow-auto border border-zinc-200 dark:border-zinc-700 rounded max-h-72">
                          <table className="w-full text-xs border-collapse">
                            <tbody>
                              {Array.from({ length: rows }, (_, r) => (
                                <tr key={r}>
                                  {Array.from({ length: cols }, (_, c) => {
                                    const active = isInRect(r, c, sel);
                                    return (
                                      <td
                                        key={c}
                                        onMouseDown={(e) => pickCell(e, r, c)}
                                        className={`border border-zinc-200 dark:border-zinc-700 px-2 py-1 select-none cursor-pointer ${
                                          active ? 'bg-blue-100 dark:bg-blue-900/25' : 'bg-white dark:bg-zinc-950'
                                        }`}
                                        title={`R${r + 1}C${c + 1}`}
                                      >
                                        {getCellPlain(tablePayload, r, c)}
                                      </td>
                                    );
                                  })}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : null}
                    </div>
                  );
                };

                return (
                  <div className="flex flex-col gap-3">
                    <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      每个系列可独立选择手动或表格导入。
                    </div>

                    {anyManual ? (
                      <div className="flex flex-col gap-2">
                        <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                          手动系列会使用下面这一行 X（分类，支持文本）；Y 必须是数值。
                        </div>
                        {renderXRow()}
                      </div>
                    ) : (
                      <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        表格系列：每个系列需要选一个 2 行/2 列区域：X 标签 + Y 数值。
                      </div>
                    )}

                    {safeSeries.map((s, idx) => (
                      <div key={idx} className="border border-zinc-200 dark:border-zinc-700 rounded p-2 flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-zinc-600 dark:text-zinc-400">系列 {idx + 1}</span>
                          <input
                            type="text"
                            value={s.name}
                            onChange={(e) => upsert(idx, { name: e.target.value })}
                            className="flex-1 px-2 py-1 text-xs border border-zinc-300 dark:border-zinc-600 rounded bg-white dark:bg-zinc-800"
                            placeholder="系列名称（可选）"
                          />

                          <label className="text-xs flex items-center gap-1">
                            <input
                              type="radio"
                              name={`bar-series-source-${block.id}-${idx}`}
                              checked={(s.source ?? 'manual') === 'manual'}
                              onChange={() => upsert(idx, { source: 'manual' })}
                            />
                            手动
                          </label>
                          <label className="text-xs flex items-center gap-1">
                            <input
                              type="radio"
                              name={`bar-series-source-${block.id}-${idx}`}
                              checked={(s.source ?? 'manual') === 'table'}
                              onChange={() => {
                                const existing = s.tableSelection;
                                const fallbackTableId = availableTables[0]?.id ?? '';
                                const nextSelection = existing?.blockId
                                  ? existing
                                  : (fallbackTableId
                                    ? { blockId: fallbackTableId, r1: 0, r2: 9, c1: 0, c2: 1 }
                                    : undefined);
                                upsert(idx, { source: 'table', tableSelection: nextSelection });
                              }}
                            />
                            表格
                          </label>
                          {safeSeries.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeSeries(idx)}
                              className="px-2 py-1 text-xs rounded border border-zinc-300 dark:border-zinc-600"
                              title="删除该系列"
                            >
                              删除
                            </button>
                          )}
                        </div>

                        {(s.source ?? 'manual') === 'manual' ? renderYRow(s, idx) : renderTableSelector(s, idx)}
                      </div>
                    ))}

                    <div className="flex">
                      <button
                        type="button"
                        onClick={addSeries}
                        className="px-2 py-1 text-xs rounded border border-zinc-300 dark:border-zinc-600"
                      >
                        + 添加系列
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {(() => {
                const rows0 = ((chart?.pieRows ?? []) as PieRow[]);
                const minRows = Math.max(8, rows0.length + 2);
                const rows: PieRow[] = Array.from({ length: minRows }, (_, i) => rows0[i] ?? { label: '', value: '' });

                const setRowCell = (r: number, k: keyof PieRow, val: string) => {
                  const next = rows.map((x) => ({ ...x }));
                  next[r][k] = val;
                  updateChart({ pieRows: next } as Partial<NonNullable<typeof chart>>);
                };

                const handlePaste = (e: ReactClipboardEvent<HTMLInputElement>, r0: number, c0: number) => {
                  const text = e.clipboardData.getData('text/plain');
                  if (!text) return;
                  if (!/\t|\n|\r/.test(text)) return;
                  e.preventDefault();
                  const pasteRows = text.replace(/\r/g, '').split('\n').map((l) => l.split('\t'));
                  const next = rows.map((x) => ({ ...x }));
                  for (let dr = 0; dr < pasteRows.length; dr++) {
                    const rr = r0 + dr;
                    if (rr >= next.length) continue;
                    const row = pasteRows[dr];
                    const label = row[c0] ?? '';
                    const value = row[c0 + 1] ?? '';
                    next[rr].label = label;
                    next[rr].value = value;
                  }
                  updateChart({ pieRows: next } as Partial<NonNullable<typeof chart>>);
                };

                const isInRect = (r: number, c: number, sel: { r1: number; c1: number; r2: number; c2: number } | undefined) => {
                  if (!sel) return false;
                  const top = Math.min(sel.r1, sel.r2);
                  const bottom = Math.max(sel.r1, sel.r2);
                  const left = Math.min(sel.c1, sel.c2);
                  const right = Math.max(sel.c1, sel.c2);
                  return r >= top && r <= bottom && c >= left && c <= right;
                };

                const renderPieTableSelector = () => {
                  const blockId = chart?.pieTableSelection?.blockId ?? '';
                  const tablePayload = blockId ? getTablePayloadById(blockId) : null;
                  const rowsN = tablePayload?.rows ?? 0;
                  const colsN = tablePayload?.cols ?? 0;
                  const sel = chart?.pieTableSelection;
                  const axisMode: TableAxisMode = chart?.pieAxisMode === 'rows' ? 'rows' : 'cols';
                  const pickKey = `pie-${block.id}`;

                  const constrainTo2Axis = (
                    rect: { r1: number; c1: number; r2: number; c2: number },
                  ) => {
                    const top = Math.min(rect.r1, rect.r2);
                    const bottom = Math.max(rect.r1, rect.r2);
                    const left = Math.min(rect.c1, rect.c2);
                    const right = Math.max(rect.c1, rect.c2);
                    if (axisMode === 'rows') {
                      const r1 = Math.max(0, Math.min(rowsN - 1, top));
                      const r2 = Math.max(0, Math.min(rowsN - 1, r1 + 1));
                      return { r1, r2, c1: left, c2: right };
                    }
                    const c1 = Math.max(0, Math.min(colsN - 1, left));
                    const c2 = Math.max(0, Math.min(colsN - 1, c1 + 1));
                    return { r1: top, r2: bottom, c1, c2 };
                  };

                  const pickCell = (e: ReactMouseEvent, r: number, c: number) => {
                    e.preventDefault();
                    if (!blockId) return;
                    const anchor = chartPickAnchor && chartPickAnchor.key === pickKey ? chartPickAnchor : null;

                    if (chartSelectionMode) {
                      if (!sel || sel.r1 !== sel.r2 || sel.c1 !== sel.c2) {
                        setChartPickAnchor({ key: pickKey, r, c });
                        updateChart({ pieTableSelection: { blockId, r1: r, c1: c, r2: r, c2: c } } as Partial<NonNullable<typeof chart>>);
                        return;
                      }
                      setChartPickAnchor(null);
                      const constrained = constrainTo2Axis({ r1: sel.r1, c1: sel.c1, r2: r, c2: c });
                      updateChart({ pieTableSelection: { blockId, ...constrained } } as Partial<NonNullable<typeof chart>>);
                      return;
                    }

                    if (e.shiftKey && anchor) {
                      const constrained = constrainTo2Axis({ r1: anchor.r, c1: anchor.c, r2: r, c2: c });
                      updateChart({ pieTableSelection: { blockId, ...constrained } } as Partial<NonNullable<typeof chart>>);
                      return;
                    }

                    setChartPickAnchor({ key: pickKey, r, c });
                    updateChart({ pieTableSelection: { blockId, r1: r, c1: c, r2: r, c2: c } } as Partial<NonNullable<typeof chart>>);
                  };

                  return (
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <label className="text-xs text-zinc-600 dark:text-zinc-400">表格</label>
                        <select
                          value={blockId}
                          onChange={(e) => {
                            const nextId = e.target.value;
                            if (!nextId) {
                              updateChart({ pieTableSelection: undefined } as Partial<NonNullable<typeof chart>>);
                              return;
                            }
                            updateChart({ pieTableSelection: { blockId: nextId, r1: 0, r2: 9, c1: 0, c2: 1 } } as Partial<NonNullable<typeof chart>>);
                          }}
                          className="text-xs px-2 py-1 border border-zinc-300 dark:border-zinc-600 rounded bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
                        >
                          <option value="">请选择表格</option>
                          {availableTables.map((t) => (
                            <option key={t.id} value={t.id}>{t.label}</option>
                          ))}
                        </select>

                        <label className="text-xs text-zinc-600 dark:text-zinc-400 ml-2">名称/数值 方向</label>
                        <label className="text-xs flex items-center gap-1">
                          <input
                            type="radio"
                            name={`pie-axis-${block.id}`}
                            checked={axisMode === 'cols'}
                            onChange={() => {
                              const cur = chart?.pieTableSelection;
                              updateChart({ pieAxisMode: 'cols' } as Partial<NonNullable<typeof chart>>);
                              if (cur?.blockId) {
                                const left = Math.min(cur.c1, cur.c2);
                                updateChart({ pieTableSelection: { ...cur, c1: left, c2: left + 1 } } as Partial<NonNullable<typeof chart>>);
                              }
                            }}
                          />
                          按列（左=名称，右=数值）
                        </label>
                        <label className="text-xs flex items-center gap-1">
                          <input
                            type="radio"
                            name={`pie-axis-${block.id}`}
                            checked={axisMode === 'rows'}
                            onChange={() => {
                              const cur = chart?.pieTableSelection;
                              updateChart({ pieAxisMode: 'rows' } as Partial<NonNullable<typeof chart>>);
                              if (cur?.blockId) {
                                const top = Math.min(cur.r1, cur.r2);
                                updateChart({ pieTableSelection: { ...cur, r1: top, r2: top + 1 } } as Partial<NonNullable<typeof chart>>);
                              }
                            }}
                          />
                          按行（上=名称，下=数值）
                        </label>

                        <button
                          type="button"
                          onClick={() => applyLastTableSelectionToPie()}
                          disabled={!lastTableSelection}
                          className="ml-auto px-2 py-1 text-xs rounded border border-zinc-300 dark:border-zinc-600 disabled:opacity-40"
                          title={lastTableSelection ? '使用最近一次在表格块中框选的区域' : '请先在任意表格块中框选一块区域'}
                        >
                          使用最近选区
                        </button>

                        <button
                          type="button"
                          onClick={() => setChartSelectionMode((v) => !v)}
                          className={`px-2 py-1 text-xs rounded flex items-center gap-1 border border-zinc-300 dark:border-zinc-600 transition-colors ${
                            chartSelectionMode
                              ? 'bg-blue-500 hover:bg-blue-600 text-white'
                              : 'bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 text-zinc-700 dark:text-zinc-300'
                          }`}
                          title={chartSelectionMode ? '已开启：点击两次即可框选' : '开启：无需按 Shift 框选区域'}
                        >
                          <MousePointer2 size={14} />
                          选区模式
                        </button>
                      </div>

                      {tablePayload ? (
                        <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                          {chartSelectionMode
                            ? '选区模式：第一次点击设定起点；第二次点击设定终点。'
                            : '普通模式：点击设定起点；Shift+点击设定终点。'} 会按上面的“方向”自动约束为 2 行或 2 列。
                        </div>
                      ) : (
                        <div className="text-[11px] text-zinc-500 dark:text-zinc-400">先选择一个表格。</div>
                      )}

                      {tablePayload ? (
                        <div className="overflow-auto border border-zinc-200 dark:border-zinc-700 rounded max-h-72">
                          <table className="w-full text-xs border-collapse">
                            <tbody>
                              {Array.from({ length: rowsN }, (_, r) => (
                                <tr key={r}>
                                  {Array.from({ length: colsN }, (_, c) => {
                                    const active = isInRect(r, c, sel);
                                    return (
                                      <td
                                        key={c}
                                        onMouseDown={(e) => pickCell(e, r, c)}
                                        className={`border border-zinc-200 dark:border-zinc-700 px-2 py-1 select-none cursor-pointer ${
                                          active ? 'bg-blue-100 dark:bg-blue-900/25' : 'bg-white dark:bg-zinc-950'
                                        }`}
                                        title={`R${r + 1}C${c + 1}`}
                                      >
                                        {getCellPlain(tablePayload, r, c)}
                                      </td>
                                    );
                                  })}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : null}
                    </div>
                  );
                };

                return (
                  <>
                    {(chart?.dataSource ?? 'manual') === 'manual' ? (
                      <div className="flex flex-col gap-2">
                        <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                          饼图：输入“名称”和“数值”。支持粘贴两列 TSV（Excel 复制）。
                        </div>
                        <div className="overflow-auto border border-zinc-200 dark:border-zinc-700 rounded">
                          <table className="w-full text-xs border-collapse">
                            <thead>
                              <tr>
                                <th className="text-left px-2 py-1 border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300">名称</th>
                                <th className="text-left px-2 py-1 border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300">数值</th>
                              </tr>
                            </thead>
                            <tbody>
                              {rows.map((row, r) => (
                                <tr key={r}>
                                  <td className="border border-zinc-200 dark:border-zinc-700 p-0">
                                    <input
                                      type="text"
                                      value={row.label}
                                      onChange={(e) => setRowCell(r, 'label', e.target.value)}
                                      onPaste={(e) => handlePaste(e, r, 0)}
                                      className="w-full px-2 py-1 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 outline-none"
                                    />
                                  </td>
                                  <td className="border border-zinc-200 dark:border-zinc-700 p-0">
                                    <input
                                      type="text"
                                      value={row.value}
                                      onChange={(e) => setRowCell(r, 'value', e.target.value)}
                                      onPaste={(e) => handlePaste(e, r, 0)}
                                      className="w-full px-2 py-1 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 outline-none"
                                    />
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                          从表格导入：选一个 2 行/2 列区域（名称 + 数值）。
                        </div>
                        {renderPieTableSelector()}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          )}

          {(chart?.imageUrl ?? '').trim() ? (
            <div className="flex flex-col gap-2">
              <Image
                src={chart?.imageUrl ?? ''}
                alt="图表预览"
                width={800}
                height={600}
                className="max-h-72 max-w-full h-auto w-auto object-contain rounded border border-zinc-200 dark:border-zinc-700"
                unoptimized
              />
            </div>
          ) : (
            <div className="text-xs text-zinc-500 dark:text-zinc-400">尚未生成预览</div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleRenderChartClick}
              className="px-3 py-2 text-sm rounded bg-blue-500 hover:bg-blue-600 text-white"
            >
              生成/更新预览
            </button>
          </div>
        </div>
      ) : block.type === 'image' ? (
        <div className="flex flex-col gap-3">
          {block.content ? (
            <div className="flex items-center gap-3">
              <Image
                src={block.content}
                alt="图片预览"
                width={400}
                height={300}
                className="max-h-40 max-w-full h-auto w-auto object-contain rounded border border-zinc-200 dark:border-zinc-700"
                unoptimized
              />
              <button
                onClick={() => onUpdate({ content: '' })}
                className="px-2 py-1 text-xs rounded bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/40"
              >删除图片</button>
            </div>
          ) : null}

          <div>
            <input
              type="text"
              value={block.caption ?? ''}
              onChange={(e) => onUpdate({ caption: e.target.value })}
              className="w-full p-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100"
              placeholder="例如：实验装置示意图"
            />
          </div>

          <label className="inline-block px-4 py-2 rounded bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium cursor-pointer transition-colors">
            <input
              type="file"
              accept="image/*"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) {
                  try {
                    await onUploadImage(file);
                  } catch (err) {
                    alert(err instanceof Error ? err.message : '上传失败');
                  }
                }
              }}
              className="hidden"
            />
            {block.content ? '更换图片' : '选择图片'}
          </label>
          {block.content && (
            <div>
              <label className="text-xs text-zinc-600 dark:text-zinc-400 block mb-2">
                宽度: {(() => {
                  const w = block.width || '100%';
                  return parseFloat(w) || 100;
                })()}%
              </label>
              <input
                type="range"
                min="0"
                max="100"
                value={(() => {
                  const w = block.width || '100%';
                  return parseFloat(w) || 100;
                })()}
                onChange={(e) => {
                  const val = e.target.value;
                  onUpdate({ width: `${val}%` });
                }}
                className="w-full h-2 bg-zinc-200 dark:bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
            </div>
          )}
        </div>
      ) : block.type === 'math' ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-600 dark:text-zinc-400">公式格式</span>
            <div className="flex bg-white dark:bg-zinc-900 rounded border border-zinc-300 dark:border-zinc-600 overflow-hidden">
              <button
                type="button"
                onClick={() => {
                  const currentTypst = (block.mathTypst ?? block.content ?? '').trim();
                  onUpdate({
                    mathFormat: 'latex',
                    mathTypst: currentTypst,
                    mathLatex: block.mathLatex ?? typstToLatexMath(currentTypst),
                    content: currentTypst,
                  });
                }}
                className={`px-2 py-1 text-xs transition-colors ${
                  (block.mathFormat ?? 'latex') === 'latex'
                    ? 'bg-blue-500 text-white'
                    : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                }`}
              >
                LaTeX
              </button>
              <button
                type="button"
                onClick={() => {
                  const currentLatex = (block.mathLatex ?? '').trim();
                  const currentTypst = (block.mathTypst ?? block.content ?? '').trim() || latexToTypstMath(currentLatex);
                  onUpdate({
                    mathFormat: 'typst',
                    mathLatex: currentLatex,
                    mathTypst: currentTypst,
                    content: currentTypst,
                  });
                }}
                className={`px-2 py-1 text-xs transition-colors ${
                  (block.mathFormat ?? 'latex') === 'typst'
                    ? 'bg-blue-500 text-white'
                    : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                }`}
              >
                Typst
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                if (block.mathLines) {
                  // Convert back to single line
                  const combinedLatex = block.mathLines.map(l => l.latex).join(' \\\\ ');
                  const combinedTypst = block.mathLines.map(l => l.typst).join(' \\ ');
                  onUpdate({
                    mathLines: undefined,
                    mathBrace: undefined,
                    mathLatex: combinedLatex,
                    mathTypst: combinedTypst,
                    content: combinedTypst,
                  });
                } else {
                  // Convert to multi-line
                  const currentLatex = block.mathLatex ?? '';
                  const currentTypst = block.mathTypst ?? block.content ?? '';
                  onUpdate({
                    mathLines: [{ latex: currentLatex, typst: currentTypst }],
                    mathBrace: false,
                  });
                }
              }}
              className="px-2 py-1 text-xs rounded bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 text-zinc-700 dark:text-zinc-300"
            >
              {block.mathLines ? '单行模式' : '多行模式'}
            </button>
            {block.mathLines && (
              <button
                type="button"
                onClick={() => onUpdate({ mathBrace: !block.mathBrace })}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  block.mathBrace
                    ? 'bg-blue-500 text-white'
                    : 'bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 text-zinc-700 dark:text-zinc-300'
                }`}
                title="左侧大括号"
              >
                {block.mathBrace ? '{ }' : '[ ]'}
              </button>
            )}
          </div>

          {block.mathLines ? (
            <div className="flex flex-col gap-2">
              {block.mathLines.map((line, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="text-xs text-zinc-500 dark:text-zinc-400 w-6">{idx + 1}.</span>
                  <input
                    type="text"
                    value={(block.mathFormat ?? 'latex') === 'latex' ? line.latex : line.typst}
                    onChange={(e) => {
                      const newLines = [...block.mathLines!];
                      const fmt = block.mathFormat ?? 'latex';
                      if (fmt === 'latex') {
                        newLines[idx] = { latex: e.target.value, typst: latexToTypstMath(e.target.value) };
                      } else {
                        newLines[idx] = { latex: typstToLatexMath(e.target.value), typst: e.target.value };
                      }
                      onUpdate({ mathLines: newLines });
                    }}
                    className="flex-1 p-2 text-sm font-mono border border-zinc-200 dark:border-zinc-700 rounded bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100"
                    placeholder={(block.mathFormat ?? 'latex') === 'latex' ? '输入 LaTeX' : '输入 Typst'}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const newLines = block.mathLines!.filter((_, i) => i !== idx);
                      onUpdate({ mathLines: newLines.length > 0 ? newLines : undefined });
                    }}
                    className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                    title="删除此行"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => {
                  const newLines = [...(block.mathLines ?? []), { latex: '', typst: '' }];
                  onUpdate({ mathLines: newLines });
                }}
                className="px-3 py-1.5 text-xs rounded bg-blue-500 hover:bg-blue-600 text-white flex items-center gap-1 self-start"
              >
                <Plus size={14} />
                添加一行
              </button>
            </div>
          ) : (
            <textarea
            value={
              (block.mathFormat ?? 'latex') === 'latex'
                ? (block.mathLatex ?? typstToLatexMath((block.mathTypst ?? block.content ?? '').trim()))
                : (block.mathTypst ?? block.content ?? '')
            }
            onChange={(e) => {
              const nextVal = e.target.value;
              const fmt = block.mathFormat ?? 'latex';
              if (fmt === 'latex') {
                const typst = latexToTypstMath(nextVal);
                onUpdate({
                  mathFormat: 'latex',
                  mathLatex: nextVal,
                  mathTypst: typst,
                  content: typst,
                });
              } else {
                const latex = typstToLatexMath(nextVal);
                onUpdate({
                  mathFormat: 'typst',
                  mathLatex: latex,
                  mathTypst: nextVal,
                  content: nextVal,
                });
              }
            }}
              className="w-full p-2 font-mono text-sm border border-zinc-200 dark:border-zinc-700 rounded bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 resize-none"
              rows={3}
              placeholder={(block.mathFormat ?? 'latex') === 'latex' ? '输入 LaTeX，例如: \\frac{1}{2}' : '输入 Typst math，例如: frac(1, 2)'}
            />
          )}
          <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
            说明：两种格式会自动互相转换（目前为常用语法的最佳努力转换）。{block.mathLines && ' 多行模式支持方程组显示。'}
          </div>
        </div>
      ) : block.type === 'table' ? (
        (() => {
          const payload = normalizeTablePayload(parseTablePayload(block.content));
          const style = payload.style ?? 'normal';

          const setPayload = (next: TablePayload) => {
            onUpdate({ content: JSON.stringify(normalizeTablePayload(next)) });
          };

          const applyResize = () => {
            const nextRows = Math.max(1, parseInt(tableRowsInputRef.current?.value || '1', 10) || 1);
            const nextCols = Math.max(1, parseInt(tableColsInputRef.current?.value || '1', 10) || 1);
            const flat = flattenTableMerges(payload);
            const resized = defaultTablePayload(nextRows, nextCols);
            resized.caption = flat.caption;
            resized.style = flat.style;
            for (let r = 0; r < Math.min(nextRows, flat.rows); r++) {
              for (let c = 0; c < Math.min(nextCols, flat.cols); c++) {
                resized.cells[r][c].content = flat.cells[r][c].content;
              }
            }
            setPayload(resized);
            setActiveTableCell({ r: 0, c: 0 });
            setTableSelection({ r1: 0, c1: 0, r2: 0, c2: 0 });
          };

          const sel = tableSelection;
          const inSel = (r: number, c: number) => {
            if (!sel) return false;
            const top = Math.min(sel.r1, sel.r2);
            const left = Math.min(sel.c1, sel.c2);
            const bottom = Math.max(sel.r1, sel.r2);
            const right = Math.max(sel.c1, sel.c2);
            return r >= top && r <= bottom && c >= left && c <= right;
          };

          const activeCell = activeTableCell;
          const active = activeCell ? payload.cells[activeCell.r]?.[activeCell.c] : null;

          return (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-600 dark:text-zinc-400">表格标题</span>
                <input
                  type="text"
                  value={payload.caption ?? ''}
                  onChange={(e) => setPayload({ ...payload, caption: e.target.value })}
                  className="flex-1 p-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100"
                  placeholder="（可选）标题显示在表格上方"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-zinc-600 dark:text-zinc-400">行</span>
                <input
                  type="number"
                  min={1}
                  ref={tableRowsInputRef}
                  defaultValue={payload.rows}
                  className="w-20 p-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100"
                />
                <span className="text-xs text-zinc-600 dark:text-zinc-400">列</span>
                <input
                  type="number"
                  min={1}
                  ref={tableColsInputRef}
                  defaultValue={payload.cols}
                  className="w-20 p-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100"
                />
                <button
                  type="button"
                  onClick={applyResize}
                  className="px-3 py-2 text-xs rounded bg-blue-500 hover:bg-blue-600 text-white"
                >
                  应用
                </button>

                <span className="text-xs text-zinc-600 dark:text-zinc-400 ml-2">样式</span>
                <select
                  value={style}
                  onChange={(e) => setPayload({ ...payload, style: (e.target.value as TableStyle) })}
                  className="text-xs px-2 py-2 border border-zinc-300 dark:border-zinc-600 rounded bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
                >
                  <option value="normal">普通表格</option>
                  <option value="three-line">三线表</option>
                </select>

                <button
                  type="button"
                  onClick={() => setTableSelectionMode(v => !v)}
                  className={`px-3 py-2 text-xs rounded flex items-center gap-1 transition-colors ${
                    tableSelectionMode
                      ? 'bg-blue-500 hover:bg-blue-600 text-white'
                      : 'bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 text-zinc-700 dark:text-zinc-300'
                  }`}
                  title={tableSelectionMode ? '已开启：点击两次即可框选' : '开启：无需按 Shift 框选区域'}
                >
                  <MousePointer2 size={14} />
                  选区模式
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (!tableSelection) return;
                    const top = Math.min(tableSelection.r1, tableSelection.r2);
                    const left = Math.min(tableSelection.c1, tableSelection.c2);
                    const bottom = Math.max(tableSelection.r1, tableSelection.r2);
                    const right = Math.max(tableSelection.c1, tableSelection.c2);
                    if (top === bottom && left === right) return;
                    setPayload(mergeTableRect(payload, top, left, bottom, right));
                  }}
                  className="px-3 py-2 text-xs rounded bg-blue-500 hover:bg-blue-600 text-white"
                  title="合并所选单元格"
                >
                  合并
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!activeTableCell) return;
                    setPayload(unmergeTableCell(payload, activeTableCell.r, activeTableCell.c));
                  }}
                  className="px-3 py-2 text-xs rounded bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 text-zinc-700 dark:text-zinc-300"
                  title="取消合并"
                >
                  取消合并
                </button>
              </div>

              <div className="overflow-x-auto">
                <table
                  className={`mx-auto ${
                    style === 'three-line'
                      ? 'border-t border-b border-zinc-300 dark:border-zinc-600'
                      : 'border border-zinc-200 dark:border-zinc-700'
                  }`}
                >
                  <tbody>
                    {Array.from({ length: payload.rows }, (_, r) => (
                      <tr
                        key={r}
                        className={
                          style === 'three-line' && r === 0
                            ? 'border-b border-zinc-300 dark:border-zinc-600'
                            : style === 'normal'
                              ? 'border-b border-zinc-200 dark:border-zinc-700 last:border-b-0'
                              : ''
                        }
                      >
                        {Array.from({ length: payload.cols }, (_, c) => {
                          const cell = payload.cells[r][c];
                          if (cell.hidden) return null;
                          const rs = Math.max(1, Number(cell.rowspan || 1));
                          const cs = Math.max(1, Number(cell.colspan || 1));
                          const selected = inSel(r, c);
                          const activeNow = activeTableCell?.r === r && activeTableCell?.c === c;
                          return (
                            <td
                              key={c}
                              rowSpan={rs}
                              colSpan={cs}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                if (tableSelectionMode) {
                                  // 选区模式：第一次点击设定起点；第二次点击设定终点形成矩形。
                                  if (!tableSelection || (tableSelection.r1 !== tableSelection.r2 || tableSelection.c1 !== tableSelection.c2)) {
                                    setActiveTableCell({ r, c });
                                    setTableSelection({ r1: r, c1: c, r2: r, c2: c });
                                  } else {
                                    setActiveTableCell({ r: tableSelection.r1, c: tableSelection.c1 });
                                    setTableSelection({ r1: tableSelection.r1, c1: tableSelection.c1, r2: r, c2: c });
                                  }
                                  setIsEditingTableCell(false);
                                  return;
                                }

                                if (e.shiftKey && activeTableCell) {
                                  setTableSelection({ r1: activeTableCell.r, c1: activeTableCell.c, r2: r, c2: c });
                                } else {
                                  setActiveTableCell({ r, c });
                                  setTableSelection({ r1: r, c1: c, r2: r, c2: c });
                                  setIsEditingTableCell(false);
                                }
                              }}
                              className={`${
                                style === 'normal'
                                  ? 'border-r border-zinc-200 dark:border-zinc-700 last:border-r-0'
                                  : ''
                              } p-2 align-top min-w-[120px] ${
                                activeNow
                                  ? 'outline outline-2 outline-blue-400'
                                  : selected
                                    ? 'bg-blue-50 dark:bg-blue-900/10'
                                    : ''
                              } cursor-pointer`}
                            >
                              <div
                                className="text-sm whitespace-pre-wrap [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:my-0 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:my-0 [&_li]:my-0"
                                dangerouslySetInnerHTML={{ __html: typstInlineToHtml(cell.content ?? '') }}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {activeCell && active && !active.hidden && (
                <div className="mt-2">
                  <div className="flex gap-1 mb-2 pb-2 border-b border-zinc-200 dark:border-zinc-700">
                    <button
                      onMouseDown={(e) => { e.preventDefault(); applyFormatToTableCell('bold'); }}
                      className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded transition-colors"
                      title="加粗"
                    >
                      <Bold size={16} />
                    </button>
                    <button
                      onMouseDown={(e) => { e.preventDefault(); applyListToTableCell('ordered'); }}
                      className="px-2 py-1.5 text-xs hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded transition-colors"
                      title="有序列表"
                    >
                      1.
                    </button>
                    <button
                      onMouseDown={(e) => { e.preventDefault(); applyListToTableCell('bullet'); }}
                      className="px-2 py-1.5 text-xs hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded transition-colors"
                      title="无序列表"
                    >
                      •
                    </button>
                    <button
                      onMouseDown={(e) => { e.preventDefault(); applyFormatToTableCell('italic'); }}
                      className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded transition-colors"
                      title="斜体"
                    >
                      <Italic size={16} />
                    </button>
                    <button
                      onMouseDown={(e) => { e.preventDefault(); applyFormatToTableCell('strike'); }}
                      className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded transition-colors"
                      title="删除线"
                    >
                      <Strikethrough size={16} />
                    </button>
                    <button
                      onMouseDown={(e) => { e.preventDefault(); insertInlineMath('table'); }}
                      className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded transition-colors"
                      title="插入行内公式"
                    >
                      <Sigma size={16} />
                    </button>
                    <div className="relative" ref={tableColorPickerRef}>
                      <button
                        onMouseDown={(e) => { e.preventDefault(); setShowTableColorPicker(!showTableColorPicker); }}
                        className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded transition-colors"
                        title="文字颜色"
                      >
                        <Palette size={16} />
                      </button>
                      {showTableColorPicker && (
                        <div className="absolute top-full left-0 mt-1 p-3 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded shadow-lg z-50 w-max">
                          <div className="grid grid-cols-5 gap-2">
                            {['#000000', '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF', '#FFA500', '#800080', '#008000'].map(color => (
                              <button
                                key={color}
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  applyFormatToTableCell('color', color);
                                  setShowTableColorPicker(false);
                                }}
                                className="w-7 h-7 rounded border border-zinc-300 dark:border-zinc-600 hover:scale-110 transition-transform"
                                style={{ backgroundColor: color }}
                                title={color}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div
                    ref={tableCellEditorRef}
                    contentEditable
                    suppressContentEditableWarning
                    onFocus={() => setIsEditingTableCell(true)}
                    onBlur={() => {
                      setIsEditingTableCell(false);
                      syncTableCellFromDom();
                    }}
                    onInput={() => syncTableCellFromDom()}
                    onClick={(e) => handleRichEditorClick('table', e)}
                    onKeyDown={(e) => {
                      handleListKeyDown('table', e);
                    }}
                    className="w-full min-h-[40px] p-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 whitespace-pre-wrap outline-none [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:my-0 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:my-0 [&_li]:my-0"
                    data-placeholder="编辑当前单元格内容..."
                  />

                  {activeInlineMath?.scope === 'table' && (
                    <div className="inline-math-editor mt-2 p-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-zinc-500">编辑行内公式</span>
                        <button
                          onClick={() => {
                            syncTableCellFromDom();
                            setActiveInlineMath(null);
                          }}
                          className="text-xs text-zinc-400 hover:text-zinc-600"
                        >
                          关闭
                        </button>
                      </div>

                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs text-zinc-600 dark:text-zinc-400">公式格式</span>
                        <div className="flex bg-white dark:bg-zinc-900 rounded border border-zinc-300 dark:border-zinc-600 overflow-hidden">
                          <button
                            type="button"
                            onClick={() => {
                              const nextState = { ...activeInlineMath, format: 'latex' as InlineMathFormat };
                              setActiveInlineMath(nextState);
                              updateInlineMathPillAttrs(nextState);
                            }}
                            className={`px-2 py-1 text-xs transition-colors ${
                              activeInlineMath.format === 'latex'
                                ? 'bg-blue-500 text-white'
                                : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                            }`}
                          >
                            LaTeX
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const nextState = { ...activeInlineMath, format: 'typst' as InlineMathFormat };
                              setActiveInlineMath(nextState);
                              updateInlineMathPillAttrs(nextState);
                            }}
                            className={`px-2 py-1 text-xs transition-colors ${
                              activeInlineMath.format === 'typst'
                                ? 'bg-blue-500 text-white'
                                : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                            }`}
                          >
                            Typst
                          </button>
                        </div>
                      </div>

                      <textarea
                        value={activeInlineMath.format === 'latex' ? activeInlineMath.latex : activeInlineMath.typst}
                        onChange={(e) => {
                          const nextVal = e.target.value;
                          if (activeInlineMath.format === 'latex') {
                            const nextLatex = nextVal;
                            const nextTypst = latexToTypstMath(nextLatex);
                            const nextState = { ...activeInlineMath, latex: nextLatex, typst: nextTypst };
                            setActiveInlineMath(nextState);
                            updateInlineMathPillAttrs(nextState);
                            syncTableCellFromDom();
                          } else {
                            const nextTypst = nextVal;
                            const nextLatex = typstToLatexMath(nextTypst);
                            const nextState = { ...activeInlineMath, typst: nextTypst, latex: nextLatex };
                            setActiveInlineMath(nextState);
                            updateInlineMathPillAttrs(nextState);
                            syncTableCellFromDom();
                          }
                        }}
                        className="w-full p-2 font-mono text-sm border border-zinc-200 dark:border-zinc-700 rounded bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 resize-none"
                        rows={3}
                        placeholder={activeInlineMath.format === 'latex' ? '输入 LaTeX，例如: \\frac{1}{2}' : '输入 Typst math，例如: frac(1, 2)'}
                      />
                    </div>
                  )}
                </div>
              )}

              <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                说明：先选中单元格。默认可用 Shift+点击框选矩形区域后点“合并”。也可开启“选区模式”：点击一次设起点，再点击一次设终点完成框选；再次点击将重新开始框选。三线表为无竖线样式。
              </div>
            </div>
          );
        })()
      ) : (
        <div className="relative">
          {/* Rich text formatting toolbar for paragraph blocks */}
          {(block.type === 'paragraph' || block.type === 'heading') && (
            <div className="flex gap-1 mb-2 pb-2 border-b border-zinc-200 dark:border-zinc-700">
              <button
                onMouseDown={(e) => { e.preventDefault(); applyFormat('bold'); }}
                className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded transition-colors"
                title="加粗 (Ctrl+B)"
              >
                <Bold size={16} />
              </button>
              <button
                onMouseDown={(e) => { e.preventDefault(); applyList('ordered'); }}
                className="px-2 py-1.5 text-xs hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded transition-colors"
                title="有序列表"
              >
                1.
              </button>
              <button
                onMouseDown={(e) => { e.preventDefault(); applyList('bullet'); }}
                className="px-2 py-1.5 text-xs hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded transition-colors"
                title="无序列表"
              >
                •
              </button>
              <button
                onMouseDown={(e) => { e.preventDefault(); applyFormat('italic'); }}
                className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded transition-colors"
                title="斜体 (Ctrl+I)"
              >
                <Italic size={16} />
              </button>
              <button
                onMouseDown={(e) => { e.preventDefault(); applyFormat('strike'); }}
                className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded transition-colors"
                title="删除线"
              >
                <Strikethrough size={16} />
              </button>
              <button
                onMouseDown={(e) => { e.preventDefault(); insertInlineMath('main'); }}
                className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded transition-colors"
                title="插入行内公式"
              >
                <Sigma size={16} />
              </button>
              <div className="relative" ref={colorPickerRef}>
                <button
                  onMouseDown={(e) => { e.preventDefault(); setShowColorPicker(!showColorPicker); }}
                  className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded transition-colors"
                  title="文字颜色"
                >
                  <Palette size={16} />
                </button>
                {showColorPicker && (
                  <div className="absolute top-full left-0 mt-1 p-3 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded shadow-lg z-50 w-max">
                    <div className="grid grid-cols-5 gap-2">
                      {['#000000', '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF', '#FFA500', '#800080', '#008000'].map(color => (
                        <button
                          key={color}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            applyFormat('color', color);
                            setShowColorPicker(false);
                          }}
                          className="w-7 h-7 rounded border border-zinc-300 dark:border-zinc-600 hover:scale-110 transition-transform"
                          style={{ backgroundColor: color }}
                          title={color}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {block.type === 'paragraph' && (
                <div className="flex items-center gap-2 ml-2">
                  <span className="text-xs text-zinc-600 dark:text-zinc-400">行距</span>
                  <select
                    value={block.lineSpacing ? String(block.lineSpacing) : ''}
                    onChange={(e) => {
                      const v = e.target.value;
                      onUpdate({ lineSpacing: v ? Number(v) : undefined });
                    }}
                    className="text-xs px-2 py-1 border border-zinc-300 dark:border-zinc-600 rounded bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
                    title="段落行间距"
                  >
                    <option value="">默认</option>
                    <option value="0.8">0.8</option>
                    <option value="0.9">0.9</option>
                    <option value="1">1.0</option>
                    <option value="1.2">1.2</option>
                    <option value="1.5">1.5</option>
                    <option value="2">2.0</option>
                  </select>
                </div>
              )}
            </div>
          )}

          {/* (removed unused hidden input that caused controlled/uncontrolled warnings) */}

          {block.type === 'paragraph' || block.type === 'heading' ? (
            <>
              <div
                ref={paragraphEditorRef}
                contentEditable
                suppressContentEditableWarning
                onFocus={() => setIsEditingParagraph(true)}
                onBlur={() => {
                  setIsEditingParagraph(false);
                  syncParagraphFromDom();
                }}
                onInput={() => {
                  // Update Typst source live while typing, without re-rendering the HTML.
                  syncParagraphFromDom();
                }}
                onClick={(e) => handleRichEditorClick('main', e)}
                onKeyDown={(e) => {
                  handleListKeyDown('main', e);
                  if (e.ctrlKey && !e.shiftKey) {
                    if (e.key === 'b' || e.key === 'B') {
                      e.preventDefault();
                      applyFormat('bold');
                    } else if (e.key === 'i' || e.key === 'I') {
                      e.preventDefault();
                      applyFormat('italic');
                    }
                  }
                }}
                style={
                  block.type === 'paragraph' && typeof block.lineSpacing === 'number' && block.lineSpacing !== 1
                    ? { lineHeight: block.lineSpacing }
                    : undefined
                }
                className={`w-full min-h-[40px] p-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 whitespace-pre-wrap outline-none [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:my-0 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:my-0 [&_li]:my-0 ${block.type === 'heading' ? `font-bold text-${['lg', 'xl', '2xl', '3xl', '4xl', '5xl'][6 - (block.level || 1)] || 'base'}` : ''}`}
                data-placeholder={`输入${getTypeName(block.type)}内容...`}
              />
              {activeInlineMath && (
                <div className="inline-math-editor mt-2 p-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-zinc-500">编辑行内公式</span>
                    <button 
                      onClick={() => {
                        if (activeInlineMath.scope === 'main') syncParagraphFromDom();
                        else syncTableCellFromDom();
                        setActiveInlineMath(null);
                      }}
                      className="text-xs text-zinc-400 hover:text-zinc-600"
                    >
                      关闭
                    </button>
                  </div>

                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs text-zinc-600 dark:text-zinc-400">公式格式</span>
                    <div className="flex bg-white dark:bg-zinc-900 rounded border border-zinc-300 dark:border-zinc-600 overflow-hidden">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveInlineMath({ ...activeInlineMath, format: 'latex' });
                          updateInlineMathPillAttrs({ ...activeInlineMath, format: 'latex' });
                        }}
                        className={`px-2 py-1 text-xs transition-colors ${
                          activeInlineMath.format === 'latex'
                            ? 'bg-blue-500 text-white'
                            : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                        }`}
                      >
                        LaTeX
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveInlineMath({ ...activeInlineMath, format: 'typst' });
                          updateInlineMathPillAttrs({ ...activeInlineMath, format: 'typst' });
                        }}
                        className={`px-2 py-1 text-xs transition-colors ${
                          activeInlineMath.format === 'typst'
                            ? 'bg-blue-500 text-white'
                            : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                        }`}
                      >
                        Typst
                      </button>
                    </div>
                  </div>

                  <textarea
                    value={activeInlineMath.format === 'latex' ? activeInlineMath.latex : activeInlineMath.typst}
                    onChange={(e) => {
                      const nextVal = e.target.value;
                      if (activeInlineMath.format === 'latex') {
                        const nextLatex = nextVal;
                        const nextTypst = latexToTypstMath(nextLatex);
                        const nextState = { ...activeInlineMath, latex: nextLatex, typst: nextTypst };
                        setActiveInlineMath(nextState);
                        updateInlineMathPillAttrs(nextState);
                        if (nextState.scope === 'main') syncParagraphFromDom();
                        else syncTableCellFromDom();
                      } else {
                        const nextTypst = nextVal;
                        const nextLatex = typstToLatexMath(nextTypst);
                        const nextState = { ...activeInlineMath, typst: nextTypst, latex: nextLatex };
                        setActiveInlineMath(nextState);
                        updateInlineMathPillAttrs(nextState);
                        if (nextState.scope === 'main') syncParagraphFromDom();
                        else syncTableCellFromDom();
                      }
                    }}
                    className="w-full p-2 font-mono text-sm border border-zinc-200 dark:border-zinc-700 rounded bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 resize-none"
                    rows={2}
                    placeholder={activeInlineMath.format === 'latex' ? '输入 LaTeX，例如: \\frac{1}{2}' : '输入 Typst math，例如: frac(1, 2)'}
                    autoFocus
                  />
                  <div className="mt-1 text-[10px] text-zinc-400">
                    说明：两种格式会自动互相转换（最佳努力）。
                  </div>
                </div>
              )}
            </>
          ) : (
            <input
              type="text"
              value={block.content}
              onChange={(e) => onUpdate({ content: e.target.value })}
              className="w-full p-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100"
              placeholder={`输入${getTypeName(block.type)}内容...`}
            />
          )}
        </div>
      )}

      {/* 添加按钮 */}
      <button
        onClick={onAddAfter}
        className="absolute -bottom-3 left-1/2 transform -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-blue-500 hover:bg-blue-600 text-white rounded-full p-1"
        title="在下方添加块"
      >
        <Plus size={14} />
      </button>
    </div>
  );
}

function getTypeName(type: BlockType): string {
  const names: Record<BlockType, string> = {
    heading: '标题',
    paragraph: '段落',
    code: '代码',
    math: '数学公式',
    list: '列表',
    image: '图片',
    table: '表格',
    chart: '图表',
  };
  return names[type] || '内容';
}
