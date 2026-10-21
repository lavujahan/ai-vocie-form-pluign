// Edge-safe JWT helpers (used by middleware and API routes).
import { jwtVerify, SignJWT } from 'jose';

export type UserClaims = {
  sub: string;
  role: 'authenticated';
  scope: 'user';
  app_role: 'admin' | 'user';
};

export type PhoneClaims = {
  /** The form session id — never the user id, so auth.uid() can't reach the user's other sessions. */
  sub: string;
  role: 'authenticated';
  scope: 'phone';
  session_id: string;
};

export type Claims = UserClaims | PhoneClaims;

function key(secret: string) {
  return new TextEncoder().encode(secret);
}

export async function signJwt(
  claims: Omit<UserClaims, 'sub'> | Omit<PhoneClaims, 'sub'>,
  sub: string,
  ttlSeconds: number,
  secret: string,
): Promise<{ token: string; expires_at: string }> {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const token = await new SignJWT({ ...claims })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(sub)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(key(secret));
  return { token, expires_at: new Date(exp * 1000).toISOString() };
}

export async function verifyJwt(token: string, secret: string): Promise<Claims | null> {
  try {
    const { payload } = await jwtVerify(token, key(secret), { audience: 'authenticated', algorithms: ['HS256'] });
    if (payload.scope !== 'user' && payload.scope !== 'phone') return null;
    return payload as unknown as Claims;
  } catch {
    return null;
  }
}
