/**
 * The Form Analyzer as it was before the compact answer (one short entry per field, with required,
 * validation and depends_on as lists): its instructions, input and answer format, kept only so
 * `pnpm eval:analyzer` can compare old and new on the same input. Not used by the app.
 */
import { Agent, run, type Model } from '@openai/agents';
import { FileRules, SemanticType, ValidationRules, type FormAnalysis, type FormSchema } from '@vff/shared';
import { z } from 'zod';
import { keyHasWords } from '../lib/agents/formAnalyzer';
import { analyzerTools } from '../lib/agents/tools';
import { agentModel, modelName, runWithUsage, type OnUsage } from '../lib/agents/usage';

const OLD_INSTRUCTIONS = `You analyze a web form detected on a page so that another agent can fill it from speech.

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

const shortId = (i: number) => `f${i + 1}`;

function describeSchemaOld(schema: FormSchema): string {
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

const OldAnswer = z.object({
  form_purpose: z.string().describe('Short sentence-case name for the form, e.g. "Customer onboarding"'),
  fields: z.array(
    z.object({
      field_key: z.string(),
      clean_label: z.string(),
      semantic_type: SemanticType,
      required: z.boolean(),
      validation: ValidationRules.nullable(),
      depends_on: z.string().nullable(),
      label_ta: z.string().describe("Short Tamil translation of the label for the phone screen, e.g. \"தந்தை பெயர்\" for Father's name"),
    }),
  ),
  tamil_fields: z.array(z.string()).describe('Ids of the fields whose label asks for the value in Tamil; usually empty'),
  step_starts: z.array(z.string()).describe('The first field of each later section, only when the form is clearly split into steps; usually empty'),
  uploads: z.array(FileRules.extend({ field_key: z.string() })).describe('One entry per upload field (type file)'),
});

export async function analyzeFormOld(schema: FormSchema, opts: { model?: Model | string; onUsage?: OnUsage } = {}): Promise<FormAnalysis> {
  const reading = await readOnceOld(schema, opts);
  const known = new Set(schema.fields.map((f) => f.field_key));
  const answered = new Set(reading.fields.map((f) => f.field_key).filter((k) => known.has(k)));
  const missing = schema.fields.filter((f) => !answered.has(f.field_key));
  if (!missing.length) return reading;

  console.warn(`form analyzer left out ${missing.length} of ${schema.fields.length} fields; reading them again`);
  const more = await readOnceOld({ ...schema, fields: missing }, opts).catch((e) => {
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


async function readOnceOld(schema: FormSchema, opts: { model?: Model | string; onUsage?: OnUsage }): Promise<FormAnalysis> {
  const { model, modelSettings, timeoutMs } = agentModel('analyzer', opts.model);
  const agent = new Agent({
    name: 'Form Analyzer Agent',
    instructions: OLD_INSTRUCTIONS,
    model,
    modelSettings,
    outputType: OldAnswer,
    tools: analyzerTools(schema.fields.map((f, i) => ({ ...f, field_key: shortId(i) }))),
  });
  const result = await runWithUsage(opts.onUsage, modelName(model), () => run(agent, describeSchemaOld(schema), { maxTurns: 6, signal: AbortSignal.timeout(timeoutMs) }));
  if (!result.finalOutput) throw new Error('Form analyzer returned no output');
  return readingFromOldAnswer(result.finalOutput, schema);
}


function readingFromOldAnswer(answer: z.infer<typeof OldAnswer>, schema: FormSchema): FormAnalysis {
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

