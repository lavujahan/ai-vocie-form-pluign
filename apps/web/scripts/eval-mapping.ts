/**
 * Runs the Field Mapping Agent against the Tamil / English / Tanglish fixtures with the real API.
 *   pnpm eval:mapping            (needs SARVAM_API_KEY in apps/web/.env.local)
 * Not part of CI: it costs tokens and model output varies.
 */
import { normalizeText } from '@vff/shared';
import { mapTranscript } from '../lib/agents/fieldMapper';
import { EVAL_CASES, EVAL_FORM } from './eval-fixtures';

if (!process.env.SARVAM_API_KEY) {
  console.error('SARVAM_API_KEY is not set');
  process.exit(1);
}

const same = (a: string, b: string) => normalizeText(a) === normalizeText(b) || a.trim() === b.trim();

let checks = 0;
let passed = 0;
const failures: string[] = [];

for (const [i, c] of EVAL_CASES.entries()) {
  const outcome = await mapTranscript({
    fields: EVAL_FORM,
    current: c.current ?? {},
    transcript: c.speech,
    targetFieldKey: c.target ?? null,
  });
  const got = new Map(outcome.empty ? [] : outcome.values.map((v) => [v.field_key, v.value ?? '']));
  const lines: string[] = [];
  for (const [key, want] of Object.entries(c.expect)) {
    checks++;
    const have = got.get(key);
    const ok = want === null ? have === undefined : have !== undefined && same(have, want);
    if (ok) passed++;
    else lines.push(`    ${key}: expected ${want === null ? '(absent)' : JSON.stringify(want)}, got ${have === undefined ? '(absent)' : JSON.stringify(have)}`);
  }
  const mark = lines.length ? '✗' : '✓';
  console.log(`${mark} #${i + 1} ${c.speech}`);
  if (lines.length) {
    console.log(lines.join('\n'));
    failures.push(`#${i + 1}`);
  }
}

console.log(`\nField accuracy: ${passed}/${checks} (${((passed / checks) * 100).toFixed(1)}%)`);
if (failures.length) console.log(`Cases with misses: ${failures.join(', ')}`);
