import { after, NextResponse } from 'next/server';
import { FormSchema } from '@vff/shared';
import { analyzeAndStore, savedReading } from '@/lib/agents/formAnalyzer';
import { requireUser } from '@/lib/auth';
import { fail, route } from '@/lib/http';
import { assertWritable, getFieldRows, getSessionByCode } from '@/lib/sessions';

export const runtime = 'nodejs';
export const maxDuration = 120;

type Ctx = { params: Promise<{ code: string }> };

/**
 * From the extension, once the page has been quiet for a moment: read the fields POST /fields added with
 * `read=later` (every field that appeared meanwhile, in one go). Fields this page's saved readings know
 * keep their reading; only the others go to the AI. Fields the session doesn't have are ignored.
 */
export const POST = route<Ctx>(async (req, { params }) => {
  const { code } = await params;
  const user = await requireUser(req);
  const session = await getSessionByCode(code);
  if (session.user_id !== user.id) throw fail(403, 'Not allowed');
  assertWritable(session);

  const schema = FormSchema.parse(await req.json());
  const have = new Set((await getFieldRows(session.id)).map((f) => f.field_key));
  schema.fields = schema.fields.filter((f) => have.has(f.field_key));
  if (!schema.fields.length) return NextResponse.json({ ok: true });

  const saved = await savedReading(schema);
  after(() => analyzeAndStore(session.id, schema, { partial: true, userId: user.id, saved }));
  return NextResponse.json({ ok: true }, { status: 202 });
});
