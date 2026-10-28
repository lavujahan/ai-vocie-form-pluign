/**
 * Reads the saved forms with the old Form Analyzer (before the short answer, scripts/eval-analyzer-old.ts)
 * and with today's, on exactly the same input, to check that the change keeps the reading's quality.
 *   pnpm eval:analyzer                  (needs OPENAI_API_KEY and Supabase in apps/web/.env.local)
 *   pnpm eval:analyzer --limit 5        (at most 5 forms, most used first; default 10)
 *   pnpm eval:analyzer --model gpt-4o   (another model; default: the app's)
 *   pnpm eval:analyzer --self           (old against old: how much two runs differ anyway)
 * The input is the field list saved with a reading (migration 0018); a form saved before it is read from its
 * snapshot, without dropdown options (those fields are marked *). The page text is not saved, so both
 * readings lack it (required marks and formats stated only there can't be read by either).
 * Prints the tokens and cost of both, and every field that reads differently. Reads only: nothing is saved.
 * Not part of CI: it costs tokens (both readings).
 */
import { createClient } from '@supabase/supabase-js';
import { FormSchema, type FieldAnalysis, type FieldDescriptor, type FormAnalysis } from '@vff/shared';
import { analyzeForm, sanitizeAnalysis } from '../lib/agents/formAnalyzer';
import { openaiEvent, type UsageEvent } from '../lib/usage/events';
import { analyzeFormOld } from './eval-analyzer-old';

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!process.env.OPENAI_API_KEY || !url || !service) {
  console.error('Set OPENAI_API_KEY, SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in apps/web/.env.local');
  process.exit(1);
}
// Not lib/supabase-admin: that one only loads inside the Next.js server.
const db = createClient(url, service, { auth: { persistSession: false } });

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const limit = Number(arg('limit') ?? 10);
const model = arg('model');
const self = process.argv.includes('--self');
if (self) console.log('Old against old: the differences are what two runs of the same reader give anyway.');
/** ₹ per $ for the report (the admin page uses its own rate). */
const INR_PER_USD = 88;

type Snapshot = { field_key: string; label: string; field_type: FieldDescriptor['field_type']; required: boolean; options: number };
type Row = { form_name: string; page_url: string; template: FieldDescriptor[] | null; fields: Snapshot[] };

const { data, error } = await db
  .from('form_cache')
  .select('form_name, page_url, template, fields')
  .order('uses', { ascending: false })
  .limit(limit);
if (error) {
  console.error(error.code === '42703' ? 'Apply migration 0018_form_template.sql first.' : error.message);
  process.exit(1);
}
const rows = (data ?? []) as Row[];
if (!rows.length) console.log('No saved forms.');

/** A reading saved before field lists were kept has only a snapshot: its dropdowns are read without options. */
const fieldsOf = (row: Row) =>
  row.template ?? row.fields.map((f) => ({ field_key: f.field_key, label: f.label, field_type: f.field_type, required: f.required }));
const noOptions = (row: Row) => new Set(row.template ? [] : row.fields.filter((f) => f.options > 0).map((f) => f.field_key));

/** The properties compared per field, as the phone and the mapper use them. */
const COMPARED = ['clean_label', 'semantic_type', 'required', 'depends_on', 'label_ta', 'output_script', 'step_index'] as const;
const show = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v));
const hasFormat = (f: FieldAnalysis) => !!(f.validation?.regex || f.validation?.format || f.validation?.min_length || f.validation?.max_length);

type Read = { reading: FormAnalysis; usage: UsageEvent[]; ms: number };
async function read(fn: typeof analyzeForm, schema: FormSchema): Promise<Read> {
  const usage: UsageEvent[] = [];
  const t0 = Date.now();
  const reading = await fn(schema, { model, onUsage: (run) => usage.push(openaiEvent({ user_id: null, session_id: null }, 'analyze', run)) });
  return { reading, usage, ms: Date.now() - t0 };
}
const sum = (r: Read, k: 'output_tokens' | 'input_tokens' | 'cost_usd') => r.usage.reduce((a, e) => a + (e[k] ?? 0), 0);

const totals = { oldUsd: 0, newUsd: 0, oldOut: 0, newOut: 0, fields: 0, same: 0, missingOld: 0, missingNew: 0 };
/** Per property: how many fields the new reading reads differently. */
const changed = new Map<string, number>();

for (const row of rows) {
  const schema = FormSchema.parse({ page_url: row.page_url, page_title: row.form_name, html_snippet: '', fields: fieldsOf(row) });
  const unseen = noOptions(row);
  const [o, n] = await Promise.all([read(analyzeFormOld, schema), read(self ? analyzeFormOld : analyzeForm, schema)]);
  const before = new Map(sanitizeAnalysis(o.reading, schema).map((f) => [f.field_key, f]));
  const after = new Map(sanitizeAnalysis(n.reading, schema).map((f) => [f.field_key, f]));

  totals.oldUsd += sum(o, 'cost_usd');
  totals.newUsd += sum(n, 'cost_usd');
  totals.oldOut += sum(o, 'output_tokens');
  totals.newOut += sum(n, 'output_tokens');
  const per = (r: Read) => Math.round(sum(r, 'output_tokens') / schema.fields.length);
  console.log(
    `\n${row.form_name} · ${schema.fields.length} fields${unseen.size ? ` · ${unseen.size} dropdowns without options (*)` : ''}\n` +
      `  old: ${sum(o, 'input_tokens')} in / ${sum(o, 'output_tokens')} out (${per(o)} per field) · ₹${(sum(o, 'cost_usd') * INR_PER_USD).toFixed(2)} · ${o.ms} ms\n` +
      `  new: ${sum(n, 'input_tokens')} in / ${sum(n, 'output_tokens')} out (${per(n)} per field) · ₹${(sum(n, 'cost_usd') * INR_PER_USD).toFixed(2)} · ${n.ms} ms` +
      (n.usage.length > 1 ? ` · ${n.usage.length} calls (left-out fields read again)` : ''),
  );

  for (const f of schema.fields) {
    const a = before.get(f.field_key);
    const b = after.get(f.field_key);
    totals.fields++;
    if (!a || !b) {
      if (!a) totals.missingOld++;
      if (!b) totals.missingNew++;
      console.log(`  ${f.field_key}: missing in the ${!a && !b ? 'old and new' : !b ? 'new' : 'old'} reading`);
      continue;
    }
    const diffs: [string, string][] = COMPARED.filter((k) => show(a[k]) !== show(b[k])).map((k) => [k, `${k} ${show(a[k])} → ${show(b[k])}`]);
    if (f.field_type === 'file' && !!a.file_rules !== !!b.file_rules) diffs.push(['file_rules', `file_rules ${a.file_rules ? 'set' : '—'} → ${b.file_rules ? 'set' : '—'}`]);
    if (hasFormat(a) !== hasFormat(b)) diffs.push(['format', `format ${show(a.validation?.format)} → ${show(b.validation?.format)}`]);
    for (const [k] of diffs) changed.set(k, (changed.get(k) ?? 0) + 1);
    // A Tamil-only label: is its value written in Tamil, and is its label told apart from its English twin?
    if (/[஀-௿]/.test(f.label) && !/[A-Za-z]/.test(f.label)) {
      console.log(`  ta ${f.field_key}: old ${a.output_script} "${a.clean_label}" · new ${b.output_script} "${b.clean_label}"`);
    }
    if (diffs.length) console.log(`  ${unseen.has(f.field_key) ? '* ' : ''}${f.field_key} (${f.label.slice(0, 60)}): ${diffs.map(([, d]) => d).join(' · ')}`);
    else totals.same++;
  }
}

if (rows.length) {
  console.log(
    `\n${rows.length} forms · ${totals.same}/${totals.fields} fields read the same · missing: old ${totals.missingOld}, new ${totals.missingNew}` +
      `\noutput tokens ${totals.oldOut} → ${totals.newOut} (${Math.round((100 * (totals.newOut - totals.oldOut)) / Math.max(totals.oldOut, 1))}%)` +
      ` · cost ₹${(totals.oldUsd * INR_PER_USD).toFixed(2)} → ₹${(totals.newUsd * INR_PER_USD).toFixed(2)}` +
      `\nfields that differ, per property: ${[...changed].map(([k, v]) => `${k} ${v}`).join(' · ') || 'none'}`,
  );
}
