import { getToken } from './auth';

// For this long-running vision endpoint, we bypass Next.js proxy entirely
// and call the backend directly to avoid the ~30s proxy timeout.
// Note: In browser, process.env may not be available at runtime, so we hardcode fallback.
function getBackendBaseUrlForBrowser(): string {
  // Try env var first (works during SSR or if bundled), fallback to localhost for dev
  if (typeof window !== 'undefined') {
    // Browser runtime: env vars must be inlined at build time
    return process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
  }
  return process.env.NEXT_PUBLIC_BACKEND_URL || process.env.BACKEND_URL || 'http://localhost:8000';
}

export type PdfTableFormulaVisionOptions = {
  pageStart?: number;
  pageEnd?: number;
};

export type PdfTableFormulaVisionCell = {
  content: string;
  bbox: { x0: number; top: number; x1: number; bottom: number };
  latex: string | null;
  row?: number;
  col?: number;
  rowspan?: number;
  colspan?: number;
};

export type PdfTableFormulaVisionTable = {
  page: number;
  table_index: number;
  cells: PdfTableFormulaVisionCell[];
  rows?: number;
  cols?: number;
};

export type PdfTableFormulaVisionResponse = {
  project_id: string;
  filename: string;
  model: string;
  tables: PdfTableFormulaVisionTable[];
  rendered_cell_images: Array<{
    page: number;
    table_index: number;
    cell_index: number;
    filename: string;
    url: string;
    width: number;
    height: number;
    bbox: { x0: number; top: number; x1: number; bottom: number };
  }>;
};

export async function uploadPdfAndParseTableFormulasWithVision(
  projectId: string,
  file: File,
  options: PdfTableFormulaVisionOptions = {}
): Promise<PdfTableFormulaVisionResponse> {
  const token = getToken();

  const form = new FormData();
  form.append('file', file, file.name);

  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  const backend = getBackendBaseUrlForBrowser();
  const qs = new URLSearchParams();
  if (typeof options.pageStart === 'number') qs.set('page_start', String(options.pageStart));
  if (typeof options.pageEnd === 'number') qs.set('page_end', String(options.pageEnd));

  const url = `${backend}/api/projects/${encodeURIComponent(projectId)}/pdf/table/formula/vision${
    qs.toString() ? `?${qs.toString()}` : ''
  }`;

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: form,
  });

  if (!res.ok) {
    let detail = 'Request failed';
    const text = await res.text();
    try {
      const data = JSON.parse(text);
      detail = data?.detail ?? detail;
    } catch {
      detail = text || detail;
    }
    throw new Error(detail);
  }

  return res.json();
}
