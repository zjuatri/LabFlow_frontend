export type BlockType = 'heading' | 'paragraph' | 'code' | 'math' | 'image' | 'list' | 'table' | 'chart' | 'vertical_space';

export type ChartType = 'scatter' | 'bar' | 'pie' | 'hbar';
export type ChartDataSource = 'manual' | 'table';

export type PersistedChartSelection = {
  blockId: string;
  r1: number;
  c1: number;
  r2: number;
  c2: number;
};

export type PersistedChartPayload = {
  chartType: ChartType;
  title: string;
  xLabel: string;
  yLabel: string;
  legend: boolean;
  dataSource: ChartDataSource;

  // Manual input (CSV/TSV-like). Kept so user can keep editing.
  manualText: string;

  // When importing from an existing table selection.
  tableSelection?: PersistedChartSelection;

  // Rendered image URL (served by backend static storage).
  imageUrl?: string;
};

export interface TypstBlock {
  id: string;
  type: BlockType;
  content: string;
  // Optional UI hint (editor-only). Not guaranteed to round-trip through Typst.
  placeholder?: string;
  level?: number; // 用于标题级别 (1-6)
  language?: string; // 用于代码块语言
  width?: string; // 图片宽度 (e.g., "100%", "8cm")
  height?: string; // 图片高度 (e.g., "auto", "5cm")
  align?: 'left' | 'center' | 'right'; // 图片/段落对齐方式
  font?: string; // 段落字体 (e.g., "SimSun", "SimHei", "KaiTi", "FangSong")
  fontSize?: string; // Block-specific font size (e.g., "12pt")

  // Paragraph line spacing multiplier (e.g. 1, 1.2, 1.5, 2).
  // We store it as a multiplier because Typst's `par(leading:)` uses a length (default 0.65em),
  // and users expect “1x” to mean the default rather than `1em`.
  lineSpacing?: number;

  // Image caption text (global numbering/position is stored in DocumentSettings).
  caption?: string;

  // Chart blocks store their editor state inside content (PersistedChartPayload JSON).

  // Math block dual-format support.
  // - mathFormat: which editor the user is currently using
  // - mathLatex/mathTypst: synced representations (best-effort conversion)
  mathFormat?: 'latex' | 'typst';
  mathLatex?: string;
  mathTypst?: string;

  // Multi-line math support
  mathLines?: Array<{ latex: string; typst: string }>;
  mathBrace?: boolean; // Whether to show left brace (like cases)
}

export type DocumentSettings = {
  tableCaptionNumbering: boolean;
  imageCaptionNumbering: boolean;
  imageCaptionPosition: 'above' | 'below';
  fontSize: string;
};

export const defaultDocumentSettings: DocumentSettings = {
  tableCaptionNumbering: true,
  imageCaptionNumbering: true,
  imageCaptionPosition: 'below',
  fontSize: '10.5pt',
};

export type PersistedMathPayload = {
  format?: 'latex' | 'typst';
  latex?: string;
  typst?: string;
  lines?: Array<{ latex: string; typst: string }>;
  brace?: boolean;
};

export type TableStyle = 'normal' | 'three-line';

export type PersistedTableCell = {
  content: string; // Typst inline markup (same as paragraph inline)
  rowspan?: number;
  colspan?: number;
  hidden?: boolean; // covered by a merged cell
};

export type PersistedTablePayload = {
  caption?: string;
  style?: TableStyle;
  rows: number;
  cols: number;
  cells: PersistedTableCell[][];
};
