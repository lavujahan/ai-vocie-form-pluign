import { NextResponse } from 'next/server';
import type { AccountResponse } from '@vff/shared';
import { requireUser, toPublicUser } from '@/lib/auth';
import { planStatus } from '@/lib/billing/plans';
import { isMissingCompletions } from '@/lib/completions';
import { route } from '@/lib/http';
import { db } from '@/lib/supabase-admin';

export const runtime = 'nodejs';

const DAY_MS = 86_400_000;

/** Forms this user completed since `since`, and in total; null before migration 0016. */
async function formsCompleted(userId: string, since: string): Promise<AccountResponse['forms_completed']> {
  const count = (from?: string) => {
    let q = db().from('form_completions').select('session_id', { count: 'exact', head: true }).eq('user_id', userId);
    if (from) q = q.gte('completed_at', from);
    return q;
  };
  const [period, total] = await Promise.all([count(since), count()]);
  if (isMissingCompletions(period.error?.code ?? total.error?.code)) return null;
  return { period: period.count ?? 0, total: total.count ?? 0 };
}

/** The signed-in user, their plan and the forms they completed: the extension popup shows them. */
export const GET = route(async (req) => {
  const user = await requireUser(req);
  const status = user.role === 'admin' ? null : await planStatus(user.id);
  // "This plan": since the current period started; without a plan, the last 30 days.
  const since = status?.plan.starts_at ?? new Date(Date.now() - 30 * DAY_MS).toISOString();
  return NextResponse.json({
    user: toPublicUser(user),
    plan: status?.plan ?? null,
    // Admins are never limited, and nobody is before migration 0013.
    unlimited: user.role === 'admin' || status === null,
    forms_completed: await formsCompleted(user.id, since),
  } satisfies AccountResponse);
});
