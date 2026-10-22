import { NextResponse } from 'next/server';
import { UpdateFieldsRequest } from '@vff/shared';
import { requireUser } from '@/lib/auth';
import { fail, route } from '@/lib/http';
import { getSessionByCode } from '@/lib/sessions';
import { db } from '@/lib/supabase-admin';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ code: string }> };

/**
 * From the extension after a fill: dropdown options that loaded on the page (cascading dropdowns
 * are empty when the form is scanned) and "choose on your phone" hints for values it couldn't match.
 * The phone gets both through Realtime (form_fields UPDATE).
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
      if (f.options) patch.options = f.options;
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
