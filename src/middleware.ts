import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

export async function middleware(request: NextRequest) {
  // Auth.js v5 uses 'authjs.session-token' (HTTP) or '__Secure-authjs.session-token' (HTTPS)
  const isSecure = request.nextUrl.protocol === 'https:';
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
    salt: isSecure ? '__Secure-authjs.session-token' : 'authjs.session-token',
  });

  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*'],
};
