import { describe, expect, it } from 'vitest';
import { SENT_HOLD_MIN, type FieldType, type SemanticType } from '@vff/shared';
import { customerLabel, filledAt, sentAt } from '@/lib/held';
import { isHeld } from '@/lib/session-rules';

const field = (id: string, semantic_type: SemanticType | null, field_type: FieldType = 'text') => ({ id, semantic_type, field_type });
const value = (field_id: string, v: string | null) => ({ field_id, value: v });

describe('who a waiting form is for', () => {
  it('uses the full name and the last 4 digits of the phone number', () => {
    const fields = [field('a', 'aadhaar'), field('n', 'full_name'), field('p', 'phone', 'tel')];
    const values = [value('a', '1234 5678 9012'), value('n', ' Ramesh Kumar '), value('p', '+91 98765 04821')];
    expect(customerLabel(fields, values)).toEqual({ customer: 'Ramesh Kumar', phone_last4: '4821' });
  });

  it('joins first and last name when the form asks for them apart', () => {
    const fields = [field('f', 'first_name'), field('l', 'last_name')];
    expect(customerLabel(fields, [value('f', 'Selvi'), value('l', 'M')]).customer).toBe('Selvi M');
    expect(customerLabel(fields, [value('f', 'Selvi')]).customer).toBe('Selvi');
  });

  it('falls back to the first plain text answer, before the Form Analyzer has finished', () => {
    expect(customerLabel([field('x', null), field('y', null)], [value('x', 'Arun P'), value('y', 'Other')]).customer).toBe('Arun P');
  });

  it('never shows a number as the name, or an answer of a known other kind', () => {
    const fields = [field('t', null), field('c', 'city')];
    expect(customerLabel(fields, [value('t', '1234 5678 9012'), value('c', 'Erode')]).customer).toBeNull();
  });

  it('has no label for a form with nothing to go on', () => {
    expect(customerLabel([field('n', 'full_name'), field('p', 'phone')], [value('n', null), value('p', '98')])).toEqual({ customer: null, phone_last4: null });
  });

  it('keeps long names short', () => {
    expect(customerLabel([field('n', 'full_name')], [value('n', 'a'.repeat(90))]).customer).toHaveLength(40);
  });
});

describe('waiting forms', () => {
  const now = Date.parse('2026-10-31T12:00:00Z');
  const later = '2026-10-31T13:00:00Z';
  const earlier = '2026-10-31T11:00:00Z';

  it('is held until the hold ends', () => {
    expect(isHeld({ status: 'filled', hold_until: later }, now)).toBe(true);
    expect(isHeld({ status: 'filled', hold_until: earlier }, now)).toBe(false);
    expect(isHeld({ status: 'filled', hold_until: null }, now)).toBe(false);
    expect(isHeld({ status: 'filled' }, now)).toBe(false);
    expect(isHeld({ status: 'expired', hold_until: later }, now)).toBe(false);
  });

  it('stays held while the QR code is shown again for a correction', () => {
    expect(isHeld({ status: 'waiting', hold_until: later }, now)).toBe(true);
    expect(isHeld({ status: 'paired', hold_until: later }, now)).toBe(true);
  });

  it('reads the send time from the hold', () => {
    expect(sentAt(new Date(now + SENT_HOLD_MIN * 60_000).toISOString())).toBe(new Date(now).toISOString());
  });

  it('counts a form as filled only when something went into the page', () => {
    const at = '2026-10-31T11:31:00Z';
    expect(filledAt({ filled: 12, skipped: 1, total: 13, at })).toBe(at);
    expect(filledAt({ filled: 0, skipped: 13, total: 13, at })).toBeNull();
    expect(filledAt(null)).toBeNull();
  });
});
