import { NextResponse } from 'next/server';
import type { DictateResponse } from '@vff/shared';
import { requireUser } from '@/lib/auth';
import { assertCanUse } from '@/lib/billing/plans';
import { fail, route } from '@/lib/http';
import { isTransient, withRetry } from '@/lib/sarvam/client';
import { dictationConfig, STT_MAX_SECONDS, tamilDigits, transcribe } from '@/lib/sarvam/stt';
import { sttEvent } from '@/lib/usage/events';
import { recordUsage } from '@/lib/usage/record';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

/**
 * Tamil typing in the extension popup: one piece of speech into Tamil text, with no form involved. The
 * audio and text are not kept; the seconds go in usage_events (no session), so they count in the plan's
 * voice minutes with everything else. A failed call counts nothing.
 */
export const POST = route(async (req) => {
  const user = await requireUser(req);
  const form = await req.formData();
  const audio = form.get('audio');
  const part = Number(form.get('part') ?? 0);
  const durationMs = Number(form.get('duration_ms'));
  if (!(audio instanceof Blob) || audio.size === 0) throw fail(400, 'Missing audio');
  if (audio.size > MAX_AUDIO_BYTES) throw fail(413, 'Recording is too long');
  if (!Number.isInteger(part) || part < 0 || part > 200) throw fail(400, 'Invalid part');
  // The seconds are what is counted, so a piece without them is refused.
  if (!Number.isFinite(durationMs) || durationMs <= 0) throw fail(400, 'Invalid duration_ms');
  // As on the phone: checked on a recording's first piece only, so a recording that started is never cut off.
  if (part === 0) await assertCanUse(user.id, user.role);

  const cfg = dictationConfig();
  const t0 = Date.now();
  let text: string;
  try {
    text = tamilDigits(await withRetry(() => transcribe(audio, [], cfg)));
  } catch (e) {
    console.error(`dictate failed after ${Date.now() - t0}ms`, e);
    throw fail(502, isTransient(e) ? 'Speech service is busy. Try again in a minute.' : "Couldn't write that. Try again.");
  }
  const audioMs = Math.min(Math.round(durationMs), STT_MAX_SECONDS * 1000);
  // Saved before replying: the popup re-reads the minutes straight after.
  await recordUsage([sttEvent({ user_id: user.id, session_id: null }, cfg.model, audioMs)]);
  console.log(`dictate part=${part} audio=${audioMs}ms stt=${Date.now() - t0}ms chars=${text.length}`);
  return NextResponse.json({ text } satisfies DictateResponse);
});
