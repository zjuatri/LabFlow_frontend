import { TypstBlock } from '@/lib/typst';
import { TableSelection, BarSeries, getTablePayloadById, getCellPlain } from './shared';

/**
 * 规范化表格选择为向量（单行或单列）
 */
export function normalizeToVector(snap: { blockId: string; r1: number; c1: number; r2: number; c2: number }): TableSelection {
  const top = Math.min(snap.r1, snap.r2);
  const bottom = Math.max(snap.r1, snap.r2);
  const left = Math.min(snap.c1, snap.c2);
  const right = Math.max(snap.c1, snap.c2);
  const height = bottom - top;
  const width = right - left;
  const asRow = top === bottom || width >= height;

  if (asRow) {
    const rr = top;
    return { blockId: snap.blockId, r1: rr, r2: rr, c1: left, c2: right };
  } else {
    const cc = left;
    return { blockId: snap.blockId, r1: top, r2: bottom, c1: cc, c2: cc };
  }
}

/**
 * 应用最后的表格选择到柱形图系列
 */
export function applyLastTableSelectionToBarSeries(
  seriesIndex: number,
  safeSeries: BarSeries[],
  lastTableSelection: { blockId: string; r1: number; c1: number; r2: number; c2: number } | null,
  updateChart: (partial: any) => void
): void {
  const snap = lastTableSelection;
  if (!snap) return;
  
  const base: BarSeries = safeSeries[seriesIndex]
    ?? { name: `系列${seriesIndex + 1}`, source: 'table', axisMode: 'cols', yRow: '', tableSelection: undefined };

  const top = Math.min(snap.r1, snap.r2);
  const bottom = Math.max(snap.r1, snap.r2);
  const left = Math.min(snap.c1, snap.c2);
  const right = Math.max(snap.c1, snap.c2);
  const normalized = base.axisMode === 'rows'
    ? { blockId: snap.blockId, r1: top, r2: top + 1, c1: left, c2: right }
    : { blockId: snap.blockId, r1: top, r2: bottom, c1: left, c2: left + 1 };

  const next = safeSeries.slice();
  next[seriesIndex] = { ...base, source: 'table', tableSelection: normalized };
  updateChart({ barSeries: next });
}

/**
 * 应用最后的表格选择到X轴数据
 */
export function applyLastTableSelectionToBarX(
  lastTableSelection: { blockId: string; r1: number; c1: number; r2: number; c2: number } | null,
  updateChart: (partial: any) => void
): void {
  const snap = lastTableSelection;
  if (!snap) return;
  const norm = normalizeToVector(snap);
  updateChart({ barXSource: 'table', barXTableSelection: norm });
}

/**
 * 格式化表格选择显示
 */
export function formatTableSelection(sel: TableSelection, allBlocks: TypstBlock[]): string {
  const tableLabel = allBlocks.find((b) => b.id === sel.blockId);
  const tableName = tableLabel ? `Table ${sel.blockId.slice(0, 4)}` : 'Unknown';
  const top = Math.min(sel.r1, sel.r2);
  const bottom = Math.max(sel.r1, sel.r2);
  const left = Math.min(sel.c1, sel.c2);
  const right = Math.max(sel.c1, sel.c2);
  return `${tableName}: R${top + 1}:${bottom + 1} C${left + 1}:${right + 1}`;
}

/**
 * 从表格选择读取数据
 */
export function readDataFromSelection(sel: TableSelection, allBlocks: TypstBlock[]): string[] {
  const payload = getTablePayloadById(sel.blockId, allBlocks);
  if (!payload) return [];
  
  const top = Math.min(sel.r1, sel.r2);
  const bottom = Math.max(sel.r1, sel.r2);
  const left = Math.min(sel.c1, sel.c2);
  const right = Math.max(sel.c1, sel.c2);

  const cells: string[] = [];
  if (top === bottom) {
    // 单行
    for (let c = left; c <= right; c++) {
      cells.push(getCellPlain(payload, top, c));
    }
  } else {
    // 单列或多列 - 读取第一列
    for (let r = top; r <= bottom; r++) {
      cells.push(getCellPlain(payload, r, left));
    }
  }
  return cells;
}

/**
 * 检测粘贴数据是否为表格格式
 */
export function detectPasteAsTable(text: string): { isTable: boolean; rows: string[][]; delimiter: string } {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return { isTable: false, rows: [], delimiter: '' };

  const tabCount = lines[0].split('\t').length;
  const commaCount = lines[0].split(',').length;

  let delimiter = tabCount > commaCount ? '\t' : ',';
  const rows = lines.map((line) => line.split(delimiter).map((cell) => cell.trim()));

  // 检查是否所有行都有相同的列数
  const colCount = rows[0].length;
  const isConsistent = rows.every((row) => row.length === colCount);

  return {
    isTable: isConsistent && colCount > 1,
    rows,
    delimiter,
  };
}

/**
 * 处理手动输入行的粘贴事件
 */
export function handleManualRowPaste(
  e: React.ClipboardEvent<HTMLInputElement>,
  currentValue: string,
  onUpdate: (newValue: string) => void
): void {
  const text = e.clipboardData.getData('text');
  const detection = detectPasteAsTable(text);

  if (detection.isTable && detection.rows.length === 1) {
    e.preventDefault();
    const newValue = detection.rows[0].join('\t');
    onUpdate(newValue);
  }
}
