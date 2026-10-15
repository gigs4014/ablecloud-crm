import { NextResponse, type NextRequest } from 'next/server';

/** 로그인 쿠키가 없으면 로그인 화면으로 보냅니다. (실제 검증은 API가 합니다) */
export function middleware(req: NextRequest) {
  if (!req.cookies.has('erm_session')) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = req.nextUrl.pathname === '/' ? '' : `?next=${encodeURIComponent(req.nextUrl.pathname)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!login|api|_next|favicon.ico|manifest.webmanifest).*)'],
};
