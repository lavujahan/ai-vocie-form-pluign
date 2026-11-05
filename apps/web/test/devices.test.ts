import { describe, expect, it } from 'vitest';
import { decideDevice } from '@/lib/billing/devices';

const device = (id: string, mine = false) => ({ id, name: id, label: null, signed_in_at: '', last_seen_at: '', mine });

describe('decideDevice', () => {
  it('lets a computer in while the plan has room', () => {
    expect(decideDevice([], 1)).toEqual({ action: 'allow', signOut: null });
    expect(decideDevice([device('a')], 2)).toEqual({ action: 'allow', signOut: null });
  });

  it('always lets a computer that is already signed in sign in again', () => {
    expect(decideDevice([device('a'), device('b', true)], 1)).toEqual({ action: 'allow', signOut: null });
  });

  it('refuses one computer too many, listing the others', () => {
    const r = decideDevice([device('a'), device('b')], 2);
    expect(r).toMatchObject({ action: 'refuse', max: 2 });
    expect(r.action === 'refuse' && r.devices.map((d) => d.id)).toEqual(['a', 'b']);
  });

  it('signs out the chosen computer to make room', () => {
    expect(decideDevice([device('a'), device('b')], 2, 'a')).toEqual({ action: 'allow', signOut: 'a' });
  });

  it('ignores a replace id that is not one of the user’s, or that would not make room', () => {
    expect(decideDevice([device('a')], 1, 'zzz').action).toBe('refuse');
    // The admin lowered the limit below the computers already signed in: one sign-out isn't enough.
    expect(decideDevice([device('a'), device('b'), device('c')], 1, 'a').action).toBe('refuse');
  });

  it('never limits a plan without a computers limit', () => {
    expect(decideDevice([device('a'), device('b'), device('c')], null)).toEqual({ action: 'allow', signOut: null });
  });
});
