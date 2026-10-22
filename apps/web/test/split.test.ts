import { describe, expect, it } from 'vitest';
import { MAX_SEGMENT_MS, MIN_SPLIT_MS, SILENCE_MS, SplitDetector, rms } from '@/app/s/[code]/split';

const FRAME = 50;
const SPEECH = 0.12;
const NOISE = 0.003;

/** Feeds frames until the detector says cut; returns the time of the cut (or null). */
function run(det: SplitDetector, frames: number[]): number | null {
  let t = 0;
  for (const level of frames) {
    t += FRAME;
    if (det.update(level, FRAME)) return t;
  }
  return null;
}

/** Speech with short gaps between words (100 ms of noise every 600 ms), for `ms`. */
const talking = (ms: number) =>
  Array.from({ length: ms / FRAME }, (_, i) => (i % 12 >= 10 ? NOISE : SPEECH));
const quiet = (ms: number) => Array.from({ length: ms / FRAME }, () => NOISE);

describe('SplitDetector', () => {
  it('does not cut at a pause before 20 s', () => {
    expect(run(new SplitDetector(), [...talking(5000), ...quiet(1000), ...talking(10000)])).toBeNull();
  });

  it('cuts at the first real pause after 20 s, not at the gaps between words', () => {
    const cut = run(new SplitDetector(), [...talking(22000), ...quiet(1000), ...talking(5000)]);
    expect(cut).toBe(22000 + SILENCE_MS);
  });

  it('cuts at 28 s when the speaker never pauses', () => {
    expect(run(new SplitDetector(), talking(40000))).toBe(MAX_SEGMENT_MS);
  });

  it('adapts to a noisy room: background noise is not mistaken for speech', () => {
    const noisy = 0.03;
    const det = new SplitDetector();
    const frames = Array.from({ length: (MIN_SPLIT_MS + 2000) / FRAME }, (_, i) => (i % 12 >= 10 ? noisy : 0.25));
    const cut = run(det, [...frames, ...Array.from({ length: 20 }, () => noisy)]);
    expect(cut).toBe(MIN_SPLIT_MS + 2000 + SILENCE_MS);
  });

  it('measures loudness', () => {
    expect(rms(new Float32Array([0.5, -0.5, 0.5, -0.5]))).toBeCloseTo(0.5);
    expect(rms(new Float32Array(0))).toBe(0);
  });
});
