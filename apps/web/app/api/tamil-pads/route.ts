import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { PAIR_CODE_TTL_MIN, type TamilPadCreateResponse } from '@vff/shared';
import { requireUser } from '@/lib/auth';
import { assertCanUse } from '@/lib/billing/plans';
import { env } from '@/lib/env';
import { fail, must, route } from '@/lib/http';
import { db } from '@/lib/supabase-admin';

export const runtime = 'nodejs';

/**
 * Tamil typing on the phone: a QR for one phone (10 minutes to scan). No form and no QR counter: the
 * seconds spoken count in the voice minutes, so a plan with none left gets no QR. `?end=<code>`: the
 * pad this one replaces, ended first (its phone stops).
 */
export const POST = route(async (req) => {
  const user = await requireUser(req);
  await assertCanUse(user.id, user.role);
  const end = new URL(req.url).searchParams.get('end');
  if (end) await db().from('tamil_pads').update({ ended_at: new Date().toISOString() }).eq('code', end).eq('user_id', user.id).is('ended_at', null);

  const code = randomBytes(16).toString('base64url');
  const expiresAt = new Date(Date.now() + PAIR_CODE_TTL_MIN * 60_000).toISOString();
  const res = await db().from('tamil_pads').insert({ user_id: user.id, code, expires_at: expiresAt }).select('id').single();
  if (res.error?.code === '42P01' || res.error?.code === 'PGRST205') throw fail(503, 'Tamil typing on the phone needs a server update (migration 0028).');
  const pad = must(res) as { id: string };
  return NextResponse.json(
    { pad_id: pad.id, code, qr_url: `${env.publicBaseUrl}/t/${code}`, expires_at: expiresAt } satisfies TamilPadCreateResponse,
    { status: 201 },
  );
});
