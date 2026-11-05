import 'server-only';
import type { DeviceInfo } from '@vff/shared';
import { fail, must } from '../http';
import { db } from '../supabase-admin';
import { isMissing, planStatus } from './plans';

/**
 * Computers a user is signed in on (plan counter "Computers", migration 0026). The extension sends its own
 * random device key with the PIN; a computer counts while its sign-in hasn't expired and it hasn't been
 * signed out. Admins, and the admin panel (no device key), are never counted.
 */

type DeviceRow = DeviceInfo & { device_key: string };
const COLUMNS = 'id, device_key, name, label:user_agent, signed_in_at, last_seen_at';

const toInfo = ({ device_key: _key, ...d }: DeviceRow): DeviceInfo => d;

/** Signed in now: not signed out and the sign-in hasn't expired. */
export async function activeDevices(userId: string, now = new Date()): Promise<DeviceInfo[] | null> {
  const res = await db()
    .from('user_devices')
    .select(COLUMNS)
    .eq('user_id', userId)
    .is('signed_out_at', null)
    .gt('expires_at', now.toISOString())
    .order('signed_in_at');
  if (isMissing(res.error)) return null;
  return ((must(res) ?? []) as unknown as DeviceRow[]).map(toInfo);
}

export type DeviceDecision =
  | { action: 'allow'; signOut: string | null }
  | { action: 'refuse'; devices: DeviceInfo[]; max: number };

/**
 * Whether this computer may sign in. It always may when it's already one of the signed-in ones (`mine`)
 * or the plan has room; otherwise only by signing out one of the others (`replaceId`).
 */
export function decideDevice(
  active: (DeviceInfo & { mine?: boolean })[],
  max: number | null,
  replaceId?: string,
): DeviceDecision {
  if (max === null || active.some((d) => d.mine)) return { action: 'allow', signOut: null };
  const others = active.filter((d) => !d.mine);
  if (others.length < max) return { action: 'allow', signOut: null };
  if (replaceId && others.some((d) => d.id === replaceId) && others.length - 1 < max) return { action: 'allow', signOut: replaceId };
  return { action: 'refuse', devices: others, max };
}

/**
 * Records this computer's sign-in until `expiresAt` and returns its id for the token, or null when devices
 * aren't counted (no device key, an admin, migration 0026 not applied). Throws 409 'too_many_computers'
 * with the computers signed in when the plan has no room.
 */
export async function claimDevice(
  user: { id: string; role: string },
  input: { device_key?: string; device_label?: string; replace_device_id?: string },
  expiresAt: string,
  userAgent: string | null,
): Promise<string | null> {
  if (!input.device_key || user.role === 'admin') return null;
  const now = new Date();
  const active = await activeDevices(user.id, now);
  if (!active) return null;
  const { data: mineRow } = await db().from('user_devices').select('id, name').eq('user_id', user.id).eq('device_key', input.device_key).maybeSingle();
  const mine = mineRow as { id: string; name: string } | null;
  // No plan (or an ended one) still signs in, so the popup can say why it can't scan: counted with the last period's limit.
  const max = (await planStatus(user.id))?.plan.counters?.computers ?? null;
  const decision = decideDevice(
    active.map((d) => ({ ...d, mine: d.id === mine?.id })),
    max,
    input.replace_device_id,
  );
  if (decision.action === 'refuse') {
    throw fail(
      409,
      `Your plan allows ${decision.max} computer${decision.max === 1 ? '' : 's'}, and you are signed in on ${decision.devices.length}. Sign out one of them to use this computer.`,
      { code: 'too_many_computers', devices: decision.devices, max_computers: decision.max },
    );
  }
  if (decision.signOut) {
    must(await db().from('user_devices').update({ signed_out_at: now.toISOString() }).eq('id', decision.signOut).eq('user_id', user.id));
  }
  const fields = {
    user_agent: input.device_label || userAgent?.slice(0, 60) || null,
    signed_in_at: now.toISOString(),
    expires_at: expiresAt,
    last_seen_at: now.toISOString(),
    signed_out_at: null,
  };
  if (mine) {
    must(await db().from('user_devices').update(fields).eq('id', mine.id));
    return mine.id;
  }
  const { count } = await db().from('user_devices').select('id', { count: 'exact', head: true }).eq('user_id', user.id);
  const row = must(
    await db()
      .from('user_devices')
      .insert({ user_id: user.id, device_key: input.device_key, name: `Computer ${(count ?? 0) + 1}`, ...fields })
      .select('id')
      .single(),
  ) as { id: string };
  return row.id;
}

/** Still signed in? Notes when it was last used (at most once a minute). False: signed out meanwhile. */
export async function deviceStillSignedIn(deviceId: string): Promise<boolean> {
  const { data, error } = await db().from('user_devices').select('signed_out_at, last_seen_at').eq('id', deviceId).maybeSingle();
  if (error) return true; // e.g. migration rolled back: don't lock everyone out
  const d = data as { signed_out_at: string | null; last_seen_at: string } | null;
  if (!d || d.signed_out_at) return false;
  if (Date.now() - Date.parse(d.last_seen_at) > 60_000) {
    await db().from('user_devices').update({ last_seen_at: new Date().toISOString() }).eq('id', deviceId);
  }
  return true;
}

/** Signs a computer out: its next request asks for the PIN again. */
export async function signOutDevice(deviceId: string, userId?: string): Promise<void> {
  let q = db().from('user_devices').update({ signed_out_at: new Date().toISOString() }).eq('id', deviceId).is('signed_out_at', null);
  if (userId) q = q.eq('user_id', userId);
  const { error } = await q;
  if (error && !isMissing(error)) console.warn('sign out failed', error);
}
