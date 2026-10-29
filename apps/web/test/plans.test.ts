import { describe, expect, it } from 'vitest';
import { planBlock, toPlanStatus, type RawPlanStatus } from '@/lib/billing/plans';
import { MSG } from '@/lib/session-rules';

const NOW = new Date('2026-10-27T10:00:00Z');
const raw = (over: Partial<RawPlanStatus> = {}): RawPlanStatus => ({
  user_id: 'u1',
  role: 'user',
  plan_id: 'basic',
  plan_name: 'Basic',
  starts_at: '2026-10-20T00:00:00Z',
  ends_at: '2026-11-19T00:00:00Z',
  minutes_total: 150,
  used_ms: '2700000', // 45 min; bigint arrives as a string
  paid_until: '2026-11-19T00:00:00Z',
  ...over,
});

describe('toPlanStatus', () => {
  it('works out minutes used and left from audio milliseconds', () => {
    const p = toPlanStatus(raw(), NOW);
    expect(p).toMatchObject({ minutes_total: 150, minutes_used: 45, minutes_left: 105, active: true });
  });

  it('is not active after ends_at', () => {
    expect(toPlanStatus(raw({ ends_at: '2026-10-27T09:59:59Z' }), NOW).active).toBe(false);
  });

  it('never goes below zero minutes left when a recording ran over', () => {
    expect(toPlanStatus(raw({ minutes_total: 20, used_ms: 21 * 60_000 }), NOW).minutes_left).toBe(0);
  });

  it('counts top-ups (they are part of minutes_total)', () => {
    expect(toPlanStatus(raw({ minutes_total: 250, used_ms: 160 * 60_000 }), NOW).minutes_left).toBe(90);
  });

  it('handles a user who never had a plan', () => {
    const p = toPlanStatus(raw({ plan_id: null, plan_name: null, starts_at: null, ends_at: null, minutes_total: null, used_ms: 0, paid_until: null }), NOW);
    expect(p).toMatchObject({ plan_id: null, active: false, minutes_left: 0 });
  });
});

describe('planBlock', () => {
  const active = toPlanStatus(raw(), NOW);

  it('allows an active plan with minutes left', () => {
    expect(planBlock('user', active)).toBeNull();
  });

  it('never blocks admins', () => {
    expect(planBlock('admin', null)).toBeNull();
    expect(planBlock('admin', { ...active, active: false })).toBeNull();
  });

  it('lets typing-only forms through at 0 minutes, but not on an ended plan', () => {
    const used = toPlanStatus(raw({ used_ms: 999_999_999 }), NOW);
    expect(planBlock('user', used)?.code).toBe('quota_exceeded');
    expect(planBlock('user', used, { minutes: false })).toBeNull();
    expect(planBlock('user', null, { minutes: false })?.code).toBe('plan_expired');
  });

  it('blocks a user without a plan or with an ended one', () => {
    expect(planBlock('user', null)).toEqual({ code: 'plan_expired', error: MSG.planEnded });
    expect(planBlock('user', toPlanStatus(raw({ ends_at: '2026-10-01T00:00:00Z' }), NOW))?.code).toBe('plan_expired');
  });

  it('blocks when every minute is used, but not with a few seconds left', () => {
    expect(planBlock('user', toPlanStatus(raw({ used_ms: 150 * 60_000 }), NOW))).toEqual({ code: 'quota_exceeded', error: MSG.minutesUsed });
    expect(planBlock('user', toPlanStatus(raw({ used_ms: 150 * 60_000 - 5_000 }), NOW))).toBeNull();
  });
});
