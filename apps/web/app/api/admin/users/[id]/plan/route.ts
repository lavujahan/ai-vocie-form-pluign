import { NextResponse } from 'next/server';
import { GrantPlanRequest, type SubscriptionRow, type UserPlanResponse } from '@vff/shared';
import { requireAdmin } from '@/lib/auth';
import { adminUser, grantPlan, PAYMENT_COLUMNS, toPaymentRows } from '@/lib/billing/admin';
import { listPlans } from '@/lib/billing/plans';
import { must, route } from '@/lib/http';
import { db } from '@/lib/supabase-admin';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

/** One user's plan, every period they had and every payment, newest first. */
export const GET = route<Ctx>(async (req, { params }) => {
  await requireAdmin(req);
  const { id } = await params;
  const [user, plans, subs, payments] = await Promise.all([
    adminUser(id),
    listPlans(),
    db()
      .from('subscriptions')
      .select('id, plan_id, starts_at, ends_at, minutes, extra_minutes, note, created_at, plans(name)')
      .eq('user_id', id)
      .order('starts_at', { ascending: false })
      .limit(100)
      .then(must),
    db().from('payments').select(PAYMENT_COLUMNS).eq('user_id', id).order('paid_at', { ascending: false }).limit(100).then(must),
  ]);
  const subscriptions = ((subs ?? []) as unknown as (Omit<SubscriptionRow, 'plan_name'> & { plans: { name: string } | null })[]).map(
    ({ plans: p, ...s }) => ({ ...s, plan_name: p?.name ?? s.plan_id }),
  );
  return NextResponse.json({ user, plans, subscriptions, payments: toPaymentRows(payments ?? []) } satisfies UserPlanResponse);
});

/** Renew or change the user's plan, recording the payment. */
export const POST = route<Ctx>(async (req, { params }) => {
  const admin = await requireAdmin(req);
  const { id } = await params;
  const body = GrantPlanRequest.parse(await req.json());
  await grantPlan(id, body, admin.id);
  return NextResponse.json({ user: await adminUser(id) });
});
