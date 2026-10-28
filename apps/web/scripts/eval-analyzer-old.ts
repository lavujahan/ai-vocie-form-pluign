/**
 * The Form Analyzer as it was before the short answer (git 8635af1): its instructions, input and answer
 * format, kept only so `pnpm eval:analyzer` can compare old and new on the same input. Not used by the app.
 */
import { Agent, run, type Model } from '@openai/agents';
import { FieldAnalysis, FormAnalysis, ValidationRules, type FormSchema } from '@vff/shared';
import { z } from 'zod';
import { analyzerTools } from '../lib/agents/tools';
import { agentModel, modelName, runWithUsage, type OnUsage } from '../lib/agents/usage';

const OLD_INSTRUCTIONS = `You analyze a web form detected on a page so that another agent can fill it from speech.

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

/** The old answer: every property on every field, validation always an object. */
const OldAnalysis = FormAnalysis.extend({ fields: z.array(FieldAnalysis.extend({ validation: ValidationRules })) });

export async function analyzeFormOld(schema: FormSchema, opts: { model?: Model | string; onUsage?: OnUsage } = {}): Promise<FormAnalysis> {
  const { model, modelSettings, timeoutMs } = agentModel('analyzer', opts.model);
  const agent = new Agent({
    name: 'Form Analyzer Agent',
    instructions: OLD_INSTRUCTIONS,
    model,
    modelSettings,
    outputType: OldAnalysis,
    tools: analyzerTools(schema.fields),
  });
  const result = await runWithUsage(opts.onUsage, modelName(model), () =>
    run(agent, describeSchema(schema), { maxTurns: 6, signal: AbortSignal.timeout(timeoutMs) }),
  );
  if (!result.finalOutput) throw new Error('Form analyzer returned no output');
  return result.finalOutput;
}
