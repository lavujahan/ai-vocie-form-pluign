import { after, NextResponse } from 'next/server';
import type { UtteranceResponse } from '@vff/shared';
import { mapTranscript } from '@/lib/agents/fieldMapper';
import { isEmptyTranscript } from '@/lib/agents/guardrails';
import { STT_MAX_SECONDS, sttConfig, transcribe } from '@/lib/sarvam/stt';
import { requirePhone } from '@/lib/auth';
import { fail, must, route } from '@/lib/http';
import { assertPhoneCanWrite, assertPhoneOf, getFieldRows, getSessionById, getValues, recentSpeech, upsertValue } from '@/lib/sessions';
import { recordingTranscriptSoFar } from '@/lib/recordings';
import { db } from '@/lib/supabase-admin';
import { openaiEvent, sttEvent, type UsageEvent } from '@/lib/usage/events';
import { recordUsage } from '@/lib/usage/record';

export const runtime = 'nodejs';
export const maxDuration = 120;

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BUSY = 'Speech service is busy. Tap to retry in a minute.';

/** Sarvam or OpenAI rate-limited or briefly down (HTTP 429 / 5xx): worth one more try. */
function isTransient(e: unknown): boolean {
  const status = (e as { status?: unknown } | null)?.status;
  return typeof status === 'number' && (status === 429 || status >= 500);
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (!isTransient(e)) throw e;
    await new Promise((r) => setTimeout(r, 1000));
    return fn();
  }
}

/**
 * One utterance = one tap-to-stop recording. Utterances are processed independently and in parallel;
 * `seq` (assigned by the phone when the user spoke) decides which value wins, not finishing order.
 */
export const POST = route(async (req) => {
  const claims = await requirePhone(req);
  const session = await getSessionById(claims.session_id);
  assertPhoneOf(claims, session);

  const form = await req.formData();
  const audio = form.get('audio');
  const seq = Number(form.get('seq'));
  const target = (form.get('target_field_key') as string | null) || null;
  // Pieces of one long recording (cut for Sarvam's 30 s limit) share a recording_id; part = 0, 1, 2…
  const recordingId = (form.get('recording_id') as string | null) || null;
  const part = form.get('part') === null ? 0 : Number(form.get('part'));
  if (recordingId && !UUID_RE.test(recordingId)) throw fail(400, 'Invalid recording_id');
  if (!Number.isInteger(part) || part < 0 || part > 200) throw fail(400, 'Invalid part');
  if (!(audio instanceof Blob) || audio.size === 0) throw fail(400, 'Missing audio');
  if (audio.size > MAX_AUDIO_BYTES) throw fail(413, 'Recording is too long');
  if (!Number.isInteger(seq) || seq < 1) throw fail(400, 'Invalid seq');
  // Sarvam bills by audio length and its reply doesn't say it: the phone sends how long it recorded.
  const durationMs = Number(form.get('duration_ms'));
  const audioMs = form.get('duration_ms') !== null && Number.isFinite(durationMs) && durationMs > 0
    ? Math.min(Math.round(durationMs), STT_MAX_SECONDS * 1000)
    : null;
  // Desktop tab closed (nothing would be filled), or spoken before a Start over: don't spend AI on it.
  assertPhoneCanWrite(session, seq);

  // Upload fields are filled from the phone's camera / files, never from speech.
  const fields = (await getFieldRows(session.id)).filter((f) => f.field_type !== 'file');
  if (target && !fields.some((f) => f.field_key === target)) throw fail(400, 'Unknown target field');

  const row = { session_id: session.id, seq, target_field_key: target, status: 'processing' };
  let { data: utt, error } = await db()
    .from('utterances')
    .insert({ ...row, recording_id: recordingId, part })
    .select('id')
    .single();
  // Migration 0003 not applied yet: work as before, just without joining pieces.
  let canJoinPieces = true;
  if (error && (error.code === 'PGRST204' || error.code === '42703')) {
    canJoinPieces = false;
    ({ data: utt, error } = await db().from('utterances').insert(row).select('id').single());
  }
  if (error?.code === '23505') throw fail(409, 'This recording was already sent');
  if (error || !utt) throw fail(500, 'Database error');
  const utteranceId = (utt as { id: string }).id;

  // Every paid call of this utterance, saved after the response is sent.
  const owner = { user_id: session.user_id, session_id: session.id, utterance_id: utteranceId };
  const usage: UsageEvent[] = [];
  after(() => recordUsage(usage));

  const finish = async (patch: { status: 'done' | 'error'; transcript?: string | null; error?: string | null }) =>
    must(await db().from('utterances').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', utteranceId));

  let transcript: string | null = null;
  const t0 = Date.now();
  let tStt = 0;
  try {
    transcript = await withRetry(() => transcribe(audio, fields));
    tStt = Date.now() - t0;
    usage.push(sttEvent(owner, sttConfig().model, audioMs));
    // Show the transcript on the phone/popup while mapping runs.
    await db().from('utterances').update({ transcript }).eq('id', utteranceId);

    const keyById = new Map(fields.map((f) => [f.id, f.field_key]));
    const values = await getValues(session.id);
    const current = Object.fromEntries(values.map((v) => [keyById.get(v.field_id)!, v.value]));
    // A later piece that caught only silence (the user paused, then tapped stop): nothing to add.
    if (part > 0 && isEmptyTranscript(transcript)) {
      await finish({ status: 'done' });
      return NextResponse.json({
        utterance_id: utteranceId,
        seq,
        status: 'done',
        transcript,
        values: [],
        unmapped_speech: null,
      } satisfies UtteranceResponse);
    }

    // Map the whole recording so far, so words cut across pieces are read together.
    const fullText =
      recordingId && part > 0 && canJoinPieces
        ? await recordingTranscriptSoFar(session.id, recordingId, part, transcript)
        : transcript;

    const tMap0 = Date.now();
    // What was said just before: corrections like "no, not Jahan, Jagan" point back to it.
    const recent = target ? [] : await recentSpeech(session, seq, recordingId, fields, values);
    const outcome = await withRetry(() =>
      mapTranscript(
        { fields, current, transcript: fullText, targetFieldKey: target, recent },
        { onUsage: (run) => usage.push(openaiEvent(owner, 'map', run)) },
      ),
    );
    console.log(
      `utterance seq=${seq} part=${part} stt=${tStt}ms map=${Date.now() - tMap0}ms values=${outcome.empty ? 0 : outcome.values.length} chars=${fullText.length}`,
    );

    if (outcome.empty) {
      const message = "Didn't catch any speech. Tap to retry.";
      await finish({ status: 'error', error: message });
      return NextResponse.json({
        utterance_id: utteranceId,
        seq,
        status: 'error',
        transcript,
        values: [],
        unmapped_speech: null,
        error: message,
      } satisfies UtteranceResponse);
    }

    const fieldByKey = new Map(fields.map((f) => [f.field_key, f]));
    await Promise.all(
      outcome.values.map((v) =>
        upsertValue({
          sessionId: session.id,
          fieldId: fieldByKey.get(v.field_key)!.id,
          value: v.value,
          confidence: v.confidence,
          sourcePhrase: v.source_phrase,
          seq,
          utteranceId,
        }),
      ),
    );
    await finish({ status: 'done' });
    // A spoken command ("start over", "send it"): kept on the utterance; the phone asks before acting.
    // Before migration 0006 the column doesn't exist; the response still carries it.
    if (outcome.command) await db().from('utterances').update({ command: outcome.command }).eq('id', utteranceId);

    return NextResponse.json({
      utterance_id: utteranceId,
      seq,
      status: 'done',
      transcript,
      values: outcome.values,
      unmapped_speech: outcome.unmapped_speech,
      command: outcome.command,
    } satisfies UtteranceResponse);
  } catch (e) {
    const provider = transcript === null ? 'Sarvam speech-to-text' : 'OpenAI mapping';
    console.error(`utterance seq=${seq} failed in ${provider} after ${Date.now() - t0}ms (stt=${tStt}ms)`, e);
    const message = isTransient(e)
      ? BUSY
      : transcript
        ? "Couldn't match that to the form. Tap to retry."
        : "Couldn't transcribe. Tap to retry.";
    await finish({ status: 'error', error: message });
    return NextResponse.json(
      { utterance_id: utteranceId, seq, status: 'error', transcript, values: [], unmapped_speech: null, error: message } satisfies UtteranceResponse,
      { status: 502 },
    );
  }
});
