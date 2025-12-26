export type AiStreamEvent =
  | { type: 'meta'; model: string }
  | { type: 'thought'; delta: string }
  | { type: 'content'; delta: string }
  | { type: 'usage'; usage: { prompt_tokens?: number | null; completion_tokens?: number | null; total_tokens?: number | null } }
  | { type: 'done' }
  | { type: 'error'; detail: string };

function parseSseLines(chunk: string): string[] {
  // normalize \r\n and split
  return chunk.replace(/\r\n/g, '\n').split('\n');
}

export async function streamChat(
  url: string,
  init: RequestInit,
  onEvent: (evt: AiStreamEvent) => void,
  timeoutMs: number = 0
) {
  const controller = new AbortController();
  const timeoutId = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null;

  const res = await fetch(url, { ...init, signal: controller.signal });
  if (!res.ok) {
    let detail = 'Request failed';
    try {
      const data = await res.json();
      detail = data?.detail ?? detail;
    } catch {
      // ignore
    }
    if (timeoutId) clearTimeout(timeoutId);
    throw new Error(detail);
  }

  const reader = res.body?.getReader();
  if (!reader) {
    if (timeoutId) clearTimeout(timeoutId);
    throw new Error('No response body');
  }

  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = parseSseLines(buffer);
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trimEnd();
        if (!trimmed) continue;
        if (!trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') {
          onEvent({ type: 'done' });
          if (timeoutId) clearTimeout(timeoutId);
          return;
        }
        try {
          const obj = JSON.parse(data);
          onEvent(obj);
        } catch {
          // ignore malformed lines
        }
      }
    }
  } catch (e) {
    // If aborted (user navigation / refresh), just surface a friendly error.
    const msg = e instanceof Error ? e.message : String(e);
    onEvent({ type: 'error', detail: msg });
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}
