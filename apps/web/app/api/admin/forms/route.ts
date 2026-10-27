import { NextResponse } from 'next/server';
import type { AdminFormsResponse } from '@vff/shared';
import { isMissingTable } from '@/lib/agents/formCache';
import { FORM_ROW_COLUMNS, toFormRow, type FormCacheRow } from '@/lib/admin-forms';
import { requireAdmin } from '@/lib/auth';
import { must, route } from '@/lib/http';
import { db } from '@/lib/supabase-admin';
import { getBillingSettings } from '@/lib/usage/settings';

export const runtime = 'nodejs';

/** The saved form readings, most recently used first (at most 500). */
export const GET = route(async (req) => {
  await requireAdmin(req);
  const [res, settings] = await Promise.all([
    db()
      .from('form_cache')
      .select(FORM_ROW_COLUMNS)
      .order('last_used_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(500),
    getBillingSettings(),
  ]);
  const missing = isMissingTable(res.error?.code);
  if (res.error && !missing) must(res);
  return NextResponse.json({
    rows: ((res.data ?? []) as FormCacheRow[]).map(toFormRow),
    usd_inr_rate: settings.usd_inr_rate,
    missing,
  } satisfies AdminFormsResponse);
});
