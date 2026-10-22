import { Agent, run, setTracingDisabled, type Model } from '@openai/agents';
import { FormAnalysis, type FieldAnalysis, type FormSchema } from '@vff/shared';
import { analyzerTools } from './tools';

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
    if (f.context) parts.push(`nearby: ${JSON.stringify(f.context.slice(0, 200))}`);
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

export async function analyzeForm(schema: FormSchema, opts: { model?: Model | string } = {}): Promise<FormAnalysis> {
  const agent = new Agent({
    name: 'Form Analyzer Agent',
    instructions: ANALYZER_INSTRUCTIONS,
    model: opts.model ?? process.env.AGENT_MODEL ?? 'gpt-4o',
    outputType: FormAnalysis,
    tools: analyzerTools(schema.fields),
  });
  const result = await run(agent, describeSchema(schema), { maxTurns: 6 });
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

/** Keeps only known fields, drops broken regexes and dangling depends_on links. */
export function sanitizeAnalysis(analysis: FormAnalysis, schema: FormSchema): FieldAnalysis[] {
  const keys = new Set(schema.fields.map((f) => f.field_key));
  const seen = new Set<string>();
  const out: FieldAnalysis[] = [];
  for (const f of analysis.fields) {
    if (!keys.has(f.field_key) || seen.has(f.field_key)) continue;
    seen.add(f.field_key);
    out.push({
      ...f,
      clean_label: f.clean_label.trim().slice(0, 200),
      depends_on: f.depends_on && keys.has(f.depends_on) && f.depends_on !== f.field_key ? f.depends_on : null,
      validation: { ...f.validation, regex: regexOk(f.validation.regex) },
    });
  }
  return out;
}

/** Runs after the session is created (Next.js `after()`); writes the analysis into form_fields. */
/**
 * `partial`: only fields that appeared later (a wizard's next step, a revealed field). Their step was set
 * when they were added, and the session's name and analysis status stay as the first analysis left them.
 */
export async function analyzeAndStore(sessionId: string, schema: FormSchema, opts: { partial?: boolean } = {}): Promise<void> {
  const { db } = await import('../supabase-admin');
  try {
    const analysis = await analyzeForm(schema);
    const fields = sanitizeAnalysis(analysis, schema);
    const detectedRequired = new Map(schema.fields.map((f) => [f.field_key, f.required]));
    await Promise.all(
      fields.map((f) =>
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
          })
          .eq('session_id', sessionId)
          .eq('field_key', f.field_key),
      ),
    );
    if (opts.partial) return;
    const patch: Record<string, string> = { analysis_status: 'done' };
    if (analysis.form_purpose.trim()) patch.form_name = analysis.form_purpose.trim().slice(0, 120);
    await db().from('form_sessions').update(patch).eq('id', sessionId);
  } catch (e) {
    console.error('form analysis failed', e);
    if (!opts.partial) await db().from('form_sessions').update({ analysis_status: 'error' }).eq('id', sessionId);
  }
}
