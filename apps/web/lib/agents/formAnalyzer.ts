import { Agent, run, setTracingDisabled, type Model } from '@openai/agents';
import { FormAnalysis, sanitizeFileRules, type FieldAnalysis, type FormSchema } from '@vff/shared';
import { fieldSnapshot, formFingerprint, isFresh, isMissingTable, pageOf, promptVersion, type CachedReading } from './formCache';
import { analyzerTools } from './tools';
import { agentModel, modelName, runWithUsage, type OnUsage } from './usage';
import { openaiEvent, type UsageEvent } from '../usage/events';

setTracingDisabled(process.env.NODE_ENV === 'production');

export const ANALYZER_INSTRUCTIONS = `You analyze a web form detected on a page so that another agent can fill it from speech.

For the form:
- form_purpose: a short sentence-case name for what the form is, e.g. "Customer onboarding", "GST registration". Max 5 words.

For every field in the input (use the exact field_key; include every field once):
- clean_label: a short human label in sentence case ("Full name", "Mobile number"). Remove asterisks and "(required)".
- semantic_type: the closest type from the allowed list. Use "choice" for option fields without a better type, "boolean" for a single yes/no checkbox, "free_text" for remarks/descriptions.
- required: true if the field is marked required, has an asterisk, or the text says it is mandatory.
- validation: regex (JavaScript, without ^$ anchors) only if the page clearly states a format, min/max length, and a human-readable format hint (e.g. "10 digits", "DD/MM/YYYY"). Use null when unknown — never guess.
- depends_on: the field_key of a parent field this one depends on (e.g. state → country), otherwise null.
- step_index: 0 unless the form is clearly split into steps.
- output_script: "ta" only if the label asks for Tamil (e.g. "Name in Tamil", "தமிழில் பெயர்"); otherwise "en".
- label_ta: the label in simple, common Tamil for someone reading it on a phone ("Father's name" → "தந்தை பெயர்", "Mobile number" → "கைபேசி எண்", "Date of birth" → "பிறந்த தேதி", "Taluk" → "வட்டம்"). Tamil script only; keep it short; use the English word in Tamil letters when that is what people say ("ஆதார் எண்").

- file_rules: only for upload fields (type file), else null. Read them from the accept attribute and the text near the field or anywhere on the page ("Photo: JPG, below 50 KB, 3.5 x 4.5 cm", "Upload community certificate in PDF, max 1 MB"):
  kind = photo (a person's photo), signature, or document (certificates, ID cards, any scan);
  formats = the allowed file types (jpg / png / pdf), empty if not stated;
  max_kb / min_kb = stated size limits in KB (1 MB = 1024 KB), null if not stated; never guess a size;
  max_pages = for PDFs, if stated; width_px / height_px = only if stated in pixels;
  shape = the photo size if the page states one, width then height, with its unit: "3.5 x 4.5 cm" → {w:3.5,h:4.5,unit:"cm"}, "35mm x 45mm" → mm, "2 x 2 inch" → in, "200 x 230 pixels" → px (also fill width_px/height_px). null when no size is written; never assume one, not even for "passport size" alone;
  note = any other stated requirement, short ("white background", "self-attested").

Use get_field_context when a field's label is unclear.`;

function describeSchema(schema: FormSchema): string {
  const fields = schema.fields.map((f) => {
    const parts = [`${f.field_key}`, `label: ${JSON.stringify(f.label)}`, `type: ${f.field_type}`];
    if (f.required) parts.push('required');
    if (f.options.length) parts.push(`options: ${f.options.slice(0, 15).map((o) => o.label).join(' | ')}${f.options.length > 15 ? ' …' : ''}`);
    if (f.placeholder) parts.push(`placeholder: ${JSON.stringify(f.placeholder)}`);
    if (f.pattern) parts.push(`pattern: ${f.pattern}`);
    if (f.min || f.max) parts.push(`min/max: ${f.min ?? ''}/${f.max ?? ''}`);
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

export async function analyzeForm(
  schema: FormSchema,
  opts: { model?: Model | string; onUsage?: OnUsage } = {},
): Promise<FormAnalysis> {
  const { model, modelSettings, timeoutMs } = agentModel('analyzer', opts.model);
  const agent = new Agent({
    name: 'Form Analyzer Agent',
    instructions: ANALYZER_INSTRUCTIONS,
    model,
    modelSettings,
    outputType: FormAnalysis,
    tools: analyzerTools(schema.fields),
  });
  const result = await runWithUsage(opts.onUsage, modelName(model), () => run(agent, describeSchema(schema), { maxTurns: 6, signal: AbortSignal.timeout(timeoutMs) }));
  if (!result.finalOutput) throw new Error('Form analyzer returned no output');
  return result.finalOutput;
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

/** Keeps only known fields, drops broken regexes and dangling depends_on links. */
export function sanitizeAnalysis(analysis: FormAnalysis, schema: FormSchema): FieldAnalysis[] {
  const keys = new Set(schema.fields.map((f) => f.field_key));
  const byKey = new Map(schema.fields.map((f) => [f.field_key, f]));
  const seen = new Set<string>();
  const out: FieldAnalysis[] = [];
  for (const f of analysis.fields) {
    if (!keys.has(f.field_key) || seen.has(f.field_key)) continue;
    seen.add(f.field_key);
    out.push({
      ...f,
      clean_label: f.clean_label.trim().slice(0, 200),
      label_ta: cleanTamilLabel(f.label_ta) ?? '',
      // Upload rules only for upload fields; the accept attribute wins over what was read from the text.
      file_rules: byKey.get(f.field_key)?.field_type === 'file' ? sanitizeFileRules(f.file_rules, byKey.get(f.field_key)?.accept) : null,
      depends_on: f.depends_on && keys.has(f.depends_on) && f.depends_on !== f.field_key ? f.depends_on : null,
      validation: { ...f.validation, regex: regexOk(f.validation.regex) },
    });
  }
  return out;
}

/** The analyzer's model as saved with a reading: "gpt-5.4-mini@low". */
export function analyzerModelSpec(): string {
  const { model, modelSettings } = agentModel('analyzer');
  const effort = modelSettings.reasoning?.effort;
  return typeof model === 'string' ? `${model}${effort ? `@${effort}` : ''}` : 'custom';
}

/**
 * The form's reading: the shared saved one when it is fresh (no AI call, nothing billed), else a new
 * one from the AI, saved for the next scan of this form by anyone.
 */
async function readForm(schema: FormSchema, partial: boolean, onUsage: OnUsage, usage: UsageEvent[]): Promise<FormAnalysis> {
  const { db } = await import('../supabase-admin');
  const fingerprint = formFingerprint(schema);
  const current = { model: analyzerModelSpec(), promptVersion: promptVersion(ANALYZER_INSTRUCTIONS) };

  const { data, error } = await db()
    .from('form_cache')
    .select('fingerprint, analysis, model, prompt_version, created_at, edited_at')
    .eq('fingerprint', fingerprint)
    .maybeSingle();
  const noTable = isMissingTable(error?.code);
  if (error && !noTable) console.warn('form cache lookup failed', error);
  const saved = data as CachedReading | null;
  if (saved && isFresh(saved, current)) {
    const hit = await db().rpc('form_cache_hit', { p_fingerprint: fingerprint });
    if (hit.error) console.warn('form cache hit not counted', hit.error);
    return saved.analysis;
  }

  const analysis = await analyzeForm(schema, { onUsage });
  if (!noTable) {
    const reading = { form_purpose: analysis.form_purpose, fields: sanitizeAnalysis(analysis, schema) };
    const res = await db()
      .from('form_cache')
      .upsert(
        {
          fingerprint,
          form_name: (analysis.form_purpose.trim() || schema.form_title || schema.page_title || pageOf(schema.page_url)).slice(0, 120),
          page_url: pageOf(schema.page_url),
          field_count: schema.fields.length,
          partial,
          fields: fieldSnapshot(schema),
          analysis: reading,
          model: current.model,
          prompt_version: current.promptVersion,
          cost_usd: usage.reduce((a, e) => a + (e.cost_usd ?? 0), 0),
          uses: 0,
          last_used_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          edited_at: null,
          edited_by: null,
        },
        { onConflict: 'fingerprint' },
      );
    if (res.error) console.warn('form cache save failed', res.error);
  }
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
  opts: { partial?: boolean; userId?: string } = {},
): Promise<void> {
  const { db } = await import('../supabase-admin');
  const { recordUsage } = await import('../usage/record');
  const owner = { user_id: opts.userId ?? null, session_id: sessionId };
  const usage: UsageEvent[] = [];
  const onUsage: OnUsage = (run) => usage.push(openaiEvent(owner, 'analyze', run));
  try {
    const analysis = await readForm(schema, !!opts.partial, onUsage, usage);
    const fields = sanitizeAnalysis(analysis, schema);
    const detectedRequired = new Map(schema.fields.map((f) => [f.field_key, f.required]));
    // withNew: the columns of migrations 0006/0007 (Tamil label, upload rules).
    const save = (f: FieldAnalysis, withNew: boolean) =>
      db()
        .from('form_fields')
        .update({
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
