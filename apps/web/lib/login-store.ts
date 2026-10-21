import 'server-only';
import type { DbUser } from './auth';
import { must } from './http';
import type { LoginStore } from './login';
import { db } from './supabase-admin';

export const supabaseLoginStore: LoginStore = {
  async countIpFailuresSince(ip, since) {
    const { count, error } = await db()
      .from('login_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('ip', ip)
      .eq('success', false)
      .gte('created_at', since.toISOString());
    if (error) throw error;
    return count ?? 0;
  },
  async findUserByPhone(phone) {
    return must(await db().from('users').select('*').eq('phone', phone).maybeSingle()) as DbUser | null;
  },
  async registerFailure(userId, max, lockMinutes) {
    const rows = must(
      await db().rpc('register_failed_login', { p_user: userId, p_max: max, p_lock_minutes: lockMinutes }),
    ) as { failed_attempts: number; locked_until: string | null }[];
    return rows[0] ?? { failed_attempts: 0, locked_until: null };
  },
  async resetFailures(userId) {
    must(await db().from('users').update({ failed_attempts: 0, locked_until: null }).eq('id', userId));
  },
  async recordAttempt(ip, phone, success) {
    must(await db().from('login_attempts').insert({ ip, phone, success }));
  },
};
