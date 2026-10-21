import { NextResponse } from 'next/server';
import { LoginRequest, USER_COOKIE, USER_JWT_TTL_HOURS, type LoginResponse } from '@vff/shared';
import { signUserJwt, toPublicUser, verifyPin } from '@/lib/auth';
import { env } from '@/lib/env';
import { clientIp, fail, route } from '@/lib/http';
import { attemptLogin } from '@/lib/login';
import { supabaseLoginStore } from '@/lib/login-store';

export const runtime = 'nodejs';

export const POST = route(async (req) => {
  const body = LoginRequest.parse(await req.json());
  const outcome = await attemptLogin(supabaseLoginStore, { ...body, ip: clientIp(req) }, verifyPin);
  if (!outcome.ok) {
    const { status, error, ...extra } = outcome;
    throw fail(status, error, extra);
  }

  const user = toPublicUser(outcome.user);
  const { token, expires_at } = await signUserJwt(user);
  const res = NextResponse.json({ token, expires_at, user } satisfies LoginResponse);

  // Web (admin panel) logins also get an httpOnly cookie.
  if (req.nextUrl.searchParams.get('web') === '1') {
    res.cookies.set(USER_COOKIE, token, {
      httpOnly: true,
      secure: env.isProd,
      sameSite: 'lax',
      path: '/',
      maxAge: USER_JWT_TTL_HOURS * 3600,
    });
  }
  return res;
});
