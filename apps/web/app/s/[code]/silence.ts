/**
 * Decides when a recording can stop by itself: once the person has spoken, a few seconds of silence
 * mean they are done (people often forget to tap Stop, and silence uses voice minutes too). Before any
 * speech it never stops, so someone who takes a moment to start is not cut off.
 *
 * Fed the microphone level (RMS of the samples, 0–1) every ~100 ms. Speech is a level well above the
 * room's noise floor, which adapts to the room: a fan or traffic raises it, so steady noise counts as
 * silence.
 */
export type SilenceGate = {
  /** Adds a level at `now` (ms); true when the recording should stop. */
  push(level: number, now: number): boolean;
  /** How long it has been quiet since the last speech (0 before any speech). */
  quietMs(now: number): number;
};

const START_FLOOR_MAX = 0.02;

export function silenceGate({
  silenceMs = 4000,
  /** Speech needed (in total) before silence can stop the recording: a cough or a tap is not enough. */
  minSpeechMs = 250,
  /** The quietest level that counts as speech, for a silent room. */
  minLevel = 0.015,
  /** Speech is at least this many times the noise floor. */
  ratio = 3,
} = {}): SilenceGate {
  let floor: number | null = null;
  let lastAt: number | null = null;
  let lastLoud: number | null = null;
  let speechMs = 0;

  const heard = () => speechMs >= minSpeechMs && lastLoud !== null;

  return {
    push(level, now) {
      const dt = lastAt === null ? 0 : Math.max(0, now - lastAt);
      lastAt = now;
      // The first level may already be speech (talking as they tap): it can't put the floor above a
      // noisy room's, or that speech would never count.
      if (floor === null) floor = Math.min(level, START_FLOOR_MAX);
      const loud = level >= Math.max(minLevel, floor * ratio);
      if (loud) {
        speechMs += dt;
        lastLoud = now;
        // Creeps up under a louder room, slowly enough that speech doesn't pull it up.
        floor += (level - floor) * 0.002;
      } else {
        floor += (level - floor) * 0.05;
      }
      return heard() && now - lastLoud! >= silenceMs;
    },
    quietMs(now) {
      return heard() ? Math.max(0, now - lastLoud!) : 0;
    },
  };
}
