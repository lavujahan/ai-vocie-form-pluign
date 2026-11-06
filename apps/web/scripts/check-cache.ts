/**
 * Checks OpenAI prompt caching for the Field Mapping Agent on a real form: maps three sentences in a row
 * and prints each call's input tokens and how many were cached. From the second call on, the prompt's
 * start (instructions + the form's fields) should be cached, and only the speech part billed in full.
 *   pnpm check:cache                     (the latest session that has fields)
 *   pnpm check:cache --session <uuid>
 *   pnpm check:cache --key all           (the cache key to send: "form" = one per form, default; or any text)
 *   pnpm check:cache --drop current      (leave the current values out, to find what breaks the cache)
 *   pnpm check:cache --wait 60           (seconds between calls, like a person between recordings)
 * Costs about ₹0.5 (needs OPENAI_API_KEY and the Supabase keys in apps/web/.env.local). Reads the
 * database only.
 */
import { createClient } from '@supabase/supabase-js';
import { fieldsHash, mapTranscript, type MapInput } from '../lib/agents/fieldMapper';
import type { AgentField } from '../lib/agents/tools';
import { cachedTokens } from '../lib/usage/events';

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};

const db = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

async function main() {
  let sessionId = arg('session');
  if (!sessionId) {
    const { data } = await db.from('form_fields').select('session_id, created_at').order('created_at', { ascending: false }).limit(1).maybeSingle();
    sessionId = (data as { session_id: string } | null)?.session_id;
  }
  if (!sessionId) throw new Error('No session with fields found. Scan a form first, or pass --session.');
  const { data: rows, error } = await db.from('form_fields').select('*').eq('session_id', sessionId).order('position');
  if (error) throw error;
  const fields = rows as AgentField[];
  const hash = fieldsHash(fields);
  const keyArg = arg('key') ?? 'form';
  const cacheKey = keyArg === 'form' ? `form:${hash}` : keyArg;
  const drop = new Set((arg('drop') ?? '').split(',').filter(Boolean));
  const waitSec = Number(arg('wait') ?? 0);
  console.log(`session ${sessionId} · ${fields.length} fields · fields hash ${hash} · cache key "mapper:${cacheKey}"`);

  const sentences = ['Name Ramesh Kumar', 'mobile number 98765 43210', 'district Salem'];
  const current: Record<string, string | null> = {};
  for (const [i, transcript] of sentences.entries()) {
    if (i && waitSec) await new Promise((r) => setTimeout(r, waitSec * 1000));
    const input: MapInput = {
      fields,
      current: drop.has('current') ? {} : { ...current },
      transcript,
      targetFieldKey: null,
      recent: [],
      hidden: [],
    };
    const t0 = Date.now();
    let line = '';
    const out = await mapTranscript(input, {
      cacheKey,
      onUsage: ({ usage }) => {
        const cached = cachedTokens(usage);
        const pct = usage.inputTokens ? Math.round((100 * cached) / usage.inputTokens) : 0;
        line = `in ${usage.inputTokens} · cached ${cached} (${pct}%) · out ${usage.outputTokens}`;
      },
    });
    if (!out.empty) for (const v of out.values) current[v.field_key] = v.value;
    console.log(`call ${i + 1}: "${transcript}" → ${line} · ${Date.now() - t0} ms`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
