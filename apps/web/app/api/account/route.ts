import { NextResponse } from 'next/server';
import type { AccountResponse } from '@vff/shared';
import { requireUser, toPublicUser } from '@/lib/auth';
import { planStatus } from '@/lib/billing/plans';
import { route } from '@/lib/http';

export const runtime = 'nodejs';

/** The signed-in user and their plan: the extension popup shows the plan and the minutes left. */
export const GET = route(async (req) => {
  const user = await requireUser(req);
  const status = user.role === 'admin' ? null : await planStatus(user.id);
  return NextResponse.json({
    user: toPublicUser(user),
    plan: status?.plan ?? null,
    // Admins are never limited, and nobody is before migration 0013.
    unlimited: user.role === 'admin' || status === null,
  } satisfies AccountResponse);
});
