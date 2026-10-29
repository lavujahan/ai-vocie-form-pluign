import { NextResponse } from 'next/server';
import type { PaymentsResponse } from '@vff/shared';
import { requireAdmin } from '@/lib/auth';
import { PAYMENT_COLUMNS, toPaymentRows } from '@/lib/billing/admin';
import { isMissing } from '@/lib/billing/plans';
import { fail, must, route } from '@/lib/http';
import { db } from '@/lib/supabase-admin';
import { isDate, MAX_RANGE_DAYS, rangeBounds, rangeDays, todayIst } from '@/lib/usage/summary';

export const runtime = 'nodejs';

/** Every payment between two dates (inclusive, India time), newest first. Defaults: this month up to today. */
export const GET = route(async (req) => {
  await requireAdmin(req);
  const q = req.nextUrl.searchParams;
  const to = q.get('to') || todayIst();
  const from = q.get('from') || `${to.slice(0, 7)}-01`;
  if (!isDate(from) || !isDate(to)) throw fail(400, 'Dates must be YYYY-MM-DD');
  if (from > to) throw fail(400, 'From must be on or before To');
  if (rangeDays(from, to) > MAX_RANGE_DAYS) throw fail(400, `Choose at most ${MAX_RANGE_DAYS} days`);

  const bounds = rangeBounds(from, to);
  const res = await db()
    .from('payments')
    .select(PAYMENT_COLUMNS)
    .gte('paid_at', bounds.from)
    .lt('paid_at', bounds.to)
    .order('paid_at', { ascending: false })
    .limit(5000);
  if (isMissing(res.error)) throw fail(500, 'Apply migration 0013_subscriptions.sql to see payments.');
  return NextResponse.json({ from, to, payments: toPaymentRows(must(res) ?? []) } satisfies PaymentsResponse);
});
