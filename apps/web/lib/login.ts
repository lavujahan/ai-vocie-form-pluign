import { IP_ATTEMPT_LIMIT, LOCK_MINUTES, MAX_PIN_ATTEMPTS } from '@vff/shared';
import type { DbUser } from './auth';

/** Storage needed by the login flow; Supabase-backed in production, in-memory in tests. */
export interface LoginStore {
  countIpFailuresSince(ip: string, since: Date): Promise<number>;
  findUserByPhone(phone: string): Promise<DbUser | null>;
  /** Atomically increments failures; locks at `max`. */
  registerFailure(userId: string, max: number, lockMinutes: number): Promise<{ failed_attempts: number; locked_until: string | null }>;
  resetFailures(userId: string): Promise<void>;
  recordAttempt(ip: string, phone: string, success: boolean): Promise<void>;
}

export type LoginOutcome =
  | { ok: true; user: DbUser }
  | { ok: false; status: number; error: string; attempts_left?: number; locked_until?: string };

const INVALID = 'Wrong phone number or PIN';

export async function attemptLogin(
  store: LoginStore,
  input: { phone: string; pin: string; ip: string },
  verifyPin: (pin: string, hash: string) => Promise<boolean>,
  now = new Date(),
): Promise<LoginOutcome> {
  const since = new Date(now.getTime() - LOCK_MINUTES * 60_000);
  if ((await store.countIpFailuresSince(input.ip, since)) >= IP_ATTEMPT_LIMIT) {
    return { ok: false, status: 429, error: 'Too many attempts from this network. Try again later.' };
  }

  const user = await store.findUserByPhone(input.phone);
  if (!user || !user.is_active) {
    await store.recordAttempt(input.ip, input.phone, false);
    return { ok: false, status: 401, error: INVALID };
  }

  if (user.locked_until && new Date(user.locked_until) > now) {
    await store.recordAttempt(input.ip, input.phone, false);
    return { ok: false, status: 423, error: 'Account locked after too many wrong PINs', locked_until: user.locked_until };
  }

  if (!(await verifyPin(input.pin, user.pin_hash))) {
    await store.recordAttempt(input.ip, input.phone, false);
    const r = await store.registerFailure(user.id, MAX_PIN_ATTEMPTS, LOCK_MINUTES);
    if (r.locked_until && new Date(r.locked_until) > now) {
      return { ok: false, status: 423, error: `Account locked for ${LOCK_MINUTES} minutes`, locked_until: r.locked_until };
    }
    return { ok: false, status: 401, error: INVALID, attempts_left: MAX_PIN_ATTEMPTS - r.failed_attempts };
  }

  await store.recordAttempt(input.ip, input.phone, true);
  if (user.failed_attempts || user.locked_until) await store.resetFailures(user.id);
  return { ok: true, user };
}
