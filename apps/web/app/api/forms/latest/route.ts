import { NextResponse } from 'next/server';
import type { LatestFormsResponse } from '@vff/shared';
import { requireUser } from '@/lib/auth';
import { must, route } from '@/lib/http';
import { latestForms, type ScannedForm } from '@/lib/queue';
import { db } from '@/lib/supabase-admin';

export const runtime = 'nodejs';

/** No user_scanned_forms yet (migration 0023 not applied). */
const isMissingFunction = (code: string | undefined) => code === '42883' || code === 'PGRST202';

/** For the extension: the forms this user scanned lately, each ready for a new QR code. */
export const GET = route(async (req) => {
  const user = await requireUser(req);
  const res = await db().rpc('user_scanned_forms', { p_user: user.id });
  if (isMissingFunction(res.error?.code)) return NextResponse.json({ forms: [] } satisfies LatestFormsResponse);
  return NextResponse.json({ forms: latestForms(must(res) as ScannedForm[]) } satisfies LatestFormsResponse);
});
