import 'server-only';
import bcrypt from 'bcryptjs';
import type { NextRequest } from 'next/server';
import { SESSION_JWT_TTL_MIN, USER_COOKIE, USER_JWT_TTL_HOURS, type PublicUser } from '@vff/shared';
import { env } from './env';
import { fail } from './http';
import { signJwt, verifyJwt, type PhoneClaims, type UserClaims } from './jwt';
import { db } from './supabase-admin';

export type DbUser = PublicUser & {
  pin_hash: string;
  is_active: boolean;
  failed_attempts: number;
  locked_until: string | null;
  created_at: string;
};

export const hashPin = (pin: string) => bcrypt.hash(pin, 10);
export const verifyPin = (pin: string, hash: string) => bcrypt.compare(pin, hash);

export function signUserJwt(user: PublicUser) {
  return signJwt(
    { role: 'authenticated', scope: 'user', app_role: user.role },
    user.id,
    USER_JWT_TTL_HOURS * 3600,
    env.jwtSecret,
  );
}

export function signSessionJwt(sessionId: string) {
  return signJwt(
    { role: 'authenticated', scope: 'phone', session_id: sessionId },
    sessionId,
    SESSION_JWT_TTL_MIN * 60,
    env.jwtSecret,
  );
}

function bearer(req: NextRequest): string | null {
  const h = req.headers.get('authorization');
  if (h?.startsWith('Bearer ')) return h.slice(7);
  return req.cookies.get(USER_COOKIE)?.value ?? null;
}

export const toPublicUser = (u: DbUser): PublicUser => ({ id: u.id, name: u.name, phone: u.phone, role: u.role });

/** Extension or admin user. Re-checks the DB so deactivated users lose access immediately. */
export async function requireUser(req: NextRequest): Promise<DbUser> {
  const token = bearer(req);
  const claims = token ? await verifyJwt(token, env.jwtSecret) : null;
  if (!claims || claims.scope !== 'user') throw fail(401, 'Please sign in again');
  const { data } = await db().from('users').select('*').eq('id', (claims as UserClaims).sub).maybeSingle();
  const user = data as DbUser | null;
  if (!user || !user.is_active) throw fail(401, 'Account is inactive');
  return user;
}

export async function requireAdmin(req: NextRequest): Promise<DbUser> {
  const user = await requireUser(req);
  if (user.role !== 'admin') throw fail(403, 'Admins only');
  return user;
}

/** Phone holding a session JWT. Returns the session id it is scoped to. */
export async function requirePhone(req: NextRequest): Promise<PhoneClaims> {
  const token = bearer(req);
  const claims = token ? await verifyJwt(token, env.jwtSecret) : null;
  if (!claims || claims.scope !== 'phone') throw fail(401, 'This link has expired. Scan the QR code again.');
  return claims;
}

/** Either the owning user or the paired phone. */
export async function requireSessionAccess(
  req: NextRequest,
  session: { id: string; user_id: string },
): Promise<'user' | 'phone'> {
  const token = bearer(req);
  const claims = token ? await verifyJwt(token, env.jwtSecret) : null;
  if (claims?.scope === 'phone' && claims.session_id === session.id) return 'phone';
  if (claims?.scope === 'user' && claims.sub === session.user_id) return 'user';
  throw fail(claims ? 403 : 401, 'Not allowed');
}
