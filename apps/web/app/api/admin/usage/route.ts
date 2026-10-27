import { NextResponse } from 'next/server';
import type { UsageSummaryResponse } from '@vff/shared';
import { requireAdmin } from '@/lib/auth';
import { isMissingCompletions } from '@/lib/completions';
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
  istDay,
  sumCosts,
  todayIst,
  withForms,
  type CompletionRow,
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
  const [raw, daily, settings, done] = await Promise.all([
    db().rpc('usage_summary', { p_from: bounds.from, p_to: bounds.to }).then(must),
    db().rpc('usage_daily', { p_from: bounds.from, p_to: bounds.to, p_user: user }),
    getBillingSettings(),
    db().from('form_completions').select('user_id, completed_at').gte('completed_at', bounds.from).lt('completed_at', bounds.to).limit(100_000),
  ]);
  // Forms completed in the same dates; before migration 0016 there is no table and the column shows "—".
  if (done.error && !isMissingCompletions(done.error.code)) must(done);
  const completions = done.error ? null : ((done.data ?? []) as CompletionRow[]);
  // Before migration 0011 there is no usage_daily(): the page shows the per-user table only.
  const missing = daily.error && (daily.error.code === 'PGRST202' || daily.error.code === '42883');
  if (daily.error && !missing) must(daily);
  const priced = missing ? null : priceDays((daily.data ?? []) as RawDayRow[], settings);
  const summary = priceSummary((raw ?? []) as RawUsageRow[], settings);
  const rows = withForms(summary.rows, completions, (c) => c.user_id, (r) => r.user_id);
  const dayCompletions = completions && (user ? completions.filter((c) => c.user_id === user) : completions);
  const days = priced && withForms(priced.days, dayCompletions, (c) => istDay(c.completed_at), (d) => d.day);

  return NextResponse.json({
    from,
    to,
    settings,
    rows,
    totals: { ...sumCosts(rows), forms_completed: completions ? completions.length : null },
    user,
    days,
    day_totals: days ? { ...sumCosts(days), forms_completed: dayCompletions ? dayCompletions.length : null } : null,
  } satisfies UsageSummaryResponse);
});
