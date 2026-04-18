import { type NextRequest, NextResponse } from 'next/server';

// Bypass the next.config rewrites() proxy for HLS routes — rewrites buffer
// the full response before forwarding, which breaks chunked TS segment
// streaming. This Route Handler streams res.body directly (no buffering).
const BACKEND = (process.env.INTERNAL_API_ORIGIN ?? 'http://127.0.0.1:3000').replace(/\/$/, '');

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ name: string; path: string[] }> },
) {
  const { name, path } = await params;
  const qs = req.nextUrl.search;
  const upstream = `${BACKEND}/api/cameras/${encodeURIComponent(name)}/hls/${path.join('/')}${qs}`;

  try {
    const res = await fetch(upstream, {
      headers: {
        cookie: req.headers.get('cookie') ?? '',
        authorization: req.headers.get('authorization') ?? '',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) return new NextResponse(null, { status: res.status });

    const headers = new Headers();
    const ct = res.headers.get('content-type');
    if (ct) headers.set('content-type', ct);
    headers.set('cache-control', 'no-cache');
    const cl = res.headers.get('content-length');
    if (cl) headers.set('content-length', cl);

    return new NextResponse(res.body, { headers });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
}
