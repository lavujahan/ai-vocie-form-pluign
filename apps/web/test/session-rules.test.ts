import { describe, expect, it } from 'vitest';
import { MSG, pairFailure, phoneWriteBlock, sendBlock } from '@/lib/session-rules';
import { newFieldsPlacement, nextSeq } from '@/lib/sessions';

const session = (over: Partial<Parameters<typeof phoneWriteBlock>[0]> = {}) => ({
  status: 'paired' as const,
  desktop_state: 'open' as const,
  reset_seq: 0,
  ...over,
});

describe('what the phone may do', () => {
  it('allows everything while the desktop form tab is open', () => {
    expect(phoneWriteBlock(session(), 5)).toBeNull();
    expect(sendBlock(session())).toBeNull();
  });

  it('stops speaking, editing and sending once the desktop tab is closed', () => {
    const s = session({ desktop_state: 'closed' });
    expect(phoneWriteBlock(s, 5)).toBe(MSG.tabClosed);
    expect(sendBlock(s)).toBe(MSG.tabClosed);
    expect(MSG.tabClosed).toMatch(/^Tab closed\./);
  });

  it('still lets the phone speak when the tab moved to another site, but not send', () => {
    const s = session({ desktop_state: 'moved' });
    expect(phoneWriteBlock(s, 5)).toBeNull();
    expect(sendBlock(s)).toBe(MSG.tabMoved);
  });

  it('rejects anything spoken before a Start over', () => {
    const s = session({ reset_seq: 10 });
    expect(phoneWriteBlock(s, 8)).toBe(MSG.cleared);
    expect(phoneWriteBlock(s, 10)).toBe(MSG.cleared);
    expect(phoneWriteBlock(s, 11)).toBeNull();
    expect(nextSeq([], [], 10)).toBe(11);
  });
});

describe('fields that appear later (a wizard step, a revealed field)', () => {
  const field = (field_key: string) => ({ field_key, label: field_key, field_type: 'text' as const }) as never;
  it('adds only new keys, after the last field, as the next step', () => {
    const existing = [
      { field_key: 'full_name', position: 0, step_index: 0 },
      { field_key: 'mobile', position: 1, step_index: 0 },
    ];
    const r = newFieldsPlacement(existing, [field('mobile'), field('occupation'), field('income'), field('occupation')]);
    expect(r.fresh.map((f) => f.field_key)).toEqual(['occupation', 'income']);
    expect(r.startPosition).toBe(2);
    expect(r.stepIndex).toBe(1);
  });
});

describe('QR pairing failures', () => {
  it('tells "already used" apart from "expired"', () => {
    expect(pairFailure({ status: 'paired' })).toBe(MSG.qrUsed);
    expect(pairFailure({ status: 'filled' })).toBe(MSG.qrUsed);
    expect(pairFailure({ status: 'waiting' })).toBe(MSG.qrExpired);
    expect(pairFailure({ status: 'expired' })).toBe(MSG.qrExpired);
    expect(pairFailure(null)).toBe(MSG.qrUnknown);
  });
});
