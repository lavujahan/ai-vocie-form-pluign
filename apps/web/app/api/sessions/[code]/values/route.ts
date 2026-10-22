import { NextResponse } from 'next/server';
import { PatchValuesRequest, validateValue } from '@vff/shared';
import { requirePhone } from '@/lib/auth';
import { fail, route } from '@/lib/http';
import { assertWritable, getFieldRows, getSessionByCode, upsertValue } from '@/lib/sessions';
import { db } from '@/lib/supabase-admin';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ code: string }> };

/** Manual edits from the phone. They carry the phone's next seq, so they win over older speech. */
export const PATCH = route<Ctx>(async (req, { params }) => {
  const { code } = await params;
  const claims = await requirePhone(req);
  const session = await getSessionByCode(code);
  if (claims.session_id !== session.id) throw fail(403, 'Not allowed');
  assertWritable(session);

  const body = PatchValuesRequest.parse(await req.json());
  const fields = new Map((await getFieldRows(session.id)).map((f) => [f.field_key, f]));

  const saved: Record<string, string | null> = {};
  const errors: Record<string, string> = {};
  for (const item of body.values) {
    const field = fields.get(item.field_key);
    if (!field) {
      errors[item.field_key] = 'Unknown field';
      continue;
    }
    let value: string | null = null;
    if (item.value !== null && item.value.trim() !== '') {
      const v = validateValue({ ...field, required: false }, item.value);
      if (!v.ok) {
        errors[item.field_key] = v.error;
        continue;
      }
      value = v.value;
    }
    await upsertValue({
      sessionId: session.id,
      fieldId: field.id,
      value,
      confidence: 1,
      sourcePhrase: null,
      seq: body.seq,
      utteranceId: null,
    });
    saved[item.field_key] = value;
  }
  // A value chosen on the phone answers any "choose on your phone" picker for that field.
  const answered = Object.keys(saved);
  if (answered.length) {
    await db().from('form_fields').update({ choice_hint: null }).eq('session_id', session.id).in('field_key', answered);
  }
  return NextResponse.json({ saved, errors }, { status: Object.keys(errors).length && !Object.keys(saved).length ? 422 : 200 });
});
