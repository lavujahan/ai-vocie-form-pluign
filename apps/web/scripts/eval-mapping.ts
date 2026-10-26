/**
 * Runs the Field Mapping Agent against the Tamil / English / Tanglish fixtures with the real API.
 *   pnpm eval:mapping                       (needs OPENAI_API_KEY in apps/web/.env.local)
 *   pnpm eval:mapping --only can,corrections   (tags: english tanglish tamil field can corrections commands)
 *   pnpm eval:mapping --model gpt-4o           (compare models; default: the app's model)
 *   pnpm eval:mapping --validate               (with the model's validate_value round trips, off in the app)
 * Prints per-field accuracy, per tag, and saves a JSON report in apps/web/eval-results/.
 * Not part of CI: it costs tokens and model output varies.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { normalizeText } from '@vff/shared';
import { mapTranscript } from '../lib/agents/fieldMapper';
import { DEFAULT_AGENT_MODEL } from '../lib/agents/usage';
import { CAN_FORM, EVAL_CASES, EVAL_FORM, type EvalTag } from './eval-fixtures';

if (!process.env.OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY is not set');
  process.exit(1);
}

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const only = arg('only')?.split(',').map((s) => s.trim()) as EvalTag[] | undefined;
const model = arg('model') ?? (process.env.MAPPER_MODEL || process.env.AGENT_MODEL || DEFAULT_AGENT_MODEL);
const validateTool = process.argv.includes('--validate');

const same = (a: string, b: string) => normalizeText(a) === normalizeText(b) || a.trim() === b.trim();

type Miss = { field: string; expected: string; got: string };
const results: { n: number; speech: string; tags: EvalTag[]; checks: number; passed: number; misses: Miss[]; ms: number }[] = [];

const cases = EVAL_CASES.map((c, i) => ({ ...c, n: i + 1 })).filter((c) => !only || c.tags.some((t) => only.includes(t)));
console.log(`Model ${model}${validateTool ? ' · with validate_value' : ''} · ${cases.length} cases${only ? ` (${only.join(', ')})` : ''}\n`);

for (const c of cases) {
  const t0 = Date.now();
  const outcome = await mapTranscript(
    {
      fields: c.form === 'can' ? CAN_FORM : EVAL_FORM,
      current: c.current ?? {},
      transcript: c.speech,
      targetFieldKey: c.target ?? null,
      recent: c.recent,
    },
    { model, validateTool },
  );
  const got = new Map(outcome.empty ? [] : outcome.values.map((v) => [v.field_key, v.value ?? '']));
  const misses: Miss[] = [];
  let checks = 0;
  for (const [key, want] of Object.entries(c.expect)) {
    checks++;
    const have = got.get(key);
    const ok = want === null ? have === undefined : have !== undefined && (Array.isArray(want) ? want : [want]).some((w) => same(have, w));
    if (!ok) {
      misses.push({
        field: key,
        expected: want === null ? '(absent)' : Array.isArray(want) ? want.join(' / ') : want,
        got: have === undefined ? '(absent)' : JSON.stringify(have),
      });
    }
  }
  if (c.command !== undefined) {
    checks++;
    const have = outcome.empty ? null : outcome.command;
    if (have !== c.command) misses.push({ field: 'command', expected: String(c.command), got: String(have) });
  }
  const ms = Date.now() - t0;
  results.push({ n: c.n, speech: c.speech, tags: c.tags, checks, passed: checks - misses.length, misses, ms });
  console.log(`${misses.length ? '✗' : '✓'} #${c.n} [${c.tags.join(',')}] ${c.speech}  (${(ms / 1000).toFixed(1)}s)`);
  for (const m of misses) console.log(`    ${m.field}: expected ${m.expected}, got ${m.got}`);
}

const pct = (p: number, n: number) => (n ? `${((p / n) * 100).toFixed(1)}%` : '-');
const sum = (rs: typeof results) => rs.reduce((a, r) => ({ checks: a.checks + r.checks, passed: a.passed + r.passed }), { checks: 0, passed: 0 });

const total = sum(results);
const byTag = Object.fromEntries(
  [...new Set(results.flatMap((r) => r.tags))].map((tag) => {
    const s = sum(results.filter((r) => r.tags.includes(tag)));
    return [tag, { ...s, accuracy: pct(s.passed, s.checks) }];
  }),
);

console.log(`\nField accuracy: ${total.passed}/${total.checks} (${pct(total.passed, total.checks)})`);
for (const [tag, s] of Object.entries(byTag)) console.log(`  ${tag.padEnd(12)} ${s.passed}/${s.checks} (${s.accuracy})`);
const failed = results.filter((r) => r.misses.length).map((r) => `#${r.n}`);
if (failed.length) console.log(`Cases with misses: ${failed.join(', ')}`);

// Saved for comparing runs (prompt changes, models).
const dir = new URL('../eval-results/', import.meta.url);
mkdirSync(dir, { recursive: true });
const file = new URL(`${new Date().toISOString().replace(/[:.]/g, '-')}.json`, dir);
writeFileSync(
  file,
  JSON.stringify({ at: new Date().toISOString(), model, only: only ?? null, total: { ...total, accuracy: pct(total.passed, total.checks) }, byTag, results }, null, 2),
);
console.log(`\nReport: ${file.pathname}`);
