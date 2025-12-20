export type BlockType = 'heading' | 'paragraph' | 'code' | 'math' | 'image' | 'list' | 'table';

export interface TypstBlock {
  id: string;
  type: BlockType;
  content: string;
  level?: number; // 用于标题级别 (1-6)
  language?: string; // 用于代码块语言
  width?: string; // 图片宽度 (e.g., "100%", "8cm")
  height?: string; // 图片高度 (e.g., "auto", "5cm")

  // Paragraph line spacing multiplier (e.g. 1, 1.2, 1.5, 2).
  // We store it as a multiplier because Typst's `par(leading:)` uses a length (default 0.65em),
  // and users expect “1x” to mean the default rather than `1em`.
  lineSpacing?: number;

  // Image caption text (global numbering/position is stored in DocumentSettings).
  caption?: string;

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
};

export const defaultDocumentSettings: DocumentSettings = {
  tableCaptionNumbering: false,
  imageCaptionNumbering: false,
  imageCaptionPosition: 'below',
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
