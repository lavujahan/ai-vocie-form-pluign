import { Agent, InputGuardrailTripwireTriggered, run, setTracingDisabled, type Model } from '@openai/agents';
import { MappingResult } from '@vff/shared';
import { EXAMPLE_FORM, renderFewShot } from './examples.ta-en';
import {
  emptyTranscriptGuardrail,
  sanitizeMapping,
  unknownKeysGuardrail,
  type MapperContext,
  type SanitizedMapping,
} from './guardrails';
import { fieldLabel, mapperTools, type AgentField } from './tools';

setTracingDisabled(process.env.NODE_ENV === 'production');

export const MAPPER_INSTRUCTIONS = `You fill web forms from a person's speech.
The speech may be Tamil, English or Tanglish (code-mixed, Tamil words in Latin letters). The form needs English values.

Rules
- Never invent values. Only return fields the speech actually mentions. A field not mentioned is simply left out (or value null).
- To clear a field the user asked to clear, return value "" (empty string).
- Corrections like "change the phone to …" or "and the city is …" update that field; use the current values only as context.
- Names and proper nouns: transliterate, don't translate (ரமேஷ் குமார் → "Ramesh Kumar").
- Places: use the standard English name (சென்னை → "Chennai", தமிழ்நாடு → "Tamil Nadu").
- Numbers spoken as words (Tamil or English) become digits. "double nine" = 99, "triple zero" = 000.
- Emails/URLs: "at", "at the rate" → @, "dot"/"புள்ளி" → ".", "underscore" → "_". Lowercase.
- Dates: output YYYY-MM-DD ("15 ஆம் தேதி மார்ச் 1990" → 1990-03-15).
- Option fields (select/radio/checkbox): match by meaning across languages (ஆண் / "aan" → "Male"; "kalyanam aachu" → "Married"). Use match_option and return the option label exactly. For a checkbox group return the chosen labels comma-separated; for a single checkbox return "true" or "false".
- Free text (address, remarks): translate to clear English, keeping proper nouns transliterated.
- Output is English/Latin script, except fields marked output_script=ta, which keep Tamil script.
- Call validate_value for every value before finalizing. If it fails, fix the value (normalize_value, match_option) and validate again; if you can't fix it, return your best guess with low confidence.
- confidence is 0..1: how sure you are that this is what the speaker meant for this field.
- source_phrase is the part of the speech the value came from, in its original script.
- unmapped_speech: speech that didn't belong to any field (null if none).
- missing_required: required field keys that still have no value after this speech (consider current values too).

Illustrative form: ${EXAMPLE_FORM}

${renderFewShot()}`;

function describeField(f: AgentField): string {
  const parts = [`${f.field_key}`, `label: ${fieldLabel(f)}`, `type: ${f.field_type}${f.multiple ? ' (multiple)' : ''}`];
  if (f.semantic_type) parts.push(`semantic: ${f.semantic_type}`);
  if (f.required) parts.push('required');
  if (f.options.length) parts.push(`options: ${f.options.slice(0, 40).map((o) => o.label).join(' | ')}`);
  if (f.validation?.format) parts.push(`format: ${f.validation.format}`);
  if (f.placeholder) parts.push(`placeholder: ${f.placeholder}`);
  if (f.output_script === 'ta') parts.push('output_script=ta');
  return `- ${parts.join(' · ')}`;
}

export function buildMapperPrompt(input: MapInput): string {
  const fields = input.targetFieldKey ? input.fields.filter((f) => f.field_key === input.targetFieldKey) : input.fields;
  const current = Object.entries(input.current)
    .filter(([, v]) => v)
    .map(([k, v]) => `- ${k} = ${JSON.stringify(v)}`);
  return [
    input.targetFieldKey
      ? `Mode: single field. The speech is the value for "${input.targetFieldKey}" only.`
      : 'Mode: full form. The speech may cover any number of fields.',
    `Fields:\n${fields.map(describeField).join('\n')}`,
    `Current values:\n${current.length ? current.join('\n') : '(none)'}`,
    `Speech:\n"""${input.transcript}"""`,
  ].join('\n\n');
}

export type MapInput = {
  fields: AgentField[];
  /** field_key → current value (context for corrections). */
  current: Record<string, string | null>;
  transcript: string;
  targetFieldKey: string | null;
};

export type MapOutcome = (SanitizedMapping & { empty: false }) | { empty: true };

export async function mapTranscript(input: MapInput, opts: { model?: Model | string } = {}): Promise<MapOutcome> {
  const fields = input.targetFieldKey ? input.fields.filter((f) => f.field_key === input.targetFieldKey) : input.fields;
  const agent = new Agent<MapperContext, typeof MappingResult>({
    name: 'Field Mapping Agent',
    instructions: MAPPER_INSTRUCTIONS,
    model: opts.model ?? process.env.AGENT_MODEL ?? 'gpt-4o',
    outputType: MappingResult,
    tools: mapperTools(fields),
    inputGuardrails: [emptyTranscriptGuardrail],
    outputGuardrails: [unknownKeysGuardrail],
  });

  try {
    const result = await run(agent, buildMapperPrompt(input), {
      context: { transcript: input.transcript, fieldKeys: new Set(fields.map((f) => f.field_key)) },
      maxTurns: 10,
    });
    if (!result.finalOutput) throw new Error('Mapping agent returned no output');
    return { empty: false, ...sanitizeMapping(result.finalOutput, fields, input.targetFieldKey) };
  } catch (e) {
    if (e instanceof InputGuardrailTripwireTriggered) return { empty: true };
    throw e;
  }
}
