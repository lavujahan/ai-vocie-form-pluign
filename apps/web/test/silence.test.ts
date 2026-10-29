import { describe, expect, it } from 'vitest';
import { silenceGate } from '@/app/s/[code]/silence';

const QUIET = 0.003;
const SPEECH = 0.08;

/** Feeds `level` every 100 ms for `ms`; returns the time the gate said stop, or null. */
function feed(gate: ReturnType<typeof silenceGate>, clock: { t: number }, level: number, ms: number): number | null {
  for (let end = clock.t + ms; clock.t < end; ) {
    clock.t += 100;
    if (gate.push(level, clock.t)) return clock.t;
  }
  return null;
}

describe('silenceGate', () => {
  it('never stops before any speech', () => {
    const g = silenceGate();
    const clock = { t: 0 };
    expect(feed(g, clock, QUIET, 10_000)).toBeNull();
    expect(g.quietMs(clock.t)).toBe(0);
  });

  it('stops 4 s after the speech ends', () => {
    const g = silenceGate();
    const clock = { t: 0 };
    feed(g, clock, QUIET, 500);
    expect(feed(g, clock, SPEECH, 1500)).toBeNull();
    const spokeUntil = clock.t;
    expect(feed(g, clock, QUIET, 6000)).toBe(spokeUntil + 4000);
  });

  it('still stops when the person talks from the very first moment', () => {
    const g = silenceGate();
    const clock = { t: 0 };
    feed(g, clock, SPEECH, 1500);
    const spokeUntil = clock.t;
    expect(feed(g, clock, QUIET, 6000)).toBe(spokeUntil + 4000);
  });

  it('keeps listening through a short pause between fields', () => {
    const g = silenceGate();
    const clock = { t: 0 };
    feed(g, clock, QUIET, 300);
    feed(g, clock, SPEECH, 1200);
    expect(feed(g, clock, QUIET, 2000)).toBeNull();
    expect(g.quietMs(clock.t)).toBe(2000);
    expect(feed(g, clock, SPEECH, 1000)).toBeNull();
    expect(g.quietMs(clock.t)).toBe(0);
  });

  it('does not count a short noise spike as speech', () => {
    const g = silenceGate();
    const clock = { t: 0 };
    feed(g, clock, QUIET, 500);
    feed(g, clock, SPEECH, 100);
    expect(feed(g, clock, QUIET, 8000)).toBeNull();
  });

  it('treats a noisy room’s steady noise as silence', () => {
    const g = silenceGate();
    const clock = { t: 0 };
    const fan = 0.03; // louder than the quietest speech in a silent room
    expect(feed(g, clock, fan, 6000)).toBeNull();
    feed(g, clock, 0.2, 1000);
    const spokeUntil = clock.t;
    expect(feed(g, clock, fan, 6000)).toBe(spokeUntil + 4000);
  });
});
