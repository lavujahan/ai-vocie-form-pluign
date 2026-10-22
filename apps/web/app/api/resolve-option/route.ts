import { NextResponse } from 'next/server';
import { ResolveOptionRequest, type ResolveOptionResponse } from '@vff/shared';
import { resolveOption } from '@/lib/agents/optionResolver';
import { requireUser } from '@/lib/auth';
import { fail, must, route } from '@/lib/http';
import { getSessionByCode } from '@/lib/sessions';
import { db } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** Extension → OpenAI Option Resolver Agent: which loaded dropdown option did the speaker mean? */
export const POST = route(async (req) => {
  const user = await requireUser(req);
  const body = ResolveOptionRequest.parse(await req.json());
  const session = await getSessionByCode(body.session_code);
  if (session.user_id !== user.id) throw fail(403, 'Not allowed');

  const field = must(
    await db()
      .from('form_fields')
      .select('label, clean_label')
      .eq('session_id', session.id)
      .eq('field_key', body.field_key)
      .maybeSingle(),
  ) as { label: string; clean_label: string | null } | null;
  if (!field) throw fail(404, 'Unknown field');

  const t0 = Date.now();
  const result = await resolveOption({ label: field.clean_label || field.label, spoken: body.spoken, options: body.options });
  console.log(
    `resolve-option field=${body.field_key} options=${body.options.length} choice=${result.choice ?? '-'} ambiguous=${result.ambiguous} ${Date.now() - t0}ms`,
  );
  return NextResponse.json(result satisfies ResolveOptionResponse);
});
