import { describe, expect, it } from 'vitest';
import { planBlock, regenerateIsFree, toPlanStatus, type RawPlanStatus } from '@/lib/billing/plans';
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

describe('plan counters (migration 0026)', () => {
  const withCounters = (over: Partial<RawPlanStatus> = {}) =>
    toPlanStatus(
      raw({
        computers_total: 2,
        documents_total: 250,
        documents_used: 249,
        voice_qrs_total: 400,
        voice_qrs_used: 12,
        nonvoice_qrs_total: 150,
        nonvoice_qrs_used: 150,
        ...over,
      }),
      NOW,
    );

  it('reads each counter, with null for no limit', () => {
    expect(withCounters({ documents_total: null }).counters).toEqual({
      computers: 2,
      documents: { total: null, used: 249 },
      voice_qrs: { total: 400, used: 12 },
      nonvoice_qrs: { total: 150, used: 150 },
    });
  });

  it('has no counters before the migration', () => {
    expect(toPlanStatus(raw(), NOW).counters).toBeUndefined();
  });

  it('refuses a counter that is used up, and only that one', () => {
    const p = withCounters();
    expect(planBlock('user', p, { minutes: false, counter: 'nonvoice_qrs' })).toEqual({ code: 'limit_nonvoice_qrs', error: MSG.nonvoiceQrsUsed });
    expect(planBlock('user', p, { counter: 'voice_qrs' })).toBeNull();
    expect(planBlock('user', p, { minutes: false, counter: 'documents' })).toBeNull();
    expect(planBlock('user', p, { minutes: false, counter: 'documents', count: 2 })?.code).toBe('limit_documents');
  });

  it('never limits a counter without a limit, an admin, or a period from before the migration', () => {
    expect(planBlock('user', withCounters({ nonvoice_qrs_total: null }), { minutes: false, counter: 'nonvoice_qrs' })).toBeNull();
    expect(planBlock('admin', withCounters(), { minutes: false, counter: 'nonvoice_qrs' })).toBeNull();
    expect(planBlock('user', toPlanStatus(raw(), NOW), { minutes: false, counter: 'nonvoice_qrs' })).toBeNull();
  });

  it('still says minutes first when both are used up', () => {
    expect(planBlock('user', withCounters({ used_ms: 999_999_999, voice_qrs_used: 400 }), { counter: 'voice_qrs' })?.code).toBe('quota_exceeded');
  });
});

describe('regenerateIsFree', () => {
  const prev = { user_id: 'u1', paired_at: null, voice_enabled: true };

  it('is free for an expired QR of the same user and voice choice that nobody scanned', () => {
    expect(regenerateIsFree(prev, 'u1', true)).toBe(true);
    expect(regenerateIsFree({ ...prev, voice_enabled: undefined }, 'u1', true)).toBe(true);
  });

  it('counts when it was scanned, is someone else’s, changes the voice choice, or is unknown', () => {
    expect(regenerateIsFree({ ...prev, paired_at: '2026-10-27T09:00:00Z' }, 'u1', true)).toBe(false);
    expect(regenerateIsFree(prev, 'u2', true)).toBe(false);
    expect(regenerateIsFree(prev, 'u1', false)).toBe(false);
    expect(regenerateIsFree(null, 'u1', true)).toBe(false);
  });
});
