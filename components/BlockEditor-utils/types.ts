export type InlineMathFormat = 'latex' | 'typst';

export type InlineMathState = {
  scope: 'main' | 'table';
  id: string;
  format: InlineMathFormat;
  latex: string;
  typst: string;
  displayMode?: boolean;
};

export type TableStyle = 'normal' | 'three-line';

export type TableCell = {
  content: string;
  rowspan?: number;
  colspan?: number;
  hidden?: boolean;
};

export type TablePayload = {
  caption?: string;
  style?: TableStyle;
  rows: number;
  cols: number;
  cells: TableCell[][];
};
