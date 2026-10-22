import { NextResponse } from 'next/server';
import type { UtteranceResponse } from '@vff/shared';
import { mapTranscript } from '@/lib/agents/fieldMapper';
import { transcribe } from '@/lib/sarvam/stt';
import { requirePhone } from '@/lib/auth';
import { fail, must, route } from '@/lib/http';
import { assertWritable, getFieldRows, getSessionById, getValues, upsertValue } from '@/lib/sessions';
import { db } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

/**
 * One utterance = one tap-to-stop recording. Utterances are processed independently and in parallel;
 * `seq` (assigned by the phone when the user spoke) decides which value wins, not finishing order.
 */
export const POST = route(async (req) => {
  const claims = await requirePhone(req);
  const session = await getSessionById(claims.session_id);
  assertWritable(session);

  const form = await req.formData();
  const audio = form.get('audio');
  const seq = Number(form.get('seq'));
  const target = (form.get('target_field_key') as string | null) || null;
  if (!(audio instanceof Blob) || audio.size === 0) throw fail(400, 'Missing audio');
  if (audio.size > MAX_AUDIO_BYTES) throw fail(413, 'Recording is too long');
  if (!Number.isInteger(seq) || seq < 1) throw fail(400, 'Invalid seq');

  const fields = await getFieldRows(session.id);
  if (target && !fields.some((f) => f.field_key === target)) throw fail(400, 'Unknown target field');

  const { data: utt, error } = await db()
    .from('utterances')
    .insert({ session_id: session.id, seq, target_field_key: target, status: 'processing' })
    .select('id')
    .single();
  if (error?.code === '23505') throw fail(409, 'This recording was already sent');
  if (error || !utt) throw fail(500, 'Database error');
  const utteranceId = (utt as { id: string }).id;

  const finish = async (patch: { status: 'done' | 'error'; transcript?: string | null; error?: string | null }) =>
    must(await db().from('utterances').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', utteranceId));

  let transcript: string | null = null;
  try {
    transcript = await transcribe(audio, fields);
    // Show the transcript on the phone/popup while mapping runs.
    await db().from('utterances').update({ transcript }).eq('id', utteranceId);

    const keyById = new Map(fields.map((f) => [f.id, f.field_key]));
    const current = Object.fromEntries((await getValues(session.id)).map((v) => [keyById.get(v.field_id)!, v.value]));
    const outcome = await mapTranscript({ fields, current, transcript, targetFieldKey: target });

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

    return NextResponse.json({
      utterance_id: utteranceId,
      seq,
      status: 'done',
      transcript,
      values: outcome.values,
      unmapped_speech: outcome.unmapped_speech,
    } satisfies UtteranceResponse);
  } catch (e) {
    console.error('utterance failed', e);
    const message = transcript ? "Couldn't match that to the form. Tap to retry." : "Couldn't transcribe. Tap to retry.";
    await finish({ status: 'error', error: message });
    return NextResponse.json(
      { utterance_id: utteranceId, seq, status: 'error', transcript, values: [], unmapped_speech: null, error: message } satisfies UtteranceResponse,
      { status: 502 },
    );
  }
});
