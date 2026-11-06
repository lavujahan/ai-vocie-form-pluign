import 'server-only';
import type { NextRequest } from 'next/server';
import { TAMIL_PAD_HOURS, type TamilPadInfo, type TamilPadPiece } from '@vff/shared';
import { bearer } from './auth';
import { env } from './env';
import { fail, must } from './http';
import { signJwt, verifyJwt } from './jwt';
import { db } from './supabase-admin';

/** A Tamil typing QR (migration 0028). */
export type PadRow = {
  id: string;
  user_id: string;
  code: string;
  created_at: string;
  expires_at: string;
  paired_at: string | null;
  ended_at: string | null;
  last_seen_at: string;
};

export const PAD_MSG = {
  gone: 'This QR code has ended. Ask for a new one at the counter.',
  used: 'This QR code was already opened on another phone. Ask for a new one.',
  expired: 'This QR code has expired. Ask for a new one at the counter.',
  ended: 'Tamil typing has ended. The text is on the computer.',
};

/** Before migration 0028 the tables don't exist: say so instead of "Database error". */
function missing(error: { code?: string } | null) {
  return error?.code === '42P01' || error?.code === 'PGRST205';
}

export async function getPad(code: string): Promise<PadRow> {
  const res = await db().from('tamil_pads').select('*').eq('code', code).maybeSingle();
  if (missing(res.error)) throw fail(503, 'Tamil typing on the phone needs a server update (migration 0028).');
  const pad = must(res) as PadRow | null;
  if (!pad) throw fail(404, PAD_MSG.gone);
  return pad;
}

export async function padPieces(padId: string): Promise<TamilPadPiece[]> {
  const rows = must(
    await db().from('tamil_pad_pieces').select('seq, text, deleted, updated_at').eq('pad_id', padId).order('seq'),
  ) as TamilPadPiece[];
  return rows;
}

export async function padInfo(pad: PadRow): Promise<TamilPadInfo> {
  return {
    pad_id: pad.id,
    code: pad.code,
    expires_at: pad.expires_at,
    paired_at: pad.paired_at,
    ended_at: pad.ended_at,
    pieces: await padPieces(pad.id),
  };
}

export function signPadJwt(padId: string) {
  return signJwt({ role: 'authenticated', scope: 'pad', pad_id: padId }, padId, TAMIL_PAD_HOURS * 3600, env.jwtSecret);
}

/** Who is asking: the user who made the pad (the extension) or its paired phone. */
export async function padAccess(req: NextRequest, pad: PadRow): Promise<'user' | 'phone'> {
  const token = bearer(req);
  const claims = token ? await verifyJwt(token, env.jwtSecret) : null;
  if (claims?.scope === 'pad' && claims.pad_id === pad.id) return 'phone';
  if (claims?.scope === 'user' && claims.sub === pad.user_id) return 'user';
  throw fail(claims ? 403 : 401, claims?.scope === 'pad' ? PAD_MSG.gone : 'Not allowed');
}

/** The pad's own phone, while the pad is on. */
export async function requirePadPhone(req: NextRequest, code: string): Promise<PadRow> {
  const pad = await getPad(code);
  if ((await padAccess(req, pad)) !== 'phone') throw fail(403, 'Not allowed');
  if (pad.ended_at) throw fail(410, PAD_MSG.ended, { code: 'pad_ended' });
  return pad;
}

/** The phone is still here: keeps the text from being purged while it is used. */
export async function touchPad(padId: string) {
  await db().from('tamil_pads').update({ last_seen_at: new Date().toISOString() }).eq('id', padId);
}

/**
 * Adds a sentence at the end. Recordings on one phone are written one at a time, so a clash on `seq`
 * is rare (a retry racing the next recording): take the next number and try again.
 */
export async function addPiece(padId: string, text: string, audioMs: number): Promise<TamilPadPiece> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const last = must(
      await db().from('tamil_pad_pieces').select('seq').eq('pad_id', padId).order('seq', { ascending: false }).limit(1).maybeSingle(),
    ) as { seq: number } | null;
    const res = await db()
      .from('tamil_pad_pieces')
      .insert({ pad_id: padId, seq: (last?.seq ?? 0) + 1, text, audio_ms: audioMs })
      .select('seq, text, deleted, updated_at')
      .single();
    if (res.error?.code === '23505') continue;
    return must(res) as TamilPadPiece;
  }
  throw fail(409, 'Try again');
}

export async function getPiece(padId: string, seq: number): Promise<TamilPadPiece & { audio_ms: number }> {
  const piece = must(
    await db().from('tamil_pad_pieces').select('seq, text, deleted, updated_at, audio_ms').eq('pad_id', padId).eq('seq', seq).maybeSingle(),
  ) as (TamilPadPiece & { audio_ms: number }) | null;
  if (!piece) throw fail(404, 'This sentence is no longer there');
  return piece;
}

export async function updatePiece(padId: string, seq: number, patch: { text?: string; deleted?: boolean; audio_ms?: number }): Promise<TamilPadPiece> {
  return must(
    await db()
      .from('tamil_pad_pieces')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('pad_id', padId)
      .eq('seq', seq)
      .select('seq, text, deleted, updated_at')
      .single(),
  ) as TamilPadPiece;
}

/** Joins the text of a recording's next 28 s piece to what it said so far. */
export function joinText(before: string, added: string) {
  if (!added) return before;
  if (!before) return added;
  return /\s$/.test(before) ? before + added : `${before} ${added}`;
}
