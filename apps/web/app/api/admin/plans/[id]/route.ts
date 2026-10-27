import { NextResponse } from 'next/server';
import { PlanInput, type Plan } from '@vff/shared';
import { requireAdmin } from '@/lib/auth';
import { fail, route } from '@/lib/http';
import { db } from '@/lib/supabase-admin';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

/**
 * Edit a plan. Periods already started keep the minutes they started with; the new price and minutes
 * apply from the next renewal. A plan that is not active can't be chosen for new periods.
 */
export const PATCH = route<Ctx>(async (req, { params }) => {
  await requireAdmin(req);
  const { id } = await params;
  const body = PlanInput.parse(await req.json());
  const { data, error } = await db()
    .from('plans')
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, name, price_inr, minutes, days, is_active, sort')
    .maybeSingle();
  if (error) throw fail(500, 'Database error');
  if (!data) throw fail(404, 'Plan not found');
  const plan = data as Plan;
  return NextResponse.json({ plan: { ...plan, price_inr: Number(plan.price_inr) } });
});
