import { NextResponse } from 'next/server';
import { GrantPlanRequest, type SubscriptionRow, type UserPlanResponse } from '@vff/shared';
import { requireAdmin } from '@/lib/auth';
import { adminUser, grantPlan, PAYMENT_COLUMNS, toPaymentRows } from '@/lib/billing/admin';
import { activeDevices } from '@/lib/billing/devices';
import { listPlans } from '@/lib/billing/plans';
import { must, route } from '@/lib/http';
import { db } from '@/lib/supabase-admin';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

const SUB_COLUMNS = 'id, plan_id, starts_at, ends_at, minutes, extra_minutes, note, created_at';
const SUB_LIMIT_COLUMNS =
  'computers, documents, voice_qrs, nonvoice_qrs, extra_computers, extra_documents, extra_voice_qrs, extra_nonvoice_qrs';

/** One user's plan, every period they had and every payment, newest first. */
export const GET = route<Ctx>(async (req, { params }) => {
  await requireAdmin(req);
  const { id } = await params;
  const periodsWith = (columns: string) =>
    db().from('subscriptions').select(`${columns}, plans(name)`).eq('user_id', id).order('starts_at', { ascending: false }).limit(100);
  const [user, plans, subs, payments, devices] = await Promise.all([
    adminUser(id),
    listPlans(),
    // Migration 0026 not applied: periods without limits.
    periodsWith(`${SUB_COLUMNS}, ${SUB_LIMIT_COLUMNS}`).then(async (res) => must(res.error?.code === '42703' ? await periodsWith(SUB_COLUMNS) : res)),
    db().from('payments').select(PAYMENT_COLUMNS).eq('user_id', id).order('paid_at', { ascending: false }).limit(100).then(must),
    activeDevices(id),
  ]);
  const subscriptions = ((subs ?? []) as unknown as (Omit<SubscriptionRow, 'plan_name'> & { plans: { name: string } | null })[]).map(
    ({ plans: p, ...s }) => ({ ...s, plan_name: p?.name ?? s.plan_id }),
  );
  return NextResponse.json({
    user,
    plans,
    subscriptions,
    payments: toPaymentRows(payments ?? []),
    ...(devices ? { devices } : {}),
  } satisfies UserPlanResponse);
});

/** Renew or change the user's plan, recording the payment. */
export const POST = route<Ctx>(async (req, { params }) => {
  const admin = await requireAdmin(req);
  const { id } = await params;
  const body = GrantPlanRequest.parse(await req.json());
  await grantPlan(id, body, admin.id);
  return NextResponse.json({ user: await adminUser(id) });
});
