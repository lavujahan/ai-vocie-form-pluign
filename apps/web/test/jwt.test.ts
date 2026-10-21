import { describe, expect, it } from 'vitest';
import { signJwt, verifyJwt } from '@/lib/jwt';

const SECRET = 'test-secret-at-least-32-characters-long!!';

describe('jwt', () => {
  it('round-trips a phone token scoped to one session', async () => {
    const { token } = await signJwt({ role: 'authenticated', scope: 'phone', session_id: 's1' }, 's1', 60, SECRET);
    const claims = await verifyJwt(token, SECRET);
    expect(claims).toMatchObject({ sub: 's1', scope: 'phone', session_id: 's1', role: 'authenticated', aud: 'authenticated' });
  });

  it('rejects a wrong secret and expired tokens', async () => {
    const { token } = await signJwt({ role: 'authenticated', scope: 'user', app_role: 'user' }, 'u1', 60, SECRET);
    expect(await verifyJwt(token, `${SECRET}x`)).toBeNull();
    const expired = await signJwt({ role: 'authenticated', scope: 'user', app_role: 'user' }, 'u1', -10, SECRET);
    expect(await verifyJwt(expired.token, SECRET)).toBeNull();
  });
});
