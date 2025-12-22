'use client';

import { TypstBlock } from '@/lib/typst';
import { useState } from 'react';
import Image from 'next/image';
import ScatterEditor from './ChartBlockEditors/ScatterEditor';
import BarEditor from './ChartBlockEditors/BarEditor';
import HBarEditor from './ChartBlockEditors/HBarEditor';
import PieEditor from './ChartBlockEditors/PieEditor';
import {
  ChartType,
  ChartData,
  ScatterSeries,
  BarSeries,
  PieRow,
  TableAxisMode,
  TableSelection,
  getTablePayloadById,
  getCellPlain,
} from './ChartBlockEditors/shared';

export type ChartRenderRequest = {
  chart_type: ChartType;
  title: string;
  x_label: string;
  y_label: string;
  legend: boolean;
  data: Array<Record<string, unknown>>;
};

interface ChartBlockEditorProps {
  block: TypstBlock;
  allBlocks: TypstBlock[];
  availableTables: Array<{ id: string; label: string }>;
  onUpdate: (update: Partial<TypstBlock>) => void;
  lastTableSelection: { blockId: string; r1: number; c1: number; r2: number; c2: number } | null;
  onRenderChart: (payload: ChartRenderRequest) => Promise<string>;
}

export function safeParseChartContent(content: string): ChartData {
  try {
    const parsedUnknown: unknown = JSON.parse(content || '{}');
    if (!parsedUnknown || typeof parsedUnknown !== 'object') throw new Error('bad');
    const parsed = parsedUnknown as Record<string, unknown>;
    const chartTypeRaw = parsed['chartType'] ?? 'scatter';
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
    const barXSource: 'manual' | 'table' = parsed['barXSource'] === 'table' ? 'table' : 'manual';
    const barXTableSelection = readSelection(parsed['barXTableSelection']);

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

    const dataSource: 'manual' | 'table' = parsed['dataSource'] === 'table' ? 'table' : 'manual';
    const manualText = typeof parsed['manualText'] === 'string' ? (parsed['manualText'] as string) : '';

    if (scatterSeries.length === 0) {
      if (dataSource === 'table' && legacySelection) {
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
      tableSelection: legacySelection,
      scatterSeries,
      barXSource,
      barXRow,
      barXTableSelection,
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
      scatterSeries: [{ name: '系列1', xSource: 'manual', ySource: 'manual', xRow: '', yRow: '', xTableSelection: undefined, yTableSelection: undefined }],
      barXSource: 'manual',
      barXRow: '',
      barXTableSelection: undefined,
      barSeries: [{ name: '系列1', source: 'manual', axisMode: 'cols', yRow: '', tableSelection: undefined }],
      pieRows: [{ label: '', value: '' }],
      pieAxisMode: 'cols',
      pieTableSelection: undefined,
      imageUrl: '',
    };
  }
}

export default function ChartBlockEditor({
  block,
  allBlocks,
  availableTables,
  onUpdate,
  lastTableSelection,
  onRenderChart,
}: ChartBlockEditorProps) {
  const [chartSelectionMode, setChartSelectionMode] = useState(false);
  const [chartPickAnchor, setChartPickAnchor] = useState<{ key: string; r: number; c: number } | null>(null);

  const chart = safeParseChartContent(block.content);

  const updateChart = (partial: Partial<ChartData>) => {
    const next = { ...chart, ...partial };
    onUpdate({ content: JSON.stringify(next) });
  };

  const handleRenderChartClick = async () => {
    try {
      const data: Array<Record<string, unknown>> = [];

      const readVectorFromTableSelection = (sel: TableSelection): string[] => {
        const payload = getTablePayloadById(sel.blockId, allBlocks);
        if (!payload) return [];
        const top = Math.min(sel.r1, sel.r2);
        const bottom = Math.max(sel.r1, sel.r2);
        const left = Math.min(sel.c1, sel.c2);
        const right = Math.max(sel.c1, sel.c2);

        const height = bottom - top;
        const width = right - left;
        const asRow = top === bottom || width >= height;

        if (asRow) {
          const rr = Math.max(0, Math.min((payload.rows ?? 1) - 1, top));
          const out: string[] = [];
          for (let c = left; c <= right; c++) out.push(getCellPlain(payload, rr, c));
          return out;
        }

        const cc = Math.max(0, Math.min((payload.cols ?? 1) - 1, left));
        const out: string[] = [];
        for (let r = top; r <= bottom; r++) out.push(getCellPlain(payload, r, cc));
        return out;
      };

      // 根据图表类型转换数据
      if (chart.chartType === 'scatter') {
        // 散点图数据转换
        const series = chart.scatterSeries ?? [];
        for (const s of series) {
          const xSource = s.xSource ?? 'manual';
          const ySource = s.ySource ?? 'manual';
          const xCells = xSource === 'manual' ? (s.xRow ?? '').split('\t').map((x) => x.trim()).filter(Boolean) : [];
          const yCells = ySource === 'manual' ? (s.yRow ?? '').split('\t').map((x) => x.trim()).filter(Boolean) : [];

          let xVals: string[] = [];
          let yVals: string[] = [];

          if (xSource === 'table' && s.xTableSelection) {
            const payload = getTablePayloadById(s.xTableSelection.blockId, allBlocks);
            if (payload) {
              const sel = s.xTableSelection;
              const top = Math.min(sel.r1, sel.r2);
              const bottom = Math.max(sel.r1, sel.r2);
              const left = Math.min(sel.c1, sel.c2);
              const right = Math.max(sel.c1, sel.c2);
              for (let r = top; r <= bottom; r++) {
                for (let c = left; c <= right; c++) {
                  const val = getCellPlain(payload, r, c);
                  if (val) xVals.push(val);
                }
              }
            }
          } else {
            xVals = xCells;
          }

          if (ySource === 'table' && s.yTableSelection) {
            const payload = getTablePayloadById(s.yTableSelection.blockId, allBlocks);
            if (payload) {
              const sel = s.yTableSelection;
              const top = Math.min(sel.r1, sel.r2);
              const bottom = Math.max(sel.r1, sel.r2);
              const left = Math.min(sel.c1, sel.c2);
              const right = Math.max(sel.c1, sel.c2);
              for (let r = top; r <= bottom; r++) {
                for (let c = left; c <= right; c++) {
                  const val = getCellPlain(payload, r, c);
                  if (val) yVals.push(val);
                }
              }
            }
          } else {
            yVals = yCells;
          }

          const len = Math.min(xVals.length, yVals.length);
          for (let i = 0; i < len; i++) {
            const x = parseFloat(xVals[i]);
            const y = parseFloat(yVals[i]);
            if (Number.isFinite(x) && Number.isFinite(y)) {
              data.push({ x, y, series: s.name || '系列1' });
            }
          }
        }
      } else if (chart.chartType === 'bar' || chart.chartType === 'hbar') {
        // 柱形图/条形图数据转换
        const labelsOrder: string[] = [];
        const barSeries = chart.barSeries ?? [];

        const ensureLabel = (label: string) => {
          const t = (label ?? '').trim();
          if (!t) return;
          if (!labelsOrder.includes(t)) labelsOrder.push(t);
        };

        const xSource = chart.barXSource ?? 'manual';
        const sharedXLabels = xSource === 'table' && chart.barXTableSelection
          ? readVectorFromTableSelection(chart.barXTableSelection)
          : (chart.barXRow ?? '').split('\t');

        for (const lab of sharedXLabels) ensureLabel(lab);

        // 收集所有系列的数据
        const seriesData = new Map<string, Map<string, number>>();

        for (const s of barSeries) {
          const seriesName = s.name || '系列1';
          const seriesMap = new Map<string, number>();

          if (s.source === 'manual') {
            // 手动输入：使用共享的 X 行和系列的 Y 行
            const xCells = sharedXLabels.map((x) => (x ?? '').trim());
            const yCells = (s.yRow ?? '').split('\t').map((x) => (x ?? '').trim());
            const len = Math.min(xCells.length, yCells.length);
            for (let i = 0; i < len; i++) {
              const label = xCells[i];
              const val = parseFloat(yCells[i]);
              if (label && Number.isFinite(val)) {
                ensureLabel(label);
                seriesMap.set(label, val);
              }
            }
          } else if (s.source === 'table' && s.tableSelection) {
            // 从表格导入
            const payload = getTablePayloadById(s.tableSelection.blockId, allBlocks);
            if (payload) {
              const sel = s.tableSelection;
              const top = Math.min(sel.r1, sel.r2);
              const bottom = Math.max(sel.r1, sel.r2);
              const left = Math.min(sel.c1, sel.c2);
              const right = Math.max(sel.c1, sel.c2);

              if (s.axisMode === 'rows') {
                // 行模式：第一行是 X，第二行是 Y
                const xRow = top;
                const yRow = Math.min(bottom, top + 1);
                for (let c = left; c <= right; c++) {
                  const label = getCellPlain(payload, xRow, c);
                  const val = parseFloat(getCellPlain(payload, yRow, c));
                  if (label && Number.isFinite(val)) {
                    ensureLabel(label);
                    seriesMap.set(label, val);
                  }
                }
              } else {
                // 列模式：第一列是 X，第二列是 Y
                const xCol = left;
                const yCol = Math.min(right, left + 1);
                for (let r = top; r <= bottom; r++) {
                  const label = getCellPlain(payload, r, xCol);
                  const val = parseFloat(getCellPlain(payload, r, yCol));
                  if (label && Number.isFinite(val)) {
                    ensureLabel(label);
                    seriesMap.set(label, val);
                  }
                }
              }
            }
          }

          seriesData.set(seriesName, seriesMap);
        }

        // 构建数据数组
        for (const label of labelsOrder) {
          for (const [seriesName, seriesMap] of seriesData) {
            const val = seriesMap.get(label);
            if (val !== undefined) {
              data.push({ label: label, value: val, series: seriesName });
            }
          }
        }
      } else if (chart.chartType === 'pie') {
        // 饼图数据转换
        if (chart.dataSource === 'manual') {
          for (const row of chart.pieRows ?? []) {
            const label = (row.label ?? '').trim();
            const val = parseFloat(row.value ?? '');
            if (label && Number.isFinite(val)) {
              data.push({ label, value: val });
            }
          }
        } else if (chart.dataSource === 'table' && chart.pieTableSelection) {
          const payload = getTablePayloadById(chart.pieTableSelection.blockId, allBlocks);
          if (payload) {
            const sel = chart.pieTableSelection;
            const top = Math.min(sel.r1, sel.r2);
            const bottom = Math.max(sel.r1, sel.r2);
            const left = Math.min(sel.c1, sel.c2);
            const right = Math.max(sel.c1, sel.c2);

            if (chart.pieAxisMode === 'rows') {
              // 行模式：第一行是标签，第二行是值
              const labelRow = top;
              const valueRow = Math.min(bottom, top + 1);
              for (let c = left; c <= right; c++) {
                const label = getCellPlain(payload, labelRow, c);
                const val = parseFloat(getCellPlain(payload, valueRow, c));
                if (label && Number.isFinite(val)) {
                  data.push({ label, value: val });
                }
              }
            } else {
              // 列模式：第一列是标签，第二列是值
              const labelCol = left;
              const valueCol = Math.min(right, left + 1);
              for (let r = top; r <= bottom; r++) {
                const label = getCellPlain(payload, r, labelCol);
                const val = parseFloat(getCellPlain(payload, r, valueCol));
                if (label && Number.isFinite(val)) {
                  data.push({ label, value: val });
                }
              }
            }
          }
        }
      }

      // 调用渲染函数
      const payload = {
        chart_type: chart.chartType,
        title: chart.title,
        x_label: chart.xLabel,
        y_label: chart.yLabel,
        legend: chart.legend,
        data,
      };

      const imageUrl = await onRenderChart(payload);

      // 更新图片URL
      updateChart({ imageUrl });
    } catch (error) {
      console.error('生成图表失败:', error);
      throw error;
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {/* 图表类型选择器 */}
      <div className="flex flex-wrap gap-2 items-center">
        <label className="text-xs text-zinc-600 dark:text-zinc-400">类型</label>
        <select
          value={chart.chartType}
          onChange={(e) => updateChart({ chartType: e.target.value as ChartType })}
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
          checked={!!chart.legend}
          onChange={(e) => updateChart({ legend: e.target.checked })}
        />
      </div>

      {/* 宽度滑块 */}
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

      {/* 标题输入 */}
      <input
        type="text"
        value={chart.title}
        onChange={(e) => updateChart({ title: e.target.value })}
        className="w-full p-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100"
        placeholder="图表标题"
      />

      {/* X/Y 轴标签 */}
      <div className="grid grid-cols-2 gap-2">
        <input
          type="text"
          value={chart.xLabel}
          onChange={(e) => updateChart({ xLabel: e.target.value })}
          className="w-full p-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100"
          placeholder="X 轴标签"
        />
        <input
          type="text"
          value={chart.yLabel}
          onChange={(e) => updateChart({ yLabel: e.target.value })}
          className="w-full p-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100"
          placeholder="Y 轴标签"
        />
      </div>

      {/* 饼图数据来源选择 */}
      {chart.chartType === 'pie' && (
        <div className="flex items-center gap-3 flex-wrap">
          <label className="text-xs text-zinc-600 dark:text-zinc-400">数据来源</label>
          <label className="text-xs flex items-center gap-1">
            <input
              type="radio"
              name={`chart-source-${block.id}`}
              checked={(chart.dataSource ?? 'manual') === 'manual'}
              onChange={() => updateChart({ dataSource: 'manual' })}
            />
            手动输入
          </label>
          <label className="text-xs flex items-center gap-1">
            <input
              type="radio"
              name={`chart-source-${block.id}`}
              checked={(chart.dataSource ?? 'manual') === 'table'}
              onChange={() => updateChart({ dataSource: 'table' })}
            />
            从表格导入
          </label>
        </div>
      )}

      {/* 根据图表类型渲染对应的编辑器 */}
      {chart.chartType === 'scatter' && (
        <ScatterEditor
          chart={chart}
          block={block}
          allBlocks={allBlocks}
          availableTables={availableTables}
          updateChart={updateChart}
          lastTableSelection={lastTableSelection}
          chartSelectionMode={chartSelectionMode}
          setChartSelectionMode={setChartSelectionMode}
          chartPickAnchor={chartPickAnchor}
          setChartPickAnchor={setChartPickAnchor}
        />
      )}

      {chart.chartType === 'bar' && (
        <BarEditor
          chart={chart}
          block={block}
          allBlocks={allBlocks}
          availableTables={availableTables}
          updateChart={updateChart}
          lastTableSelection={lastTableSelection}
          chartSelectionMode={chartSelectionMode}
          setChartSelectionMode={setChartSelectionMode}
          chartPickAnchor={chartPickAnchor}
          setChartPickAnchor={setChartPickAnchor}
        />
      )}

      {chart.chartType === 'hbar' && (
        <HBarEditor
          chart={chart}
          block={block}
          allBlocks={allBlocks}
          availableTables={availableTables}
          updateChart={updateChart}
          lastTableSelection={lastTableSelection}
          chartSelectionMode={chartSelectionMode}
          setChartSelectionMode={setChartSelectionMode}
          chartPickAnchor={chartPickAnchor}
          setChartPickAnchor={setChartPickAnchor}
        />
      )}

      {chart.chartType === 'pie' && (
        <PieEditor
          chart={chart}
          block={block}
          allBlocks={allBlocks}
          availableTables={availableTables}
          updateChart={updateChart}
          lastTableSelection={lastTableSelection}
          chartSelectionMode={chartSelectionMode}
          setChartSelectionMode={setChartSelectionMode}
          chartPickAnchor={chartPickAnchor}
          setChartPickAnchor={setChartPickAnchor}
        />
      )}

      {/* 预览图片 */}
      {(chart.imageUrl ?? '').trim() ? (
        <div className="flex flex-col gap-2">
          <Image
            src={chart.imageUrl}
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

      {/* 生成按钮 */}
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
  );
}