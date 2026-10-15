/**
 * 브라우저 → 웹(/api/*) → API 서버로 전달하는 프록시.
 * 같은 도메인에서 httpOnly 쿠키로 로그인을 유지하기 위해 사용합니다.
 * API 주소는 실행 시점의 API_INTERNAL_URL 환경 변수로 정합니다.
 */
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

const API_URL = () => process.env.API_INTERNAL_URL || 'http://localhost:4000';
const HOP_BY_HOP = new Set(['connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'host', 'content-length']);

async function proxy(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const target = `${API_URL()}/${path.map(encodeURIComponent).join('/')}${req.nextUrl.search}`;

  const headers = new Headers();
  req.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key)) headers.set(key, value);
  });
  // 앞단 리버스 프록시(DSM, Nginx 등)가 붙인 마지막 값만 신뢰합니다. 앞쪽 값은 사용자가 조작할 수 있습니다.
  const forwarded = req.headers.get('x-forwarded-for')?.split(',').map((s) => s.trim()).filter(Boolean);
  const clientIp = forwarded?.at(-1) || req.headers.get('x-real-ip');
  headers.delete('x-forwarded-for');
  if (clientIp) headers.set('x-forwarded-for', clientIp);

  const hasBody = !['GET', 'HEAD'].includes(req.method);
  const res = await fetch(target, {
    method: req.method,
    headers,
    body: hasBody ? await req.arrayBuffer() : undefined,
    redirect: 'manual',
    cache: 'no-store',
  });

  const out = new Headers();
  res.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key) && key !== 'content-encoding' && key !== 'set-cookie') out.set(key, value);
  });
  for (const cookie of res.headers.getSetCookie()) out.append('set-cookie', cookie);
  return new Response(res.status === 204 ? null : res.body, { status: res.status, headers: out });
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE };
