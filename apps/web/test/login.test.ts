import { describe, expect, it } from 'vitest';
import { IP_ATTEMPT_LIMIT, MAX_PIN_ATTEMPTS } from '@vff/shared';
import type { DbUser } from '@/lib/auth';
import { attemptLogin, type LoginStore } from '@/lib/login';

function memoryStore(users: DbUser[]) {
  const attempts: { ip: string; phone: string; success: boolean; at: Date }[] = [];
  const store: LoginStore = {
    async countIpFailuresSince(ip, since) {
      return attempts.filter((a) => a.ip === ip && !a.success && a.at >= since).length;
    },
    async findUserByPhone(phone) {
      const u = users.find((x) => x.phone === phone);
      return u ? { ...u } : null;
    },
    async registerFailure(userId, max, lockMinutes) {
      const u = users.find((x) => x.id === userId)!;
      if (u.failed_attempts + 1 >= max) {
        u.failed_attempts = 0;
        u.locked_until = new Date(Date.now() + lockMinutes * 60_000).toISOString();
      } else {
        u.failed_attempts += 1;
      }
      return { failed_attempts: u.failed_attempts, locked_until: u.locked_until };
    },
    async resetFailures(userId) {
      const u = users.find((x) => x.id === userId)!;
      u.failed_attempts = 0;
      u.locked_until = null;
    },
    async recordAttempt(ip, phone, success) {
      attempts.push({ ip, phone, success, at: new Date() });
    },
  };
  return { store, attempts };
}

const user = (over: Partial<DbUser> = {}): DbUser => ({
  id: 'u1',
  name: 'Ramesh',
  phone: '9876543210',
  role: 'user',
  pin_hash: 'PIN:12345',
  is_active: true,
  failed_attempts: 0,
  locked_until: null,
  created_at: new Date().toISOString(),
  ...over,
});

const verify = async (pin: string, hash: string) => hash === `PIN:${pin}`;

describe('attemptLogin', () => {
  it('signs in with the right PIN and resets failures', async () => {
    const users = [user({ failed_attempts: 2 })];
    const { store } = memoryStore(users);
    const r = await attemptLogin(store, { phone: '9876543210', pin: '12345', ip: '1.1.1.1' }, verify);
    expect(r.ok).toBe(true);
    expect(users[0].failed_attempts).toBe(0);
  });

  it('counts down and locks after 5 wrong PINs', async () => {
    const users = [user()];
    const { store } = memoryStore(users);
    const input = { phone: '9876543210', pin: '00000', ip: '1.1.1.1' };
    for (let i = 1; i < MAX_PIN_ATTEMPTS; i++) {
      const r = await attemptLogin(store, input, verify);
      expect(r).toMatchObject({ ok: false, status: 401, attempts_left: MAX_PIN_ATTEMPTS - i });
    }
    const locked = await attemptLogin(store, input, verify);
    expect(locked).toMatchObject({ ok: false, status: 423 });
    // Even the right PIN is refused while locked.
    const after = await attemptLogin(store, { ...input, pin: '12345' }, verify);
    expect(after).toMatchObject({ ok: false, status: 423 });
  });

  it('accepts the right PIN once the lock has expired', async () => {
    const users = [user({ locked_until: new Date(Date.now() - 1000).toISOString() })];
    const { store } = memoryStore(users);
    const r = await attemptLogin(store, { phone: '9876543210', pin: '12345', ip: '1.1.1.1' }, verify);
    expect(r.ok).toBe(true);
    expect(users[0].locked_until).toBeNull();
  });

  it('gives the same answer for unknown and inactive users', async () => {
    const { store } = memoryStore([user({ is_active: false })]);
    const a = await attemptLogin(store, { phone: '9876543210', pin: '12345', ip: '1.1.1.1' }, verify);
    const b = await attemptLogin(store, { phone: '1111111111', pin: '12345', ip: '1.1.1.1' }, verify);
    expect(a).toEqual(b);
    expect(a).toMatchObject({ ok: false, status: 401 });
  });

  it('rate-limits by IP across phone numbers', async () => {
    const { store } = memoryStore([user()]);
    for (let i = 0; i < IP_ATTEMPT_LIMIT; i++) {
      await attemptLogin(store, { phone: `55500${String(i).padStart(5, '0')}`, pin: '00000', ip: '9.9.9.9' }, verify);
    }
    const r = await attemptLogin(store, { phone: '9876543210', pin: '12345', ip: '9.9.9.9' }, verify);
    expect(r).toMatchObject({ ok: false, status: 429 });
    const other = await attemptLogin(store, { phone: '9876543210', pin: '12345', ip: '2.2.2.2' }, verify);
    expect(other.ok).toBe(true);
  });
});
