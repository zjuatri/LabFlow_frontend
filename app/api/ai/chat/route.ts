import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

type DeepSeekChatRequest = {
  message: string;
  model?: 'deepseek-v3' | 'deepseek-r1-671b' | string;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as DeepSeekChatRequest & { stream?: boolean };

    const backendBase = process.env.NEXT_PUBLIC_BACKEND_URL || process.env.BACKEND_URL || 'http://localhost:8000';
    const targetUrl = `${backendBase.replace(/\/$/, '')}/api/ai/chat`;

    const auth = req.headers.get('authorization') || '';

    const controller = new AbortController();
    // Streaming requests can legitimately exceed 120s; don't abort them here.
    const isStream = Boolean(body.stream);
    const timeout = isStream ? null : setTimeout(() => controller.abort(), 120000);

    const upstream = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(auth ? { Authorization: auth } : {}),
      },
      body: JSON.stringify({
        message: body.message,
        model: body.model ?? 'deepseek-v3',
        stream: Boolean(body.stream),
      }),
      signal: controller.signal,
    });

    if (timeout) clearTimeout(timeout);

    // Stream SSE through without buffering.
    const contentType = upstream.headers.get('content-type') || '';
    const isSse = contentType.includes('text/event-stream');
    if (isSse) {
      return new Response(upstream.body, {
        status: upstream.status,
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
        },
      });
    }

    const text = await upstream.text();
    return new NextResponse(text, {
      status: upstream.status,
      headers: {
        'Content-Type': contentType || 'application/json; charset=utf-8',
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ detail: msg || 'Proxy failed' }, { status: 500 });
  }
}
