import 'server-only';
import { fail } from './http';
import { isTransient, withRetry } from './sarvam/client';
import { dictationConfig, STT_MAX_SECONDS, tamilDigits, transcribe } from './sarvam/stt';
import { sttEvent } from './usage/events';
import { recordUsage } from './usage/record';

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

/** One piece of a Tamil typing recording, as posted (long speech is cut every 28 s). */
export type DictationPiece = { audio: Blob; part: number; durationMs: number };

/** Reads and checks the posted piece. The seconds are what is counted, so a piece without them is refused. */
export function readPiece(form: FormData): DictationPiece {
  const audio = form.get('audio');
  const part = Number(form.get('part') ?? 0);
  const durationMs = Number(form.get('duration_ms'));
  if (!(audio instanceof Blob) || audio.size === 0) throw fail(400, 'Missing audio');
  if (audio.size > MAX_AUDIO_BYTES) throw fail(413, 'Recording is too long');
  if (!Number.isInteger(part) || part < 0 || part > 200) throw fail(400, 'Invalid part');
  if (!Number.isFinite(durationMs) || durationMs <= 0) throw fail(400, 'Invalid duration_ms');
  return { audio, part, durationMs };
}

/**
 * Tamil typing (on the computer or the phone): one piece of speech into Tamil text, with no form. The
 * audio is not kept; the seconds go in usage_events for `userId` (no session), so they count in the
 * plan's voice minutes with everything else. A failed call counts nothing.
 */
export async function dictate(piece: DictationPiece, userId: string, where: string): Promise<{ text: string; audioMs: number }> {
  const cfg = dictationConfig();
  const t0 = Date.now();
  let text: string;
  try {
    text = tamilDigits(await withRetry(() => transcribe(piece.audio, [], cfg)));
  } catch (e) {
    console.error(`${where} failed after ${Date.now() - t0}ms`, e);
    throw fail(502, isTransient(e) ? 'Speech service is busy. Try again in a minute.' : "Couldn't write that. Try again.");
  }
  const audioMs = Math.min(Math.round(piece.durationMs), STT_MAX_SECONDS * 1000);
  // Saved before replying: the popup re-reads the minutes straight after.
  await recordUsage([sttEvent({ user_id: userId, session_id: null }, cfg.model, audioMs)]);
  console.log(`${where} part=${piece.part} audio=${audioMs}ms stt=${Date.now() - t0}ms chars=${text.length}`);
  return { text, audioMs };
}
