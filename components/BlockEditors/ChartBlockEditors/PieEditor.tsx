'use client';

import { TypstBlock } from '@/lib/typst';
import { type MouseEvent as ReactMouseEvent, type ClipboardEvent as ReactClipboardEvent } from 'react';
import { MousePointer2 } from 'lucide-react';
import {
  ChartData,
  PieRow,
  TableAxisMode,
  isInRect,
  getTablePayloadById,
  getCellPlain,
} from './shared';

interface PieEditorProps {
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

export default function PieEditor({
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
}: PieEditorProps) {
  const applyLastTableSelectionToPie = () => {
    const snap = lastTableSelection;
    if (!snap) return;

    const top = Math.min(snap.r1, snap.r2);
    const bottom = Math.max(snap.r1, snap.r2);
    const left = Math.min(snap.c1, snap.c2);
    const right = Math.max(snap.c1, snap.c2);
    const normalized = (chart.pieAxisMode ?? 'cols') === 'rows'
      ? { blockId: snap.blockId, r1: top, r2: top + 1, c1: left, c2: right }
      : { blockId: snap.blockId, r1: top, r2: bottom, c1: left, c2: left + 1 };

    updateChart({ dataSource: 'table', pieTableSelection: normalized });
  };

  const rows0 = ((chart.pieRows ?? []) as PieRow[]);
  const minRows = 15;
  const rows: PieRow[] = Array.from({ length: minRows }, (_, i) => rows0[i] ?? { label: '', value: '' });

  const setRowCell = (r: number, k: keyof PieRow, val: string) => {
    const next = rows.map((x) => ({ ...x }));
    next[r][k] = val;
    updateChart({ pieRows: next });
  };

  const handlePaste = (e: ReactClipboardEvent<HTMLInputElement>, r0: number, c0: number) => {
    const text = e.clipboardData.getData('text/plain');
    if (!text || !/\t|\n|\r/.test(text)) return;
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
    updateChart({ pieRows: next });
  };

  const renderPieTableSelector = () => {
    const blockId = chart.pieTableSelection?.blockId ?? '';
    const tablePayload = blockId ? getTablePayloadById(blockId, allBlocks) : null;
    const rowsN = tablePayload?.rows ?? 0;
    const colsN = tablePayload?.cols ?? 0;
    const sel = chart.pieTableSelection;
    const axisMode: TableAxisMode = chart.pieAxisMode === 'rows' ? 'rows' : 'cols';
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
          updateChart({ pieTableSelection: { blockId, r1: r, c1: c, r2: r, c2: c } });
          return;
        }
        setChartPickAnchor(null);
        const constrained = constrainTo2Axis({ r1: sel.r1, c1: sel.c1, r2: r, c2: c });
        updateChart({ pieTableSelection: { blockId, ...constrained } });
        return;
      }

      if (e.shiftKey && anchor) {
        const constrained = constrainTo2Axis({ r1: anchor.r, c1: anchor.c, r2: r, c2: c });
        updateChart({ pieTableSelection: { blockId, ...constrained } });
        return;
      }

      setChartPickAnchor({ key: pickKey, r, c });
      updateChart({ pieTableSelection: { blockId, r1: r, c1: c, r2: r, c2: c } });
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
                updateChart({ pieTableSelection: undefined });
                return;
              }
              updateChart({ pieTableSelection: { blockId: nextId, r1: 0, r2: 9, c1: 0, c2: 1 } });
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
                const cur = chart.pieTableSelection;
                updateChart({ pieAxisMode: 'cols' });
                if (cur?.blockId) {
                  const left = Math.min(cur.c1, cur.c2);
                  updateChart({ pieTableSelection: { ...cur, c1: left, c2: left + 1 } });
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
                const cur = chart.pieTableSelection;
                updateChart({ pieAxisMode: 'rows' });
                if (cur?.blockId) {
                  const top = Math.min(cur.r1, cur.r2);
                  updateChart({ pieTableSelection: { ...cur, r1: top, r2: top + 1 } });
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
              : '普通模式：点击设定起点；Shift+点击设定终点。'} 会按上面的&quot;方向&quot;自动约束为 2 行或 2 列。
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
      {(chart.dataSource ?? 'manual') === 'manual' ? (
        <div className="flex flex-col gap-2">
          <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
            饼图：输入&quot;名称&quot;和&quot;数值&quot;。支持粘贴两列 TSV（Excel 复制）。
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
}
