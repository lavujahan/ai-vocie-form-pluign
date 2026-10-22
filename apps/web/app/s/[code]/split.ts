/**
 * Decides where to cut a long recording into pieces for Sarvam speech-to-text (clips < 30 s).
 * Cuts at the first pause after MIN_SPLIT_MS so words and numbers aren't split, and always cuts
 * at MAX_SEGMENT_MS if the speaker never pauses. Pure logic, fed with mic loudness frames.
 */

/** Earliest point to look for a pause. */
export const MIN_SPLIT_MS = 20_000;
/** Hard cut, safely under Sarvam's 30 s limit. */
export const MAX_SEGMENT_MS = 28_000;
/** How long the mic must stay quiet to count as a pause between words/phrases. */
export const SILENCE_MS = 400;
/** Lowest loudness treated as speech, for very quiet rooms / phones with strong noise suppression. */
const MIN_THRESHOLD = 0.008;

export class SplitDetector {
  /** Quietest level heard so far (background noise), kept across segments of one recording. */
  private floor = Number.POSITIVE_INFINITY;
  private segmentMs = 0;
  private silentMs = 0;

  /** Call when a new segment starts. */
  startSegment() {
    this.segmentMs = 0;
    this.silentMs = 0;
  }

  /** Loudness below this counts as silence: a few times the background noise. */
  threshold(): number {
    return Math.max(MIN_THRESHOLD, Number.isFinite(this.floor) ? this.floor * 3 : 0);
  }

  /**
   * Feed one loudness frame (RMS, 0..1) covering `dtMs`. Returns true when the current segment
   * should be cut now.
   */
  update(rms: number, dtMs: number): boolean {
    this.segmentMs += dtMs;
    // Ignore the first moments (mic warm-up, the tap itself) when learning the noise floor.
    if (this.segmentMs > 300) this.floor = Math.min(this.floor, rms);
    this.silentMs = rms < this.threshold() ? this.silentMs + dtMs : 0;
    if (this.segmentMs >= MAX_SEGMENT_MS) return true;
    return this.segmentMs >= MIN_SPLIT_MS && this.silentMs >= SILENCE_MS;
  }
}

/** Root-mean-square loudness of one block of samples (-1..1). */
export function rms(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return samples.length ? Math.sqrt(sum / samples.length) : 0;
}
