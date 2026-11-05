import { NextResponse } from 'next/server';
import { PlanInput, type Plan } from '@vff/shared';
import { requireAdmin } from '@/lib/auth';
import { PLAN_LIMIT_COLUMNS } from '@/lib/billing/plans';
import { fail, route } from '@/lib/http';
import { db } from '@/lib/supabase-admin';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

/**
 * Edit a plan. Periods already started keep the minutes and limits they started with; the new price,
 * minutes and limits apply from the next renewal. A plan that is not active can't be chosen for new periods.
 */
export const PATCH = route<Ctx>(async (req, { params }) => {
  await requireAdmin(req);
  const { id } = await params;
  const body = PlanInput.parse(await req.json());
  const { data, error } = await db()
    .from('plans')
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select(PLAN_LIMIT_COLUMNS)
    .maybeSingle();
  if (error?.code === '42703') throw fail(500, 'Apply migration 0026_plan_counters.sql to set plan limits.');
  if (error) throw fail(500, 'Database error');
  if (!data) throw fail(404, 'Plan not found');
  const plan = data as Plan;
  return NextResponse.json({ plan: { ...plan, price_inr: Number(plan.price_inr) } });
});
