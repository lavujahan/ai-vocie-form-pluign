import { Agent, run, setTracingDisabled, type Model } from '@openai/agents';
import {
  AnalyzerAnswer,
  sanitizeFileRules,
  type FieldAnalysis,
  type FieldDescriptor,
  type FormAnalysis,
  type FormSchema,
  type ValidationRules,
} from '@vff/shared';
import {
  fieldSnapshot,
  formFingerprint,
  emptiedByTemplate,
  formTemplate,
  isFresh,
  isMissingTable,
  pageOf,
  promptVersion,
  type CachedReading,
} from './formCache';
import { analyzerTools } from './tools';
import { agentModel, modelName, runWithUsage, type OnUsage } from './usage';
import { openaiEvent, type UsageEvent } from '../usage/events';

setTracingDisabled(process.env.NODE_ENV === 'production');

export const ANALYZER_INSTRUCTIONS = `You analyze a web form detected on a page so that another agent can fill it from speech.

For the form:
- form_purpose: a short sentence-case name for what the form is, e.g. "Customer onboarding", "GST registration". Max 5 words.

Fields are listed by id (f1, f2, …); answer with these ids, exactly as listed. The site's key ("key: …", when it has words) is only a hint for an unclear label.

For every field in the input (include every field once):
- clean_label: a short human label in sentence case ("Full name", "Mobile number"). Remove asterisks and "(required)".
- semantic_type: the closest type from the allowed list. Use "choice" for option fields without a better type, "boolean" for a single yes/no checkbox, "free_text" for remarks/descriptions.
- required: true if the field is marked required, has an asterisk, or the text says it is mandatory.
- validation: only for a format or length the page states in its text (help text, "nearby", the form text): regex (JavaScript, without ^$ anchors), min/max length, and a human-readable format hint (e.g. "10 digits", "DD/MM/YYYY"). The input's own maxlength, minlength, pattern and title are applied by code: don't repeat them. null otherwise — never guess.
- depends_on: the id of a parent field this one depends on (e.g. state → country), otherwise null.
- label_ta: the label in simple, common Tamil for someone reading it on a phone ("Father's name" → "தந்தை பெயர்", "Mobile number" → "கைபேசி எண்", "Date of birth" → "பிறந்த தேதி", "Taluk" → "வட்டம்"). Tamil script only; keep it short; use the English word in Tamil letters when that is what people say ("ஆதார் எண்"). Keep whose or what it is: "Owner's mobile number" → "உரிமையாளரின் கைபேசி எண்" (not just "கைபேசி எண்"), "Bull's age" → "காளையின் வயது".
- A field labelled only in Tamil next to the same field in English ("Applicant Name" and "விண்ணப்பதாரர் பெயர்") takes the value in Tamil: its clean_label ends with "in Tamil" ("Applicant name in Tamil") and its id goes in tamil_fields.

For the whole form:
- tamil_fields: the ids of fields whose value is written in Tamil: the label asks for it ("Name in Tamil", "தமிழில் பெயர்", "Name in regional language"), or a Tamil-only label next to its English twin. Usually empty.
- step_starts: only if the form is clearly split into steps or sections filled one after another: the id of the first field of each step after the first. Usually empty.
- uploads: one entry per upload field (type file), with its id as field_key. Read the rules from the accept attribute and the text near the field or anywhere on the page ("Photo: JPG, below 50 KB, 3.5 x 4.5 cm", "Upload community certificate in PDF, max 1 MB"):
  kind = photo (a person's photo), signature, or document (certificates, ID cards, any scan);
  formats = the allowed file types (jpg / png / pdf), empty if not stated;
  max_kb / min_kb = stated size limits in KB (1 MB = 1024 KB), null if not stated; never guess a size;
  max_pages = for PDFs, if stated; width_px / height_px = only if stated in pixels;
  shape = the photo size if the page states one, width then height, with its unit: "3.5 x 4.5 cm" → {w:3.5,h:4.5,unit:"cm"}, "35mm x 45mm" → mm, "2 x 2 inch" → in, "200 x 230 pixels" → px (also fill width_px/height_px). null when no size is written; never assume one, not even for "passport size" alone;
  note = any other stated requirement, short ("white background", "self-attested").

Use get_field_context when a field's label is unclear.`;

/** f1, f2, … in form order: the answer names fields by these instead of the site's long keys. */
const shortId = (i: number) => `f${i + 1}`;

/** Words in a site key that say nothing about the field ("radio-group-1790…", "txt", "ddl"). */
const GENERIC_KEY_WORDS = new Set(['txt', 'text', 'ddl', 'drp', 'cmb', 'select', 'input', 'number', 'radio', 'group', 'checkbox', 'check', 'file', 'date', 'textarea', 'field', 'form', 'path', 'div', 'span', 'item', 'ctl', 'value']);

/**
 * True when a site key carries words ("txtFatherName", "ddl_village"), so it can help with an unclear
 * label; "12330" or "radio-group-1790337220827-0" only cost tokens (and invite a lookup).
 */
export function keyHasWords(key: string): boolean {
  const words = key.replace(/([a-z])([A-Z])/g, '$1 $2').split(/[^A-Za-z]+/).map((w) => w.toLowerCase());
  return words.some((w) => w.length >= 3 && !GENERIC_KEY_WORDS.has(w));
}

function describeSchema(schema: FormSchema): string {
  const fields = schema.fields.map((f, i) => {
    const parts = [shortId(i), ...(keyHasWords(f.field_key) ? [`key: ${f.field_key}`] : []), `label: ${JSON.stringify(f.label)}`, `type: ${f.field_type}`];
    if (f.required) parts.push('required');
    if (f.options.length) parts.push(`options: ${f.options.slice(0, 15).map((o) => o.label).join(' | ')}${f.options.length > 15 ? ' …' : ''}`);
    if (f.placeholder) parts.push(`placeholder: ${JSON.stringify(f.placeholder)}`);
    if (f.pattern) parts.push(`pattern: ${f.pattern}`);
    if (f.min || f.max) parts.push(`min/max: ${f.min ?? ''}/${f.max ?? ''}`);
    if (f.min_length != null || f.max_length != null) parts.push(`minlength/maxlength: ${f.min_length ?? ''}/${f.max_length ?? ''}`);
    if (f.inputmode) parts.push(`inputmode: ${f.inputmode}`);
    if (f.title) parts.push(`title: ${JSON.stringify(f.title)}`);
    if (f.group_key) parts.push(`group: ${f.group_key}`);
    if (f.accept) parts.push(`accept: ${f.accept}`);
    if (f.context) parts.push(`nearby: ${JSON.stringify(f.context.slice(0, f.field_type === 'file' ? 400 : 200))}`);
    return `- ${parts.join(' · ')}`;
  });
  return [
    `Page title: ${schema.page_title}`,
    `URL: ${schema.page_url}`,
    schema.form_title ? `Form heading: ${schema.form_title}` : '',
    `Fields:\n${fields.join('\n')}`,
    schema.html_snippet ? `Form text (trimmed):\n${schema.html_snippet.slice(0, 6000)}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

type AnalyzeOpts = { model?: Model | string; onUsage?: OnUsage };

/**
 * Reads the form. The answer must cover every field: fields it left out (seen with a long form) are read
 * again on their own, once, so no field is left without its clean and Tamil labels. They take the step of
 * the field before them.
 */
export async function analyzeForm(schema: FormSchema, opts: AnalyzeOpts = {}): Promise<FormAnalysis> {
  const reading = await readOnce(schema, opts);
  const known = new Set(schema.fields.map((f) => f.field_key));
  const answered = new Set(reading.fields.map((f) => f.field_key).filter((k) => known.has(k)));
  const missing = schema.fields.filter((f) => !answered.has(f.field_key));
  if (!missing.length) return reading;

  console.warn(`form analyzer left out ${missing.length} of ${schema.fields.length} fields; reading them again`);
  const more = await readOnce({ ...schema, fields: missing }, opts).catch((e) => {
    console.warn('second form reading failed', e);
    return null;
  });
  if (!more) return reading;
  const stepOf = new Map(reading.fields.map((f) => [f.field_key, f.step_index]));
  let step = 0;
  for (const f of schema.fields) {
    if (stepOf.has(f.field_key)) step = stepOf.get(f.field_key)!;
    else stepOf.set(f.field_key, step);
  }
  return { ...reading, fields: [...reading.fields, ...more.fields.map((f) => ({ ...f, step_index: stepOf.get(f.field_key) ?? 0 }))] };
}

async function readOnce(schema: FormSchema, opts: AnalyzeOpts): Promise<FormAnalysis> {
  const { model, modelSettings, timeoutMs } = agentModel('analyzer', opts.model);
  const agent = new Agent({
    name: 'Form Analyzer Agent',
    instructions: ANALYZER_INSTRUCTIONS,
    model,
    modelSettings,
    outputType: AnalyzerAnswer,
    tools: analyzerTools(schema.fields.map((f, i) => ({ ...f, field_key: shortId(i) }))),
  });
  const result = await runWithUsage(opts.onUsage, modelName(model), () => run(agent, describeSchema(schema), { maxTurns: 6, signal: AbortSignal.timeout(timeoutMs) }));
  if (!result.finalOutput) throw new Error('Form analyzer returned no output');
  return readingFromAnswer(result.finalOutput, schema);
}

/**
 * The saved reading from the AI's short answer: the site's keys back in place of f1, f2, …, and per field
 * what the answer lists once for the form: Tamil output (tamil_fields), the step (step_starts, counted in
 * form order) and the upload rules (uploads).
 */
export function readingFromAnswer(answer: AnalyzerAnswer, schema: FormSchema): FormAnalysis {
  const keyOf = new Map(schema.fields.map((f, i) => [shortId(i), f.field_key]));
  // An id the form doesn't have stays as it is, and sanitizeAnalysis drops it.
  const site = (id: string) => keyOf.get(id) ?? id;
  const tamil = new Set(answer.tamil_fields.map(site));
  const starts = new Set(answer.step_starts.map(site));
  const uploads = new Map(answer.uploads.map(({ field_key, ...rules }) => [site(field_key), rules]));
  const stepOf = new Map<string, number>();
  let step = 0;
  for (const f of schema.fields) {
    if (starts.has(f.field_key) && stepOf.size) step++;
    stepOf.set(f.field_key, step);
  }
  return {
    form_purpose: answer.form_purpose,
    fields: answer.fields.map((f) => {
      const key = site(f.field_key);
      return {
        ...f,
        field_key: key,
        depends_on: f.depends_on ? site(f.depends_on) : null,
        step_index: stepOf.get(key) ?? 0,
        output_script: tamil.has(key) ? 'ta' : 'en',
        file_rules: uploads.get(key) ?? null,
      };
    }),
  };
}

function regexOk(src: string | null): string | null {
  if (!src) return null;
  try {
    new RegExp(src, 'u');
    return src;
  } catch {
    return null;
  }
}

/** A short Tamil label, or null: Tamil script required, Latin letters and odd symbols dropped, at most 60 characters. */
export function cleanTamilLabel(s: string | null | undefined): string | null {
  const t = (s ?? '')
    .replace(/[^஀-௿0-9\s()/.,-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
    .trim();
  return /[஀-௿]/.test(t) ? t : null;
}

/**
 * Rules the input itself states, set by code (the AI adds only what is written in the page's text):
 * minlength / maxlength, and a format hint: the title, which explains a pattern, or "N digits" for a
 * number of fixed length. The pattern is checked as it is (validateValue reads the field's own pattern).
 */
export function pageRules(f: FieldDescriptor): ValidationRules | null {
  const digits =
    f.inputmode === 'numeric' || f.inputmode === 'tel' || f.field_type === 'tel' || f.field_type === 'number' || /^\^?(\[[0-9-]+\]|\\d)/.test(f.pattern ?? '');
  const fixed = f.max_length != null && f.min_length === f.max_length;
  const format = (f.pattern && f.title ? f.title.slice(0, 80) : null) ?? (digits && fixed ? `${f.max_length} digits` : null);
  if (f.min_length == null && f.max_length == null && !format) return null;
  return { regex: null, min_length: f.min_length, max_length: f.max_length, format };
}

/** The page's own rules win over the AI's for the same property; the AI's fill in the rest. */
function withPageRules(ai: ValidationRules | null, page: ValidationRules | null): ValidationRules | null {
  if (!page) return ai;
  return {
    regex: ai?.regex ?? null,
    min_length: page.min_length ?? ai?.min_length ?? null,
    max_length: page.max_length ?? ai?.max_length ?? null,
    format: page.format ?? ai?.format ?? null,
  };
}

const TAMIL_SCRIPT = /[஀-௿]/;
const LATIN = /[A-Za-z]/;

/**
 * Keeps only known fields, drops broken regexes and dangling depends_on links, and adds the input's own
 * rules (pageRules). A field labelled only in Tamil whose clean label matches an English-labelled field
 * is that field's Tamil twin ("Applicant Name" / "விண்ணப்பதாரர் பெயர்"): its value is written in Tamil
 * and its label says so, also when the AI missed it, so the two never look like the same field.
 */
export function sanitizeAnalysis(analysis: FormAnalysis, schema: FormSchema): FieldAnalysis[] {
  const keys = new Set(schema.fields.map((f) => f.field_key));
  const byKey = new Map(schema.fields.map((f) => [f.field_key, f]));
  const seen = new Set<string>();
  const out: FieldAnalysis[] = [];
  for (const f of analysis.fields) {
    if (!keys.has(f.field_key) || seen.has(f.field_key)) continue;
    seen.add(f.field_key);
    const ai = f.validation ? { ...f.validation, regex: regexOk(f.validation.regex) } : null;
    out.push({
      ...f,
      clean_label: f.clean_label.trim().slice(0, 200),
      label_ta: cleanTamilLabel(f.label_ta) ?? '',
      // Upload rules only for upload fields; the accept attribute wins over what was read from the text.
      file_rules: byKey.get(f.field_key)?.field_type === 'file' ? sanitizeFileRules(f.file_rules, byKey.get(f.field_key)?.accept) : null,
      depends_on: f.depends_on && keys.has(f.depends_on) && f.depends_on !== f.field_key ? f.depends_on : null,
      validation: withPageRules(ai, pageRules(byKey.get(f.field_key)!)),
    });
  }

  const siteLabel = (f: FieldAnalysis) => byKey.get(f.field_key)?.label ?? '';
  const same = (a: FieldAnalysis, b: FieldAnalysis) => a.clean_label.toLowerCase().replace(/ in tamil$/, '') === b.clean_label.toLowerCase();
  for (const f of out) {
    const label = siteLabel(f);
    if (!TAMIL_SCRIPT.test(label) || LATIN.test(label)) continue;
    if (!out.some((o) => o !== f && LATIN.test(siteLabel(o)) && same(f, o))) continue;
    f.output_script = 'ta';
    if (!/tamil/i.test(f.clean_label)) f.clean_label = `${f.clean_label} in Tamil`;
  }
  return out;
}

/** The analyzer's model as saved with a reading: "gpt-5.4-mini@low". */
export function analyzerModelSpec(): string {
  const { model, modelSettings } = agentModel('analyzer');
  const effort = modelSettings.reasoning?.effort;
  return typeof model === 'string' ? `${model}${effort ? `@${effort}` : ''}` : 'custom';
}

/** A fresh shared reading of a form (or of a wizard step), with the form's saved field list. */
export type SavedForm = { analysis: FormAnalysis; template: FieldDescriptor[] | null };

/** No `template` column yet (migration 0018 not applied). */
const isMissingColumn = (code: string | undefined) => code === '42703' || code === 'PGRST204';

/**
 * The shared saved reading of this form when it is fresh, else null (no table yet, too old, other
 * instructions). A reading saved before field lists were kept gets this scan's list now, so the form's
 * next sessions all get the same fields. Counts a use.
 */
export async function savedReading(schema: FormSchema): Promise<SavedForm | null> {
  const { db } = await import('../supabase-admin');
  const fingerprint = formFingerprint(schema);
  const cols = 'fingerprint, analysis, model, prompt_version, created_at, edited_at';
  let res = await db().from('form_cache').select(`${cols}, template`).eq('fingerprint', fingerprint).maybeSingle();
  const noTemplate = isMissingColumn(res.error?.code);
  if (noTemplate) res = await db().from('form_cache').select(cols).eq('fingerprint', fingerprint).maybeSingle();
  if (res.error) {
    if (!isMissingTable(res.error.code)) console.warn('form cache lookup failed', res.error);
    return null;
  }
  const saved = res.data as CachedReading | null;
  if (!saved || !isFresh(saved, { promptVersion: promptVersion(ANALYZER_INSTRUCTIONS) })) return null;

  const hit = await db().rpc('form_cache_hit', { p_fingerprint: fingerprint });
  if (hit.error) console.warn('form cache hit not counted', hit.error);
  let template = saved.template ?? null;
  if (!template && !noTemplate) {
    template = formTemplate(schema.fields, saved.analysis.fields);
    const upd = await db().from('form_cache').update({ template }).eq('fingerprint', fingerprint);
    if (upd.error) console.warn('form field list not saved', upd.error);
  }
  return { analysis: saved.analysis, template };
}

/**
 * The form's reading: the shared saved one when it is fresh (no AI call, nothing billed), else a new
 * one from the AI, saved with the form's field list for the next scan of this form by anyone.
 * `saved`: the route already looked it up (null: there is none).
 */
async function readForm(
  schema: FormSchema,
  partial: boolean,
  onUsage: OnUsage,
  usage: UsageEvent[],
  saved?: SavedForm | null,
): Promise<FormAnalysis> {
  const { db } = await import('../supabase-admin');
  const found = saved === undefined ? await savedReading(schema) : saved;
  if (found) return found.analysis;

  const analysis = await analyzeForm(schema, { onUsage });
  const reading = { form_purpose: analysis.form_purpose, fields: sanitizeAnalysis(analysis, schema) };
  const row = {
    fingerprint: formFingerprint(schema),
    form_name: (analysis.form_purpose.trim() || schema.form_title || schema.page_title || pageOf(schema.page_url)).slice(0, 120),
    page_url: pageOf(schema.page_url),
    field_count: schema.fields.length,
    partial,
    fields: fieldSnapshot(schema),
    analysis: reading,
    model: analyzerModelSpec(),
    prompt_version: promptVersion(ANALYZER_INSTRUCTIONS),
    cost_usd: usage.reduce((a, e) => a + (e.cost_usd ?? 0), 0),
    uses: 0,
    last_used_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    edited_at: null,
    edited_by: null,
  };
  const upsert = (r: Record<string, unknown>) => db().from('form_cache').upsert(r, { onConflict: 'fingerprint' });
  let res = await upsert({ ...row, template: formTemplate(schema.fields, reading.fields) });
  if (isMissingColumn(res.error?.code)) res = await upsert(row);
  if (res.error && !isMissingTable(res.error.code)) console.warn('form cache save failed', res.error);
  return analysis;
}

/** Runs after the session is created (Next.js `after()`); writes the analysis into form_fields. */
/**
 * `partial`: only fields that appeared later (a wizard's next step, a revealed field). Their step was set
 * when they were added, and the session's name and analysis status stay as the first analysis left them.
 */
export async function analyzeAndStore(
  sessionId: string,
  schema: FormSchema,
  opts: { partial?: boolean; userId?: string; saved?: SavedForm | null } = {},
): Promise<void> {
  const { db } = await import('../supabase-admin');
  const { recordUsage } = await import('../usage/record');
  const owner = { user_id: opts.userId ?? null, session_id: sessionId };
  const usage: UsageEvent[] = [];
  const onUsage: OnUsage = (run) => usage.push(openaiEvent(owner, 'analyze', run));
  try {
    const analysis = await readForm(schema, !!opts.partial, onUsage, usage, opts.saved);
    const fields = sanitizeAnalysis(analysis, schema);
    const detectedRequired = new Map(schema.fields.map((f) => [f.field_key, f.required]));
    // A new form's first session was built from the scan: the dropdowns the saved field list leaves
    // empty are emptied here too, so this session's prompt starts like every later session's.
    const scanned = new Map(schema.fields.map((f) => [f.field_key, f]));
    const emptied = new Set(schema.fields.filter((f) => emptiedByTemplate(f, fields)).map((f) => f.field_key));
    // withNew: the columns of migrations 0006/0007 (Tamil label, upload rules).
    const save = (f: FieldAnalysis, withNew: boolean) =>
      db()
        .from('form_fields')
        .update({
          ...(emptied.has(f.field_key) && scanned.has(f.field_key) ? { options: [], dynamic_options: true } : {}),
          clean_label: f.clean_label,
          semantic_type: f.semantic_type,
          validation: f.validation,
          required: f.required || detectedRequired.get(f.field_key) === true,
          depends_on: f.depends_on,
          ...(opts.partial ? {} : { step_index: f.step_index }),
          output_script: f.output_script,
          ...(withNew && f.label_ta ? { label_ta: f.label_ta } : {}),
          ...(withNew && f.file_rules ? { file_rules: f.file_rules } : {}),
        })
        .eq('session_id', sessionId)
        .eq('field_key', f.field_key);
    await Promise.all(
      fields.map(async (f) => {
        const res = await save(f, true);
        // Migrations 0006 / 0007 not applied yet: save everything else.
        if (res.error?.code === 'PGRST204') await save(f, false);
      }),
    );
    if (opts.partial) return;
    const patch: Record<string, string> = { analysis_status: 'done' };
    if (analysis.form_purpose.trim()) patch.form_name = analysis.form_purpose.trim().slice(0, 120);
    await db().from('form_sessions').update(patch).eq('id', sessionId);
  } catch (e) {
    console.error('form analysis failed', e);
    if (!opts.partial) await db().from('form_sessions').update({ analysis_status: 'error' }).eq('id', sessionId);
  } finally {
    await recordUsage(usage);
  }
}
