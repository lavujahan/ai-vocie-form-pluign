import { NextResponse } from 'next/server';
import type { UsageSummaryResponse } from '@vff/shared';
import { requireAdmin } from '@/lib/auth';
import { fail, must, route } from '@/lib/http';
import { db } from '@/lib/supabase-admin';
import { getBillingSettings } from '@/lib/usage/settings';
import {
  isDate,
  MAX_RANGE_DAYS,
  priceDays,
  priceSummary,
  rangeBounds,
  rangeDays,
  todayIst,
  type RawDayRow,
  type RawUsageRow,
} from '@/lib/usage/summary';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * AI usage between two dates (inclusive, India time), priced with the admin's prices: one row per user,
 * and one row per day for all users or `user`. Defaults: this month up to today.
 */
export const GET = route(async (req) => {
  await requireAdmin(req);
  const q = req.nextUrl.searchParams;
  const today = todayIst();
  const to = q.get('to') || today;
  const from = q.get('from') || `${to.slice(0, 7)}-01`;
  const user = q.get('user') || null;
  if (!isDate(from) || !isDate(to)) throw fail(400, 'Dates must be YYYY-MM-DD');
  if (from > to) throw fail(400, 'From must be on or before To');
  if (rangeDays(from, to) > MAX_RANGE_DAYS) throw fail(400, `Choose at most ${MAX_RANGE_DAYS} days`);
  if (user && !UUID_RE.test(user)) throw fail(400, 'Unknown user');

  const bounds = rangeBounds(from, to);
  const [raw, daily, settings] = await Promise.all([
    db().rpc('usage_summary', { p_from: bounds.from, p_to: bounds.to }).then(must),
    db().rpc('usage_daily', { p_from: bounds.from, p_to: bounds.to, p_user: user }),
    getBillingSettings(),
  ]);
  // Before migration 0011 there is no usage_daily(): the page shows the per-user table only.
  const missing = daily.error && (daily.error.code === 'PGRST202' || daily.error.code === '42883');
  if (daily.error && !missing) must(daily);
  const days = missing ? null : priceDays((daily.data ?? []) as RawDayRow[], settings);

  return NextResponse.json({
    from,
    to,
    settings,
    ...priceSummary((raw ?? []) as RawUsageRow[], settings),
    user,
    days: days?.days ?? null,
    day_totals: days?.day_totals ?? null,
  } satisfies UsageSummaryResponse);
});
