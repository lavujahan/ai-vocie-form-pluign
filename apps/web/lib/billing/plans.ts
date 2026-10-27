import 'server-only';
import type { Plan, PlanStatus, UserRole } from '@vff/shared';
import { fail, must } from '../http';
import { MSG } from '../session-rules';
import { db } from '../supabase-admin';

/** One row of subscription_status() (bigint may be a string). */
export type RawPlanStatus = {
  user_id: string;
  role: UserRole;
  plan_id: string | null;
  plan_name: string | null;
  starts_at: string | null;
  ends_at: string | null;
  minutes_total: number | string | null;
  used_ms: number | string | null;
  paid_until: string | null;
};

const round1 = (n: number) => Math.round(n * 10) / 10;

export function toPlanStatus(r: RawPlanStatus, now = new Date()): PlanStatus {
  const total = Number(r.minutes_total ?? 0);
  const used = Number(r.used_ms ?? 0) / 60_000;
  return {
    plan_id: r.plan_id,
    plan_name: r.plan_name,
    starts_at: r.starts_at,
    ends_at: r.ends_at,
    minutes_total: total,
    minutes_used: round1(used),
    // Exact, so a user is blocked only when every second is used (shown rounded down).
    minutes_left: Math.max(0, total - used),
    active: !!r.ends_at && Date.parse(r.ends_at) > now.getTime() && (!r.starts_at || Date.parse(r.starts_at) <= now.getTime()),
    paid_until: r.paid_until,
  };
}

/** Why a user can't scan or speak (null = allowed). Admins are never blocked. */
export function planBlock(role: UserRole, plan: PlanStatus | null): { code: 'plan_expired' | 'quota_exceeded'; error: string } | null {
  if (role === 'admin') return null;
  if (!plan?.active) return { code: 'plan_expired', error: MSG.planEnded };
  if (plan.minutes_left <= 0) return { code: 'quota_exceeded', error: MSG.minutesUsed };
  return null;
}

/** Postgres / PostgREST codes for a missing table or function: migration 0013 isn't applied yet. */
export const isMissing = (e: { code?: string } | null) => !!e && ['42P01', '42883', 'PGRST202', 'PGRST205'].includes(e.code ?? '');

/**
 * Plan status of one user (`userId`) or every user, by user id. null: billing isn't set up yet
 * (migration 0013 not applied), so nobody is limited.
 */
export async function planStatuses(userId?: string): Promise<Map<string, { role: UserRole; plan: PlanStatus }> | null> {
  const res = await db().rpc('subscription_status', { p_user: userId ?? null });
  if (isMissing(res.error)) return null;
  const rows = (must(res) ?? []) as RawPlanStatus[];
  const now = new Date();
  return new Map(rows.map((r) => [r.user_id, { role: r.role, plan: toPlanStatus(r, now) }]));
}

export async function planStatus(userId: string): Promise<{ role: UserRole; plan: PlanStatus } | null> {
  const all = await planStatuses(userId);
  return all ? (all.get(userId) ?? null) : null;
}

/**
 * Throws 402 when the user has no active plan or no voice minutes left. Called before anything that
 * costs AI money (scanning a form, transcribing speech). Admins skip the lookup.
 */
export async function assertCanUse(userId: string, role?: UserRole): Promise<void> {
  if (role === 'admin') return;
  const all = await planStatuses(userId);
  if (!all) return;
  const s = all.get(userId);
  const block = planBlock(s?.role ?? 'user', s?.plan ?? null);
  if (block) throw fail(402, block.error, { code: block.code });
}

export async function listPlans(): Promise<Plan[]> {
  const rows = must(await db().from('plans').select('id, name, price_inr, minutes, days, is_active, sort').order('sort').order('price_inr')) as Plan[];
  return rows.map((p) => ({ ...p, price_inr: Number(p.price_inr) }));
}
