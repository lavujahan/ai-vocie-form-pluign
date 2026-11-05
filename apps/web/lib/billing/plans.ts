import 'server-only';
import type { CounterKind, Plan, PlanCounters, PlanStatus, UserRole } from '@vff/shared';
import { fail, must } from '../http';
import { MSG } from '../session-rules';
import { db } from '../supabase-admin';

/** One row of subscription_status() (bigint may be a string). The counter columns come with migration 0026. */
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
  computers_total?: number | null;
  documents_total?: number | null;
  documents_used?: number | null;
  voice_qrs_total?: number | null;
  voice_qrs_used?: number | null;
  nonvoice_qrs_total?: number | null;
  nonvoice_qrs_used?: number | null;
};

const round1 = (n: number) => Math.round(n * 10) / 10;
/** A limit: null (or missing) = no limit. */
const limitOf = (v: number | string | null | undefined) => (v === null || v === undefined ? null : Number(v));

function toCounters(r: RawPlanStatus): PlanCounters | undefined {
  if (r.documents_used === undefined) return undefined; // migration 0026 not applied
  return {
    computers: limitOf(r.computers_total),
    documents: { total: limitOf(r.documents_total), used: Number(r.documents_used ?? 0) },
    voice_qrs: { total: limitOf(r.voice_qrs_total), used: Number(r.voice_qrs_used ?? 0) },
    nonvoice_qrs: { total: limitOf(r.nonvoice_qrs_total), used: Number(r.nonvoice_qrs_used ?? 0) },
  };
}

export function toPlanStatus(r: RawPlanStatus, now = new Date()): PlanStatus {
  const total = Number(r.minutes_total ?? 0);
  const used = Number(r.used_ms ?? 0) / 60_000;
  const counters = toCounters(r);
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
    ...(counters ? { counters } : {}),
  };
}

type BlockCode = 'plan_expired' | 'quota_exceeded' | `limit_${CounterKind}`;

const COUNTER_MSG: Record<CounterKind, string> = {
  documents: MSG.documentsUsed,
  voice_qrs: MSG.voiceQrsUsed,
  nonvoice_qrs: MSG.nonvoiceQrsUsed,
};

/**
 * Why a user can't scan or speak (null = allowed). Admins are never blocked. With `minutes: false`
 * (a typing-only form, the Tamil helper: no voice minutes used) only an ended plan blocks. `counter`:
 * also refused when `count` more would go over that counter's limit.
 */
export function planBlock(
  role: UserRole,
  plan: PlanStatus | null,
  { minutes = true, counter, count = 1 }: { minutes?: boolean; counter?: CounterKind; count?: number } = {},
): { code: BlockCode; error: string } | null {
  if (role === 'admin') return null;
  if (!plan?.active) return { code: 'plan_expired', error: MSG.planEnded };
  if (minutes && plan.minutes_left <= 0) return { code: 'quota_exceeded', error: MSG.minutesUsed };
  const c = counter ? plan.counters?.[counter] : undefined;
  if (counter && c && c.total !== null && c.used + count > c.total) return { code: `limit_${counter}`, error: COUNTER_MSG[counter] };
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
 * Throws 402 when the user has no active plan, (unless `minutes: false`) no voice minutes left, or (with
 * `counter`) not `count` more of that counter left. Called before anything that costs AI money or uses a
 * counter. Admins skip the lookup.
 */
export async function assertCanUse(
  userId: string,
  role?: UserRole,
  opts: { minutes?: boolean; counter?: CounterKind; count?: number } = {},
): Promise<void> {
  if (role === 'admin') return;
  const all = await planStatuses(userId);
  if (!all) return;
  const s = all.get(userId);
  const block = planBlock(s?.role ?? 'user', s?.plan ?? null, opts);
  if (block) throw fail(402, block.error, { code: block.code });
}

const EVENT_KIND: Record<CounterKind, string> = { documents: 'document', voice_qrs: 'voice_qr', nonvoice_qrs: 'nonvoice_qr' };

/**
 * Counts one use (migration 0026). With `ref`, a use counts once per session (e.g. a document per upload
 * field): false when it was already counted. Never throws: the work it counts has already been done.
 */
export async function recordUse(
  userId: string,
  counter: CounterKind,
  { sessionId = null, ref = null }: { sessionId?: string | null; ref?: string | null } = {},
): Promise<boolean> {
  const { error } = await db().from('feature_events').insert({ user_id: userId, session_id: sessionId, kind: EVENT_KIND[counter], ref });
  if (!error) return true;
  if (error.code !== '23505' && !isMissing(error)) console.warn('use not counted', counter, error);
  return false;
}

/**
 * Regenerate on an expired QR (the same form, the same voice choice, nobody scanned it) makes a new QR
 * without counting one: only Generate QR counts.
 */
export function regenerateIsFree(
  previous: { user_id: string; paired_at: string | null; voice_enabled?: boolean | null } | null,
  userId: string,
  voice: boolean,
): boolean {
  return !!previous && previous.user_id === userId && !previous.paired_at && (previous.voice_enabled ?? true) === voice;
}

/** Was this use already counted (a document for this upload field of this session)? */
export async function wasCounted(sessionId: string, counter: CounterKind, ref: string): Promise<boolean> {
  const { data, error } = await db()
    .from('feature_events')
    .select('id')
    .eq('session_id', sessionId)
    .eq('kind', EVENT_KIND[counter])
    .eq('ref', ref)
    .limit(1)
    .maybeSingle();
  return !error && !!data;
}

const PLAN_COLUMNS = 'id, name, price_inr, minutes, days, is_active, sort';
export const PLAN_LIMIT_COLUMNS = `${PLAN_COLUMNS}, computers, documents, voice_qrs, nonvoice_qrs`;

export async function listPlans(): Promise<Plan[]> {
  let res = await db().from('plans').select(PLAN_LIMIT_COLUMNS).order('sort').order('price_inr');
  // Migration 0026 not applied: plans without limits.
  if (res.error?.code === '42703') res = (await db().from('plans').select(PLAN_COLUMNS).order('sort').order('price_inr')) as typeof res;
  const rows = must(res) as Plan[];
  return rows.map((p) => ({ ...p, price_inr: Number(p.price_inr) }));
}
