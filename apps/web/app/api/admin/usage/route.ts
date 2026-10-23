import { NextResponse } from 'next/server';
import type { UsageSummaryResponse } from '@vff/shared';
import { requireAdmin } from '@/lib/auth';
import { fail, must, route } from '@/lib/http';
import { db } from '@/lib/supabase-admin';
import { getBillingSettings } from '@/lib/usage/settings';
import { currentMonth, isMonth, monthBounds, priceSummary, type RawUsageRow } from '@/lib/usage/summary';

export const runtime = 'nodejs';

/** Per-user AI usage for one month (India time), priced in ₹ with the admin's rates. */
export const GET = route(async (req) => {
  await requireAdmin(req);
  const month = req.nextUrl.searchParams.get('month') || currentMonth();
  if (!isMonth(month)) throw fail(400, 'month must be YYYY-MM');
  const { from, to } = monthBounds(month);
  const [raw, settings] = await Promise.all([
    db().rpc('usage_summary', { p_from: from, p_to: to }).then(must),
    getBillingSettings(),
  ]);
  return NextResponse.json(priceSummary((raw ?? []) as RawUsageRow[], settings, month) satisfies UsageSummaryResponse);
});
