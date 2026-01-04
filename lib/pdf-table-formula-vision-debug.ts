import { getToken } from './auth';

const BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? '';

function getBackendBaseUrlForBrowser(): string {
  return BASE_URL;
}

export async function uploadPdfAndParseTableFormulasWithVisionDebug(
  projectId: string,
  file: File,
  options: { pageStart?: number; pageEnd?: number } = {}
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

  const url = `${backend}/api/projects/${encodeURIComponent(projectId)}/pdf/table/formula/vision${qs.toString() ? `?${qs.toString()}` : ''
    }`;

  const res = await fetch(url, { method: 'POST', headers, body: form });
  const text = await res.text();
  let json: Record<string, unknown> | null = null;
  try {
    json = JSON.parse(text);
  } catch {
    // ignore
  }

  if (!res.ok) {
    const detail = json?.detail ?? text ?? `HTTP ${res.status}`;
    throw new Error(String(detail));
  }

  return json ?? text;
}
