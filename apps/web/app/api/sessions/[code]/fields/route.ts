import { after, NextResponse } from 'next/server';
import { FormSchema, UpdateFieldsRequest, type AddFieldsResponse } from '@vff/shared';
import { analyzeAndStore, savedReading } from '@/lib/agents/formAnalyzer';
import { requireUser } from '@/lib/auth';
import { fail, route } from '@/lib/http';
import {
  assertWritable,
  fieldRows,
  getFieldRows,
  getSessionByCode,
  insertFieldRows,
  newFieldsPlacement,
  toSessionField,
} from '@/lib/sessions';
import { db } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const maxDuration = 120;

type Ctx = { params: Promise<{ code: string }> };

/**
 * From the extension: fields that appeared after the first scan. `?step=next` (or no `step`, from older
 * extensions): a wizard's next step or a new page of the form, shown on the phone as the next step.
 * `?step=same`: fields a choice revealed (a checkbox, "Other", a branch of the form), in the step shown.
 * Either way they go after the existing fields, so the mapper's prompt still starts with the same text
 * (cached). The phone gets them through Realtime (form_fields INSERT). The Form Analyzer reads just these;
 * a set read before (by anyone) gets its saved field list, like a whole form.
 */
export const POST = route<Ctx>(async (req, { params }) => {
  const { code } = await params;
  const user = await requireUser(req);
  const session = await getSessionByCode(code);
  if (session.user_id !== user.id) throw fail(403, 'Not allowed');
  assertWritable(session);

  const schema = FormSchema.parse(await req.json());
  const nextStep = new URL(req.url).searchParams.get('step') !== 'same';
  const { fresh, startPosition, stepIndex } = newFieldsPlacement(await getFieldRows(session.id), schema.fields, nextStep);
  if (!fresh.length) return NextResponse.json({ fields: [] } satisfies AddFieldsResponse);

  const step = { ...schema, fields: fresh };
  const saved = await savedReading(step);
  if (saved?.template) step.fields = saved.template;
  const inserted = await insertFieldRows(fieldRows(session.id, step.fields, startPosition, stepIndex));
  after(() => analyzeAndStore(session.id, step, { partial: true, userId: user.id, saved }));
  return NextResponse.json({ fields: inserted.map(toSessionField) } satisfies AddFieldsResponse, { status: 201 });
});

/**
 * From the extension after a fill: "choose on your phone" hints for dropdown values it couldn't match
 * (the phone gets them through Realtime, form_fields UPDATE). Options that loaded on the page are not
 * saved (older extensions still send them): the form's field list stays as it was first saved, so the
 * mapper's prompt keeps the same text.
 */
export const PATCH = route<Ctx>(async (req, { params }) => {
  const { code } = await params;
  const user = await requireUser(req);
  const session = await getSessionByCode(code);
  if (session.user_id !== user.id) throw fail(403, 'Not allowed');

  const body = UpdateFieldsRequest.parse(await req.json());
  const results = await Promise.all(
    body.fields.map(async (f) => {
      const patch: Record<string, unknown> = {};
      if (f.choice_hint !== undefined) patch.choice_hint = f.choice_hint;
      if (!Object.keys(patch).length) return 0;
      const { data, error } = await db()
        .from('form_fields')
        .update(patch)
        .eq('session_id', session.id)
        .eq('field_key', f.field_key)
        .select('id');
      if (error) throw fail(500, 'Database error');
      return data?.length ?? 0;
    }),
  );
  return NextResponse.json({ updated: results.reduce((a, b) => a + b, 0) });
});
