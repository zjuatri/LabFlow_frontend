import { getToken } from './auth';

// In production/Docker we typically proxy /api/* through the same origin.
// For local dev, set NEXT_PUBLIC_BACKEND_URL=http://localhost:8000.
const BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? '';

function getBackendBaseUrlForBrowser(): string {
  // If user explicitly set NEXT_PUBLIC_BACKEND_URL, use it.
  if (BASE_URL) return BASE_URL;

  // For local dev: default to localhost:8000 to bypass Next.js rewrite
  // (rewrite has 30s timeout and will kill long-running OCR requests).
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    return 'http://localhost:8000';
  }

  // Production: same-origin (assumes reverse proxy routes /api/* to backend).
  return '';
}

export type PdfIngestOptions = {
  pageStart?: number;
  pageEnd?: number;
  ocrMath?: boolean;
  ocrModel?: string;
  ocrScale?: number;
  parserMode?: 'local' | 'mineru';
};

export async function uploadPdfAndIngest(
  projectId: string,
  file: File,
  options: PdfIngestOptions = {}
): Promise<unknown> {
  const token = getToken();

  const form = new FormData();
  form.append('file', file, file.name);

  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  const backend = getBackendBaseUrlForBrowser();
  const qs = new URLSearchParams();
  if (typeof options.pageStart === 'number') qs.set('page_start', String(options.pageStart));
  if (typeof options.pageEnd === 'number') qs.set('page_end', String(options.pageEnd));
  if (typeof options.ocrMath === 'boolean') qs.set('ocr_math', options.ocrMath ? '1' : '0');
  if (typeof options.ocrModel === 'string' && options.ocrModel.trim()) qs.set('ocr_model', options.ocrModel.trim());
  if (typeof options.ocrScale === 'number' && Number.isFinite(options.ocrScale)) qs.set('ocr_scale', String(options.ocrScale));
  if (options.parserMode) qs.set('parser_mode', options.parserMode);
  const url = `${backend}/api/projects/${encodeURIComponent(projectId)}/pdf/ingest${qs.toString() ? `?${qs.toString()}` : ''}`;

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: form,
  });

  if (!res.ok) {
    let detail = 'Request failed';
    try {
      const data = await res.json();
      detail = data?.detail ?? detail;
    } catch {
      // ignore
    }
    throw new Error(detail);
  }

  return res.json();
}
