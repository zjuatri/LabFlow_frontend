// 共享类型和工具函数
import { TypstBlock } from '@/lib/typst';
import { parseTablePayload, normalizeTablePayload } from '@/components/editor/BlockEditor-utils/table-utils';
import { typstInlineToPlainText } from '@/components/editor/BlockEditor-utils/utils';

export type ChartType = 'scatter' | 'bar' | 'pie' | 'hbar';
export type TableAxisMode = 'cols' | 'rows';
export type TableSelection = { blockId: string; r1: number; c1: number; r2: number; c2: number };

export interface ScatterSeries {
  name: string;
  xSource?: 'manual' | 'table';
  ySource?: 'manual' | 'table';
  xRow?: string;
  yRow?: string;
  xTableSelection?: TableSelection;
  yTableSelection?: TableSelection;
}

export interface BarSeries {
  name: string;
  source: 'manual' | 'table';
  axisMode: TableAxisMode;
  yRow?: string;
  tableSelection?: TableSelection;
}

export interface PieRow {
  label: string;
  value: string;
}

export interface ChartData {
  chartType: ChartType;
  title: string;
  xLabel: string;
  yLabel: string;
  legend: boolean;
  dataSource: 'manual' | 'table';
  manualText: string;
  tableSelection?: TableSelection;
  scatterSeries: ScatterSeries[];
  barXSource?: 'manual' | 'table';
  barXRow: string;
  barXTableSelection?: TableSelection;
  barSeries: BarSeries[];
  pieRows: PieRow[];
  pieAxisMode: TableAxisMode;
  pieTableSelection?: TableSelection;
  imageUrl: string;
}

export const parseRow = (row: string | undefined) => (row ?? '').split('\t');

export const toRow = (cells: string[]) => {
  let end = cells.length - 1;
  while (end >= 0 && (cells[end] ?? '').trim() === '') end--;
  const trimmed = cells.slice(0, Math.max(0, end + 1));
  return trimmed.join('\t');
};

export const isInRect = (
  r: number,
  c: number,
  sel: { r1: number; c1: number; r2: number; c2: number } | undefined
) => {
  if (!sel) return false;
  const top = Math.min(sel.r1, sel.r2);
  const bottom = Math.max(sel.r1, sel.r2);
  const left = Math.min(sel.c1, sel.c2);
  const right = Math.max(sel.c1, sel.c2);
  return r >= top && r <= bottom && c >= left && c <= right;
};

export const getTablePayloadById = (
  id: string,
  allBlocks: TypstBlock[]
): ReturnType<typeof normalizeTablePayload> | null => {
  const tableBlock = allBlocks.find((b) => b.id === id && b.type === 'table');
  if (!tableBlock) return null;
  try {
    return normalizeTablePayload(parseTablePayload(tableBlock.content));
  } catch {
    return null;
  }
};

export const getCellPlain = (
  payload: ReturnType<typeof getTablePayloadById>,
  r: number,
  c: number
) => {
  if (!payload) return '';
  const cell = payload.cells?.[r]?.[c];
  if (!cell || cell.hidden) return '';
  return typstInlineToPlainText(cell.content ?? '').trim();
};
