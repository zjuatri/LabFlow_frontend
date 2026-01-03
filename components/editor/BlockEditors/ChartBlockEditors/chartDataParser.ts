import { TypstBlock } from '@/lib/typst';
import {
  ChartType,
  ChartData,
  ScatterSeries,
  BarSeries,
  PieRow,
  TableAxisMode,
  TableSelection,
} from './shared';

/**
 * 从 unknown 对象读取 TableSelection
 */
export function readTableSelection(selUnknown: unknown): TableSelection | undefined {
  if (!selUnknown || typeof selUnknown !== 'object') return undefined;
  
  const sel = selUnknown as Record<string, unknown>;
  const blockId = typeof sel['blockId'] === 'string' ? (sel['blockId'] as string) : '';
  const r1 = Number(sel['r1']);
  const c1 = Number(sel['c1']);
  const r2 = Number(sel['r2']);
  const c2 = Number(sel['c2']);
  
  if (blockId && Number.isFinite(r1) && Number.isFinite(c1) && Number.isFinite(r2) && Number.isFinite(c2)) {
    return { blockId, r1, c1, r2, c2 };
  }
  
  return undefined;
}

/**
 * 解析散点图系列数据
 */
export function parseScatterSeries(seriesUnknown: unknown, legacySelection?: TableSelection): ScatterSeries[] {
  if (!Array.isArray(seriesUnknown)) return [];
  
  return seriesUnknown
    .map((item, idx): ScatterSeries | null => {
      if (!item || typeof item !== 'object') return null;
      const it = item as Record<string, unknown>;
      const name = typeof it['name'] === 'string' ? (it['name'] as string) : `系列${idx + 1}`;
      const legacySource = it['source'] === 'table' ? 'table' : 'manual';
      const xSource = it['xSource'] === 'table' ? 'table' : it['xSource'] === 'manual' ? 'manual' : undefined;
      const ySource = it['ySource'] === 'table' ? 'table' : it['ySource'] === 'manual' ? 'manual' : undefined;
      const xRow = typeof it['xRow'] === 'string' ? (it['xRow'] as string) : '';
      const yRow = typeof it['yRow'] === 'string' ? (it['yRow'] as string) : '';
      const xTableSelection = readTableSelection(it['xTableSelection']);
      const yTableSelection = readTableSelection(it['yTableSelection']);

      const axisMode: TableAxisMode = it['axisMode'] === 'rows' ? 'rows' : 'cols';
      const legacySel = readTableSelection(it['tableSelection']);
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

/**
 * 解析柱形图系列数据
 */
export function parseBarSeries(barSeriesUnknown: unknown): BarSeries[] {
  if (!Array.isArray(barSeriesUnknown)) return [];
  
  return barSeriesUnknown
    .map((item, idx): BarSeries | null => {
      if (!item || typeof item !== 'object') return null;
      const it = item as Record<string, unknown>;
      const name = typeof it['name'] === 'string' ? (it['name'] as string) : `系列${idx + 1}`;
      const source = it['source'] === 'table' ? 'table' : 'manual';
      const axisMode: TableAxisMode = it['axisMode'] === 'rows' ? 'rows' : 'cols';
      const yRow = typeof it['yRow'] === 'string' ? (it['yRow'] as string) : '';
      const tableSelection = readTableSelection(it['tableSelection']);
      return { name, source, axisMode, yRow, tableSelection };
    })
    .filter(Boolean) as BarSeries[];
}

/**
 * 解析饼图行数据
 */
export function parsePieRows(pieRowsUnknown: unknown): PieRow[] {
  if (!Array.isArray(pieRowsUnknown)) return [];
  
  return pieRowsUnknown
    .map((item): PieRow | null => {
      if (!item || typeof item !== 'object') return null;
      const it = item as Record<string, unknown>;
      const label = typeof it['label'] === 'string' ? (it['label'] as string) : '';
      const value = typeof it['value'] === 'string' ? (it['value'] as string) : '';
      return { label, value };
    })
    .filter(Boolean) as PieRow[];
}

/**
 * 从手动文本迁移散点图数据
 */
export function migrateScatterFromManualText(manualText: string, legacySelection?: TableSelection): ScatterSeries[] {
  if (legacySelection) {
    const top = Math.min(legacySelection.r1, legacySelection.r2);
    const bottom = Math.max(legacySelection.r1, legacySelection.r2);
    const left = Math.min(legacySelection.c1, legacySelection.c2);
    const right = Math.max(legacySelection.c1, legacySelection.c2);
    const cX = left;
    const cY = Math.min(right, left + 1);
    return [{
      name: '系列1',
      xSource: 'table',
      ySource: 'table',
      xRow: '',
      yRow: '',
      xTableSelection: { blockId: legacySelection.blockId, r1: top, r2: bottom, c1: cX, c2: cX },
      yTableSelection: { blockId: legacySelection.blockId, r1: top, r2: bottom, c1: cY, c2: cY },
    }];
  }
  
  const lines = (manualText ?? '').replace(/\r/g, '').split('\n');
  const xRow = lines[0] ?? '';
  const yRow = lines[1] ?? '';
  return [{ name: '系列1', xSource: 'manual', ySource: 'manual', xRow, yRow, xTableSelection: undefined, yTableSelection: undefined }];
}

/**
 * 从手动文本迁移柱形图数据
 */
export function migrateBarFromManualText(manualText: string): { barSeries: BarSeries[]; barXRow: string } | null {
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
    return { barSeries: nextSeries, barXRow: xRowMigrated };
  }
  
  return null;
}

/**
 * 从手动文本迁移饼图数据
 */
export function migratePieFromManualText(manualText: string): PieRow[] {
  const lines = manualText.replace(/\r/g, '').split('\n').map((l) => l.trim()).filter(Boolean);
  const rows = lines.map((l) => l.split(/\t|,/).map((x) => x.trim()));
  return rows
    .map((r) => {
      if (r.length >= 2) return { label: r.length >= 3 ? (r[1] ?? '') : (r[0] ?? ''), value: r.length >= 3 ? (r[2] ?? '') : (r[1] ?? '') };
      return null;
    })
    .filter(Boolean) as PieRow[];
}

/**
 * 创建默认的 ChartData
 */
export function createDefaultChartData(): ChartData {
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

/**
 * 安全地解析图表内容
 */
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

    const legacySelection = readTableSelection(parsed['tableSelection']);

    let scatterSeries = parseScatterSeries(parsed['scatterSeries'], legacySelection);
    let barSeries = parseBarSeries(parsed['barSeries']);
    const barXRow = typeof parsed['barXRow'] === 'string' ? (parsed['barXRow'] as string) : '';
    const barXSource: 'manual' | 'table' = parsed['barXSource'] === 'table' ? 'table' : 'manual';
    const barXTableSelection = readTableSelection(parsed['barXTableSelection']);
    const pieAxisMode: TableAxisMode = parsed['pieAxisMode'] === 'rows' ? 'rows' : 'cols';
    const pieTableSelection = readTableSelection(parsed['pieTableSelection']);
    let pieRows = parsePieRows(parsed['pieRows']);

    const dataSource: 'manual' | 'table' = parsed['dataSource'] === 'table' ? 'table' : 'manual';
    const manualText = typeof parsed['manualText'] === 'string' ? (parsed['manualText'] as string) : '';

    // 迁移旧数据格式
    if (scatterSeries.length === 0) {
      scatterSeries = migrateScatterFromManualText(manualText, dataSource === 'table' ? legacySelection : undefined);
    }

    if ((chartType === 'bar' || chartType === 'hbar') && barSeries.length === 0 && barXRow.trim() === '' && manualText.trim()) {
      const migrated = migrateBarFromManualText(manualText);
      if (migrated) {
        barSeries = migrated.barSeries;
      }
    }

    if (chartType === 'pie' && pieRows.length === 0 && manualText.trim()) {
      pieRows = migratePieFromManualText(manualText);
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
    return createDefaultChartData();
  }
}
