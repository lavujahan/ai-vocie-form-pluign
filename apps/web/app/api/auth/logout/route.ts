import { NextResponse, type NextRequest } from 'next/server';
import { USER_COOKIE } from '@vff/shared';
import { bearer } from '@/lib/auth';
import { signOutDevice } from '@/lib/billing/devices';
import { env } from '@/lib/env';
import { verifyJwt, type UserClaims } from '@/lib/jwt';

/** Signs out: the admin panel's cookie, and the extension's computer (it stops counting against the plan). */
export async function POST(req: NextRequest) {
  const token = bearer(req);
  const claims = token ? await verifyJwt(token, env.jwtSecret) : null;
  if (claims?.scope === 'user' && (claims as UserClaims).did) await signOutDevice((claims as UserClaims).did!, claims.sub);
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(USER_COOKIE);
  return res;
}
