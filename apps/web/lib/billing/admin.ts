import 'server-only';
import type { AdminUserRow, GrantPlanRequest, PaymentRow, TopUpRequest } from '@vff/shared';
import { ADMIN_USER_COLUMNS } from '../admin';
import { fail, must } from '../http';
import { db } from '../supabase-admin';
import { isMissing, planStatus, planStatuses } from './plans';

/** Adds each user's plan (left out before migration 0013). */
export async function attachPlans(users: AdminUserRow[]): Promise<AdminUserRow[]> {
  const plans = users.length ? await planStatuses(users.length === 1 ? users[0].id : undefined) : null;
  if (!plans) return users;
  return users.map((u) => {
    const s = plans.get(u.id);
    return s ? { ...u, plan: s.plan } : u;
  });
}

export async function adminUser(id: string): Promise<AdminUserRow> {
  const user = must(await db().from('users').select(ADMIN_USER_COLUMNS).eq('id', id).maybeSingle()) as AdminUserRow | null;
  if (!user) throw fail(404, 'User not found');
  return (await attachPlans([user]))[0];
}

/** Maps the errors grant_plan() / add_minutes() raise to messages for the admin. */
function planError(error: { code?: string; message: string } | null): never | void {
  if (!error) return;
  if (isMissing(error)) throw fail(500, 'Apply migration 0013_subscriptions.sql to use plans.');
  if (error.message.includes('already_planned')) throw fail(409, 'This user already has a plan starting later. Renew it after that one instead.');
  if (error.message.includes('no_active_plan')) throw fail(409, 'This user has no active plan to add minutes to. Renew the plan instead.');
  if (error.message.includes('unknown_plan')) throw fail(404, 'Plan not found');
  if (error.message.includes('unknown_user')) throw fail(404, 'User not found');
  console.error('plan update failed', error);
  throw fail(500, 'Database error');
}

/**
 * Starts a plan for a user, with its payment. A renewal ('after_current') starts when the paid time
 * ends, so paying early loses nothing; 'now' replaces the current period (a plan change).
 */
export async function grantPlan(userId: string, body: GrantPlanRequest, adminId: string | null): Promise<void> {
  const plan = must(await db().from('plans').select('is_active').eq('id', body.plan_id).maybeSingle()) as { is_active: boolean } | null;
  if (!plan) throw fail(404, 'Plan not found');
  if (!plan.is_active) throw fail(409, 'This plan is turned off. Turn it on in Plans to use it.');
  const now = new Date();
  let startsAt = now;
  if (body.start === 'after_current') {
    const paidUntil = (await planStatus(userId))?.plan.paid_until;
    if (paidUntil && Date.parse(paidUntil) > now.getTime()) startsAt = new Date(paidUntil);
  }
  const { error } = await db().rpc('grant_plan', {
    p_user: userId,
    p_plan: body.plan_id,
    p_starts_at: startsAt.toISOString(),
    p_amount: body.amount_inr ?? 0,
    p_method: body.method,
    p_reference: body.reference || null,
    p_note: body.note || null,
    p_admin: adminId,
  });
  planError(error);
}

export async function addMinutes(userId: string, body: TopUpRequest, adminId: string): Promise<void> {
  const { error } = await db().rpc('add_minutes', {
    p_user: userId,
    p_minutes: body.minutes,
    p_amount: body.amount_inr ?? 0,
    p_method: body.method,
    p_reference: body.reference || null,
    p_note: body.note || null,
    p_admin: adminId,
  });
  planError(error);
}

/**
 * A new user starts on the Trial plan while it is active. Never throws: the user is already created,
 * and before migration 0013 there are no plans.
 */
export async function startTrial(userId: string): Promise<void> {
  try {
    const { data } = await db().from('plans').select('id').eq('id', 'trial').eq('is_active', true).maybeSingle();
    if (data) await grantPlan(userId, { plan_id: 'trial', start: 'now', method: 'upi' }, null);
  } catch (e) {
    console.warn('trial not started', e);
  }
}

export const PAYMENT_COLUMNS =
  'id, user_id, kind, amount_inr, method, reference, note, paid_at, users!payments_user_id_fkey(name, phone), recorder:users!payments_recorded_by_fkey(name), subscriptions(plans(name))';

type RawPayment = Omit<PaymentRow, 'name' | 'phone' | 'plan_name' | 'amount_inr' | 'recorded_by_name'> & {
  amount_inr: number | string;
  users: { name: string; phone: string } | null;
  recorder: { name: string } | null;
  subscriptions: { plans: { name: string } | null } | null;
};

export function toPaymentRows(raw: unknown[]): PaymentRow[] {
  return (raw as RawPayment[]).map(({ users, recorder, subscriptions, ...p }) => ({
    ...p,
    amount_inr: Number(p.amount_inr),
    name: users?.name ?? null,
    phone: users?.phone ?? null,
    plan_name: subscriptions?.plans?.name ?? null,
    recorded_by_name: recorder?.name ?? null,
  }));
}

const IST_MS = 330 * 60_000;

/**
 * The payment moved to another India date (YYYY-MM-DD), at the same India time of day: payments of
 * one day stay in their order, and the day it counts on in Billing is the day chosen.
 */
export function paidAtOn(day: string, oldIso: string): string {
  const time = new Date(Date.parse(oldIso) + IST_MS).toISOString().slice(10); // "T14:05:09.123Z" in India time
  return new Date(Date.parse(`${day}${time}`) - IST_MS).toISOString();
}
