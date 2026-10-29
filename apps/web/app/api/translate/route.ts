import { after, NextResponse } from 'next/server';
import { TranslateRequest, type TranslateResponse } from '@vff/shared';
import { translateToTamil } from '@/lib/agents/translator';
import { requirePhone } from '@/lib/auth';
import { assertCanUse } from '@/lib/billing/plans';
import { fail, route } from '@/lib/http';
import { assertPhoneOf, getSessionById } from '@/lib/sessions';
import { openaiEvent, type UsageEvent } from '@/lib/usage/events';
import { recordUsage } from '@/lib/usage/record';

export const runtime = 'nodejs';
export const maxDuration = 30;

/** Translations a phone may ask for in a short while (the helper asks as the user types, after a pause). */
const LIMIT = 60;
const WINDOW_MS = 5 * 60_000;
const recent = new Map<string, number[]>();

function assertNotTooMany(sessionId: string) {
  const now = Date.now();
  const times = (recent.get(sessionId) ?? []).filter((t) => now - t < WINDOW_MS);
  if (times.length >= LIMIT) throw fail(429, 'Too many translations at once. Wait a minute and try again.');
  times.push(now);
  recent.set(sessionId, times);
}

/**
 * Phone → OpenAI Tamil Translator: the Tamil helper on the phone page (English form text into Tamil,
 * for the operator to read out or copy). Needs an active plan, like speaking; no voice minutes are used.
 */
export const POST = route(async (req) => {
  const claims = await requirePhone(req);
  const session = await getSessionById(claims.session_id);
  assertPhoneOf(claims, session);
  const { text } = TranslateRequest.parse(await req.json());
  // Translating uses no voice minutes: only an ended plan stops it.
  await assertCanUse(session.user_id, undefined, { minutes: false });
  assertNotTooMany(session.id);

  const usage: UsageEvent[] = [];
  after(() => recordUsage(usage));
  const owner = { user_id: session.user_id, session_id: session.id };
  const t0 = Date.now();
  const tamil = await translateToTamil(text, { onUsage: (run) => usage.push(openaiEvent(owner, 'translate', run)) });
  console.log(`translate chars=${text.length} cached=${usage.length === 0} ${Date.now() - t0}ms`);
  if (!tamil) throw fail(502, "Couldn't translate. Try again.");
  return NextResponse.json({ tamil } satisfies TranslateResponse);
});
