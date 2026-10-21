import { NextResponse, type NextRequest } from 'next/server';
import { USER_COOKIE } from '@vff/shared';
import { verifyJwt } from './lib/jwt';

/** Gate for the admin pages. API routes check auth themselves (and re-check the DB). */
export async function middleware(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith('/admin/login')) return NextResponse.next();
  const token = req.cookies.get(USER_COOKIE)?.value;
  const secret = process.env.SUPABASE_JWT_SECRET;
  const claims = token && secret ? await verifyJwt(token, secret) : null;
  if (claims?.scope === 'user' && claims.app_role === 'admin') return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = '/admin/login';
  url.search = '';
  return NextResponse.redirect(url);
}

export const config = { matcher: ['/admin/:path*'] };
