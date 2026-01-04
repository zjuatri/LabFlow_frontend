import { TypstBlock } from '@/lib/typst';
import {
  ChartData,
  TableSelection,
  getTablePayloadById,
  getCellPlain,
} from './shared';
import { ChartRenderRequest } from '../ChartBlockEditor';

/**
 * 从表格选区读取向量数据
 */
export function readVectorFromTableSelection(sel: TableSelection, allBlocks: TypstBlock[]): string[] {
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
}

/**
 * 转换散点图数据
 */
export function convertScatterData(chart: ChartData, allBlocks: TypstBlock[]): Array<Record<string, unknown>> {
  const data: Array<Record<string, unknown>> = [];
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

  return data;
}

/**
 * 转换柱形图/条形图数据
 */
export function convertBarData(chart: ChartData, allBlocks: TypstBlock[]): Array<Record<string, unknown>> {
  const data: Array<Record<string, unknown>> = [];
  const labelsOrder: string[] = [];
  const barSeries = chart.barSeries ?? [];

  const ensureLabel = (label: string) => {
    const t = (label ?? '').trim();
    if (!t) return;
    if (!labelsOrder.includes(t)) labelsOrder.push(t);
  };

  const xSource = chart.barXSource ?? 'manual';
  const sharedXLabels = xSource === 'table' && chart.barXTableSelection
    ? readVectorFromTableSelection(chart.barXTableSelection, allBlocks)
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

  return data;
}

/**
 * 转换饼图数据
 */
export function convertPieData(chart: ChartData, allBlocks: TypstBlock[]): Array<Record<string, unknown>> {
  const data: Array<Record<string, unknown>> = [];

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

  return data;
}

/**
 * 将图表数据转换为渲染请求
 */
export function convertChartToRenderRequest(chart: ChartData, allBlocks: TypstBlock[]): ChartRenderRequest {
  let data: Array<Record<string, unknown>> = [];

  if (chart.chartType === 'scatter') {
    data = convertScatterData(chart, allBlocks);
  } else if (chart.chartType === 'bar' || chart.chartType === 'hbar') {
    data = convertBarData(chart, allBlocks);
  } else if (chart.chartType === 'pie') {
    data = convertPieData(chart, allBlocks);
  }

  return {
    chart_type: chart.chartType,
    title: chart.title,
    x_label: chart.xLabel,
    y_label: chart.yLabel,
    legend: chart.legend,
    data,
  };
}
