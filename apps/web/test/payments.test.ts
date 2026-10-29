import { describe, expect, it } from 'vitest';
import { PaymentUpdate } from '@vff/shared';
import { paidAtOn } from '@/lib/billing/admin';

describe('paidAtOn', () => {
  it('moves a payment to another India date at the same India time of day', () => {
    // 14:30 India time on 5 Oct
    expect(paidAtOn('2026-10-20', '2026-10-05T09:00:00.000Z')).toBe('2026-10-20T09:00:00.000Z');
  });

  it('keeps a time just after midnight in India on the chosen India date', () => {
    // 00:15 India time on 6 Oct is still 5 Oct in UTC
    const moved = paidAtOn('2026-10-20', '2026-10-05T18:45:00.000Z');
    expect(moved).toBe('2026-10-19T18:45:00.000Z'); // 00:15 India time on 20 Oct
    expect(new Date(Date.parse(moved) + 330 * 60_000).toISOString().slice(0, 10)).toBe('2026-10-20');
  });

  it('leaves the time unchanged when the date is the same', () => {
    expect(paidAtOn('2026-10-06', '2026-10-05T18:45:12.345Z')).toBe('2026-10-05T18:45:12.345Z');
  });
});

describe('PaymentUpdate', () => {
  const ok = { paid_on: '2026-10-20', amount_inr: 499, method: 'upi' };

  it('turns empty reference and note into null', () => {
    expect(PaymentUpdate.parse({ ...ok, reference: '  ', note: '' })).toMatchObject({ reference: null, note: null });
    expect(PaymentUpdate.parse(ok)).toMatchObject({ reference: null, note: null });
    expect(PaymentUpdate.parse({ ...ok, reference: ' UTR123 ' }).reference).toBe('UTR123');
  });

  it('refuses a zero or negative amount', () => {
    expect(PaymentUpdate.safeParse({ ...ok, amount_inr: 0 }).success).toBe(false);
    expect(PaymentUpdate.safeParse({ ...ok, amount_inr: -5 }).success).toBe(false);
  });

  it('refuses too-long text and a bad date', () => {
    expect(PaymentUpdate.safeParse({ ...ok, reference: 'x'.repeat(101) }).success).toBe(false);
    expect(PaymentUpdate.safeParse({ ...ok, note: 'x'.repeat(301) }).success).toBe(false);
    expect(PaymentUpdate.safeParse({ ...ok, paid_on: '20-10-2026' }).success).toBe(false);
  });

  it('keeps an older razorpay payment saveable', () => {
    expect(PaymentUpdate.safeParse({ ...ok, method: 'razorpay' }).success).toBe(true);
    expect(PaymentUpdate.safeParse({ ...ok, method: 'card' }).success).toBe(false);
  });
});
