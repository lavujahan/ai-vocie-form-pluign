import { NextResponse } from 'next/server';
import { CreatePlanRequest, type Plan } from '@vff/shared';
import { requireAdmin } from '@/lib/auth';
import { isMissing, listPlans } from '@/lib/billing/plans';
import { fail, route } from '@/lib/http';
import { db } from '@/lib/supabase-admin';

export const runtime = 'nodejs';

export const GET = route(async (req) => {
  await requireAdmin(req);
  return NextResponse.json({ plans: await listPlans() });
});

export const POST = route(async (req) => {
  await requireAdmin(req);
  const body = CreatePlanRequest.parse(await req.json());
  const { data: last } = await db().from('plans').select('sort').order('sort', { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await db()
    .from('plans')
    .insert({ ...body, sort: ((last as { sort: number } | null)?.sort ?? 0) + 1 })
    .select('id, name, price_inr, minutes, days, is_active, sort')
    .single();
  if (error?.code === '23505') throw fail(409, 'A plan with this id already exists');
  if (isMissing(error)) throw fail(500, 'Apply migration 0013_subscriptions.sql to use plans.');
  if (error) throw fail(500, 'Database error');
  const plan = data as Plan;
  return NextResponse.json({ plan: { ...plan, price_inr: Number(plan.price_inr) } }, { status: 201 });
});
