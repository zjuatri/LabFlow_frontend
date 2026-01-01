import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const UPSTREAM_TIMEOUT_MS = 2 * 60 * 1000;

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const startedAt = Date.now();
  try {
    const { id } = await ctx.params;
    const backendBase = process.env.NEXT_PUBLIC_BACKEND_URL || process.env.BACKEND_URL || 'http://localhost:8000';
    const targetUrl = `${backendBase.replace(/\/$/, '')}/api/projects/${encodeURIComponent(id)}/pdf/table/formula/vision`;

    const url = new URL(req.url);
    const qs = url.searchParams.toString();
    const fullUrl = qs ? `${targetUrl}?${qs}` : targetUrl;

    const auth = req.headers.get('authorization') || '';
    const contentType = req.headers.get('content-type') || '';
    const contentLength = req.headers.get('content-length') || '';

    console.log(
      `[proxy pdf/table/formula/vision] start id=${id} qs=${qs} ct=${contentType} cl=${contentLength}`,
    );

    if (!req.body) {
      return NextResponse.json(
        { detail: 'Missing request body (expected multipart/form-data)' },
        { status: 400 },
      );
    }

    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort('Upstream timeout'), UPSTREAM_TIMEOUT_MS);

    // For multipart/form-data, pass through the raw body stream.
    // `duplex` is required by Node.js fetch when streaming a request body.
    // TS lib.dom.d.ts doesn't include it, so we use an `unknown` cast.
    let upstream: Response;
    try {
      const initWithDuplex = {
        method: 'POST',
        headers: {
          ...(auth ? { Authorization: auth } : {}),
          ...(contentType ? { 'Content-Type': contentType } : {}),
        },
        body: req.body,
        duplex: 'half',
        signal: abort.signal,
      };
      upstream = await fetch(fullUrl, initWithDuplex as unknown as RequestInit);
    } finally {
      clearTimeout(timeout);
    }

    console.log(
      `[proxy pdf/table/formula/vision] upstream status=${upstream.status} elapsed_ms=${Date.now() - startedAt}`,
    );

    // Forward upstream response body & key headers for better observability.
    const outHeaders = new Headers();
    const passthroughHeaders = [
      'content-type',
      'cache-control',
      'content-disposition',
      'x-request-id',
    ];
    for (const h of passthroughHeaders) {
      const v = upstream.headers.get(h);
      if (v) outHeaders.set(h, v);
    }

    const text = await upstream.text();
    console.log(
      `[proxy pdf/table/formula/vision] done bytes=${text.length} elapsed_ms=${Date.now() - startedAt}`,
    );
    if (!outHeaders.get('content-type')) {
      outHeaders.set('content-type', 'application/json; charset=utf-8');
    }
    return new NextResponse(text, { status: upstream.status, headers: outHeaders });
  } catch (e) {
    const err = e as { message?: unknown; name?: unknown; code?: unknown; cause?: unknown };
    const detail = {
      message: err?.message ? String(err.message) : String(e),
      name: err?.name ? String(err.name) : undefined,
      code: err?.code ? String(err.code) : undefined,
      cause: err?.cause ? String(err.cause) : undefined,
    };

    console.error(
      `[proxy pdf/table/formula/vision] error elapsed_ms=${Date.now() - startedAt}`,
      detail,
    );

    // ECONNRESET / "socket hang up" most often indicates upstream closed the connection.
    const status = detail.code === 'ECONNRESET' ? 502 : 500;
    return NextResponse.json({ detail }, { status });
  }
}

export async function GET() {
  return NextResponse.json({ detail: 'Method Not Allowed' }, { status: 405 });
}
