import { NextResponse } from 'next/server';
import type { BillingResponse } from '@vff/shared';
import { requireAdmin } from '@/lib/auth';
import { PAYMENT_COLUMNS, toPaymentRows } from '@/lib/billing/admin';
import { isMissing, planStatuses } from '@/lib/billing/plans';
import { fail, must, route } from '@/lib/http';
import { db } from '@/lib/supabase-admin';
import { getBillingSettings } from '@/lib/usage/settings';
import { isDate, MAX_RANGE_DAYS, priceSummary, rangeBounds, rangeDays, todayIst, type RawUsageRow } from '@/lib/usage/summary';

export const runtime = 'nodejs';

const DAY_MS = 86_400_000;
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Money received between two dates (inclusive, India time) against the AI cost of the same dates, per
 * user, and the users whose plan is ending or ended recently. Defaults: this month up to today.
 */
export const GET = route(async (req) => {
  await requireAdmin(req);
  const q = req.nextUrl.searchParams;
  const to = q.get('to') || todayIst();
  const from = q.get('from') || `${to.slice(0, 7)}-01`;
  if (!isDate(from) || !isDate(to)) throw fail(400, 'Dates must be YYYY-MM-DD');
  if (from > to) throw fail(400, 'From must be on or before To');
  if (rangeDays(from, to) > MAX_RANGE_DAYS) throw fail(400, `Choose at most ${MAX_RANGE_DAYS} days`);

  const bounds = rangeBounds(from, to);
  const [payRes, usage, settings, statuses, users] = await Promise.all([
    db().from('payments').select(PAYMENT_COLUMNS).gte('paid_at', bounds.from).lt('paid_at', bounds.to).order('paid_at', { ascending: false }).limit(5000),
    db().rpc('usage_summary', { p_from: bounds.from, p_to: bounds.to }).then(must),
    getBillingSettings(),
    planStatuses(),
    db().from('users').select('id, name, phone, is_active').then(must),
  ]);
  if (isMissing(payRes.error) || !statuses) throw fail(500, 'Apply migration 0013_subscriptions.sql to see billing.');
  const payments = toPaymentRows(must(payRes) ?? []);
  const costs = priceSummary((usage ?? []) as RawUsageRow[], settings).rows;

  // Revenue and AI cost per user, joined on user id (null: a deleted user's AI usage).
  type Acc = BillingResponse['users'][number];
  const byUser = new Map<string | null, Acc>();
  const acc = (id: string | null, name: string | null, phone: string | null): Acc => {
    let a = byUser.get(id);
    if (!a) byUser.set(id, (a = { user_id: id, name, phone, revenue_inr: 0, cost_inr: 0, margin_inr: 0, minutes: 0 }));
    return a;
  };
  for (const p of payments) acc(p.user_id, p.name, p.phone).revenue_inr += p.amount_inr;
  for (const c of costs) {
    const a = acc(c.user_id, c.name, c.phone);
    a.cost_inr += c.total_inr;
    a.minutes += c.minutes;
  }
  const rows = [...byUser.values()]
    .map((a) => ({ ...a, revenue_inr: round2(a.revenue_inr), cost_inr: round2(a.cost_inr), margin_inr: round2(a.revenue_inr - a.cost_inr) }))
    .sort((a, b) => b.revenue_inr - a.revenue_inr || b.cost_inr - a.cost_inr);
  const sum = (k: 'revenue_inr' | 'cost_inr' | 'minutes') => rows.reduce((n, r) => n + r[k], 0);
  const totals = { revenue_inr: round2(sum('revenue_inr')), cost_inr: round2(sum('cost_inr')), margin_inr: 0, minutes: sum('minutes') };
  totals.margin_inr = round2(totals.revenue_inr - totals.cost_inr);

  // Active users whose paid time ends within 7 days, or ended in the last 30.
  const now = Date.now();
  const renewals: BillingResponse['renewals'] = [];
  for (const u of users as { id: string; name: string; phone: string; is_active: boolean }[]) {
    const s = statuses.get(u.id);
    if (!u.is_active || !s || s.role !== 'user' || !s.plan.paid_until) continue;
    const until = Date.parse(s.plan.paid_until);
    if (until < now + 7 * DAY_MS && until > now - 30 * DAY_MS) renewals.push({ ...s.plan, user_id: u.id, name: u.name, phone: u.phone });
  }
  renewals.sort((a, b) => Date.parse(a.paid_until!) - Date.parse(b.paid_until!));

  return NextResponse.json({ from, to, payments, users: rows, totals, renewals } satisfies BillingResponse);
});
