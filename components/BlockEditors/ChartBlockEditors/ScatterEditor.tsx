'use client';

import { TypstBlock } from '@/lib/typst';
import { type MouseEvent as ReactMouseEvent, type ClipboardEvent as ReactClipboardEvent } from 'react';
import { MousePointer2 } from 'lucide-react';
import {
  ChartData,
  ScatterSeries,
  TableSelection,
  parseRow,
  toRow,
  isInRect,
  getTablePayloadById,
  getCellPlain,
} from './shared';

interface ScatterEditorProps {
  chart: ChartData;
  block: TypstBlock;
  allBlocks: TypstBlock[];
  availableTables: Array<{ id: string; label: string }>;
  updateChart: (partial: Partial<ChartData>) => void;
  lastTableSelection: { blockId: string; r1: number; c1: number; r2: number; c2: number } | null;
  chartSelectionMode: boolean;
  setChartSelectionMode: (mode: boolean | ((prev: boolean) => boolean)) => void;
  chartPickAnchor: { key: string; r: number; c: number } | null;
  setChartPickAnchor: (anchor: { key: string; r: number; c: number } | null) => void;
}

export default function ScatterEditor({
  chart,
  block,
  allBlocks,
  availableTables,
  updateChart,
  lastTableSelection,
  chartSelectionMode,
  setChartSelectionMode,
  chartPickAnchor,
  setChartPickAnchor,
}: ScatterEditorProps) {
  const series = (chart.scatterSeries ?? []) as ScatterSeries[];
  const safeSeries: ScatterSeries[] = series.length > 0
    ? series
    : [{ name: '系列1', xSource: 'manual', ySource: 'manual', xRow: '', yRow: '', xTableSelection: undefined, yTableSelection: undefined }];

  const upsertSeries = (idx: number, patch: Partial<ScatterSeries>) => {
    const next = safeSeries.slice();
    const cur: ScatterSeries = next[idx]
      ?? safeSeries[idx]
      ?? { name: `系列${idx + 1}`, xSource: 'manual', ySource: 'manual', xRow: '', yRow: '', xTableSelection: undefined, yTableSelection: undefined };
    next[idx] = { ...cur, ...patch } as ScatterSeries;
    updateChart({ scatterSeries: next });
  };

  const removeSeries = (idx: number) => {
    const next = safeSeries.slice();
    next.splice(idx, 1);
    const result = next.length > 0
      ? next
      : [{ name: '系列1', xSource: 'manual', ySource: 'manual', xRow: '', yRow: '', xTableSelection: undefined, yTableSelection: undefined }];
    updateChart({ scatterSeries: result });
  };

  const addSeries = () => {
    const next = safeSeries.slice();
    const n = next.length + 1;
    next.push({ name: `系列${n}`, xSource: 'manual', ySource: 'manual', xRow: '', yRow: '', xTableSelection: undefined, yTableSelection: undefined });
    updateChart({ scatterSeries: next });
  };

  const applyLastTableSelectionToScatterAxis = (seriesIndex: number, axis: 'x' | 'y') => {
    const snap = lastTableSelection;
    if (!snap) return;

    const base: ScatterSeries = safeSeries[seriesIndex]
      ?? { name: `系列${seriesIndex + 1}`, xSource: 'manual', ySource: 'manual', xRow: '', yRow: '', xTableSelection: undefined, yTableSelection: undefined };

    const top = Math.min(snap.r1, snap.r2);
    const bottom = Math.max(snap.r1, snap.r2);
    const left = Math.min(snap.c1, snap.c2);
    const right = Math.max(snap.c1, snap.c2);

    const height = bottom - top;
    const width = right - left;
    const asRow = height === 0 || (height !== 0 && width >= height);
    const normalized: TableSelection = asRow
      ? { blockId: snap.blockId, r1: top, r2: top, c1: left, c2: right }
      : { blockId: snap.blockId, r1: top, r2: bottom, c1: left, c2: left };

    const next = safeSeries.slice();
    if (axis === 'x') {
      next[seriesIndex] = { ...base, xSource: 'table', xTableSelection: normalized };
    } else {
      next[seriesIndex] = { ...base, ySource: 'table', yTableSelection: normalized };
    }
    updateChart({ scatterSeries: next });
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
              <td className="border border-zinc-200 dark:border-zinc-700 px-2 py-1 bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 w-10">
                {axis.toUpperCase()}
              </td>
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

  const renderAxisTableSelector = (axis: 'x' | 'y', s: ScatterSeries, idx: number) => {
    const sel = axis === 'x' ? s.xTableSelection : s.yTableSelection;
    const blockId = sel?.blockId ?? '';
    const tablePayload = blockId ? getTablePayloadById(blockId, allBlocks) : null;
    const rows = tablePayload?.rows ?? 0;
    const cols = tablePayload?.cols ?? 0;

    const pickKey = `scatter-${axis}-${block.id}-${idx}`;

    const constrainToVector = (anchor: { r: number; c: number }, r: number, c: number) => {
      const dr = Math.abs(r - anchor.r);
      const dc = Math.abs(c - anchor.c);
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
}
