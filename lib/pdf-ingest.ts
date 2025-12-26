import { getToken } from './auth';

// In production/Docker we typically proxy /api/* through the same origin.
// For local dev, set NEXT_PUBLIC_BACKEND_URL=http://localhost:8000.
const BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? '';

function getBackendBaseUrlForBrowser(): string {
  // If user didn't set NEXT_PUBLIC_BACKEND_URL, assume same-origin.
  // This makes it work behind a reverse proxy as well.
  return BASE_URL;
}

export type PdfIngestOptions = {
  pageStart?: number;
  pageEnd?: number;
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
