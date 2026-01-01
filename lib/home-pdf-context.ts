import { uploadPdfAndIngest } from './pdf-ingest';
import { uploadPdfAndParseTableFormulasWithVision } from './pdf-table-formula-vision';

export type HomePdfContext = {
  ocr_text_pages?: Array<{ page: number; text: string; error?: string | null }> | null;
  tables?: Array<{
    page: number;
    rows: number;
    cols: number;
    caption?: string;
    csv_preview?: string;
    has_empty_cells?: boolean;
    has_merged_cells?: boolean;
    // Keep only merge structure (no bbox) so AI can reproduce merged tables.
    cells_preview?: Array<
      Array<{ content?: string; rowspan?: number; colspan?: number; is_placeholder?: boolean }>
    >;
  }> | null;
  images?: Array<{ filename: string; url: string; page?: number | null; source?: 'embedded' | 'page_render' | string }> | null;
  table_formula_vision?: unknown;
};

export type PreparePdfContextDebug = {
  page_start?: number;
  page_end?: number;
  ingest?: unknown;
  table_formula_vision?: unknown;
};

type PdfIngestImage = {
  filename: string;
  url: string;
  page: number;
  mime?: string;
  width?: number | null;
  height?: number | null;
  source?: 'embedded' | 'page_render' | string;
};

type PdfIngestOcrPage = {
  page: number;
  text: string;
  error?: string | null;
};

type PdfIngestResult = {
  ocr_text_pages?: PdfIngestOcrPage[] | null;
  images?: PdfIngestImage[];
  tables?: unknown;
};

function _hasEmptyCellsFromCsv(csv: string | undefined): boolean {
  if (!csv) return false;
  // Heuristic: consecutive commas or line starts/ends with comma => empty cell.
  if (csv.includes(',,') || csv.includes('\n,') || csv.includes(',\n')) return true;
  for (const line of csv.split(/\r?\n/)) {
    const t = line.trimEnd();
    if (t.startsWith(',') || t.endsWith(',')) return true;
  }
  return false;
}

function extractCompactTables(
  payload: PdfIngestResult
): Array<{
  page: number;
  rows: number;
  cols: number;
  caption?: string;
  csv_preview?: string;
  has_empty_cells?: boolean;
  has_merged_cells?: boolean;
  cells_preview?: Array<Array<{ content?: string; rowspan?: number; colspan?: number; is_placeholder?: boolean }>>;
}> {
  const raw = (payload as { tables?: unknown })?.tables;
  if (!Array.isArray(raw)) return [];
  const out: Array<{
    page: number;
    rows: number;
    cols: number;
    caption?: string;
    csv_preview?: string;
    has_empty_cells?: boolean;
    has_merged_cells?: boolean;
    cells_preview?: Array<Array<{ content?: string; rowspan?: number; colspan?: number; is_placeholder?: boolean }>>;
  }> = [];
  for (const t of raw) {
    if (!t || typeof t !== 'object') continue;
    const tt = t as Record<string, unknown>;
    const page = Number(tt.page);
    const rows = Number(tt.rows);
    const cols = Number(tt.cols);
    const csv_preview = typeof tt.csv_preview === 'string' ? tt.csv_preview : undefined;
    const tablePayload = (tt.tablePayload && typeof tt.tablePayload === 'object') ? (tt.tablePayload as Record<string, unknown>) : null;
    const caption = typeof tablePayload?.caption === 'string' ? (tablePayload.caption as string) : undefined;

    const cellsRaw = (tablePayload as any)?.cells;
    let cells_preview: Array<Array<{ content?: string; rowspan?: number; colspan?: number; is_placeholder?: boolean }>> | undefined;
    let has_merged_cells = false;
    if (Array.isArray(cellsRaw)) {
      const preview: Array<Array<{ content?: string; rowspan?: number; colspan?: number; is_placeholder?: boolean }>> = [];
      for (const row of cellsRaw) {
        if (!Array.isArray(row)) continue;
        const prow: Array<{ content?: string; rowspan?: number; colspan?: number; is_placeholder?: boolean }> = [];
        for (const cell of row) {
          if (!cell || typeof cell !== 'object') {
            prow.push({ content: '' });
            continue;
          }
          const c = cell as Record<string, unknown>;
          const rowspan = typeof c.rowspan === 'number' ? c.rowspan : undefined;
          const colspan = typeof c.colspan === 'number' ? c.colspan : undefined;
          const is_placeholder = typeof c.is_placeholder === 'boolean' ? c.is_placeholder : undefined;
          if ((rowspan && rowspan > 1) || (colspan && colspan > 1) || is_placeholder) has_merged_cells = true;
          prow.push({
            content: typeof c.content === 'string' ? c.content : undefined,
            rowspan,
            colspan,
            is_placeholder,
          });
        }
        preview.push(prow);
      }
      if (preview.length) cells_preview = preview;
    }

    if (!Number.isFinite(page) || !Number.isFinite(rows) || !Number.isFinite(cols)) continue;
    out.push({
      page: Math.trunc(page),
      rows: Math.trunc(rows),
      cols: Math.trunc(cols),
      caption,
      csv_preview,
      has_empty_cells: _hasEmptyCellsFromCsv(csv_preview),
      has_merged_cells,
      cells_preview,
    });
  }
  return out;
}

function parseOptionalPage(value: string): number | undefined {
  const t = (value || '').trim();
  if (!t) return undefined;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 1 || !Number.isInteger(n)) {
    throw new Error('PDF 页码必须是 >= 1 的整数（留空表示不限制）');
  }
  return n;
}

export async function preparePdfContext(params: {
  projectId: string;
  pdfFile: File;
  pageStart: string;
  pageEnd: string;
  parserMode: 'local' | 'mineru';
  onStep: (label: string) => void;
}): Promise<HomePdfContext> {
  const { context } = await preparePdfContextWithDebug(params);
  return context;
}

export async function preparePdfContextWithDebug(params: {
  projectId: string;
  pdfFile: File;
  pageStart: string;
  pageEnd: string;
  parserMode: 'local' | 'mineru';
  onStep: (label: string) => void;
}): Promise<{ context: HomePdfContext; debug: PreparePdfContextDebug }> {
  const start = parseOptionalPage(params.pageStart);
  const end = parseOptionalPage(params.pageEnd);
  if (start !== undefined && end !== undefined && end < start) {
    throw new Error('PDF 结束页必须 >= 起始页');
  }

  params.onStep('PDF OCR / 解析（ocr_text_pages、images）');
  const ingest = (await uploadPdfAndIngest(params.projectId, params.pdfFile, {
    pageStart: start,
    pageEnd: end,
    ocrMath: true,
    ocrModel: 'glm-4.6v-flash',
    ocrScale: 2.0,
    parserMode: params.parserMode,
  })) as PdfIngestResult;

  params.onStep('表格公式识别（table formula vision）');
  const tableVision = await uploadPdfAndParseTableFormulasWithVision(params.projectId, params.pdfFile, {
    pageStart: start,
    pageEnd: end,
  }).catch((e) => ({ error: e instanceof Error ? e.message : String(e) }));

  params.onStep('图片提取（不做概括）');
  const images: PdfIngestImage[] = Array.isArray(ingest?.images) ? ingest.images : [];
  const embeddedImages = images.filter((x) => (x?.source ?? 'embedded') === 'embedded');

  const context: HomePdfContext = {
    ocr_text_pages: Array.isArray(ingest?.ocr_text_pages) ? ingest.ocr_text_pages : null,
    tables: extractCompactTables(ingest),
    images: embeddedImages.map((s) => ({
      filename: String(s.filename || ''),
      url: String(s.url || ''),
      page: s.page ?? null,
      source: s.source ?? 'embedded',
    })),
    table_formula_vision: tableVision,
  };

  const debug: PreparePdfContextDebug = {
    page_start: start,
    page_end: end,
    ingest,
    table_formula_vision: tableVision,
  };

  return { context, debug };
}
