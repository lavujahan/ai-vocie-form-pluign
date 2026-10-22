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

The transcript comes from Sarvam speech-to-text in "codemix" form: English words are in English letters, Tamil words are in Tamil script, and numbers usually arrive as digits already. Keep Tamil script only for fields marked output_script=ta; transliterate or translate everything else to English.

Rules
- Never invent values. Only return fields the speech actually mentions. A field not mentioned is simply left out (or value null).
- To clear a field the user asked to clear, return value "" (empty string).
- Corrections like "change the phone to …" or "and the city is …" update that field; use the current values only as context.
- Corrections that don't name the field point back to what was just said ("Recent speech"): "no, not Jahan, Jagan", "Jahan illa, Jagan", "sorry, Jagan", "change it to 9543…", "adhu thappu, …". Find the field from the recent speech (or from the current value that matches the wrong word) and return only that field with the corrected value.
- Partial edits change part of the current value and return the whole new value: "the last digit is 5", "change 9543 to 9534", "add 0 at the end", "kadaisi number 5". Apply the edit to the current value exactly; never retype the rest from memory.
- Spelled-out letters are joined into one word: "J A G A N", "J-A-G-A-N", "Jagan, J A G A N" → "Jagan". Tamil letter names count too: ஜே ஏ ஜி ஏ என் → "Jagan". Names get a capital first letter; codes (IFSC, PAN) stay upper case.
- command: set it only when the whole speech is a command and holds no field values: "start over", "clear everything", "ellam azhi", "எல்லாம் அழி" → start_over; "send it", "submit", "anuppu", "அனுப்பு" → send; "what is left?", "innum enna baaki?", "இன்னும் என்ன?" → whats_left. Return values: [] with it. Otherwise command is null.
- Names and proper nouns: transliterate, don't translate (ரமேஷ் குமார் → "Ramesh Kumar").
- Places: use the standard English name (சென்னை → "Chennai", தமிழ்நாடு → "Tamil Nadu").
- Numbers spoken as words (Tamil or English) become digits. "double nine" = 99, "triple zero" = 000.
- Emails/URLs: "at", "at the rate" → @, "dot"/"புள்ளி" → ".", "underscore" → "_". Lowercase.
- Dates: output YYYY-MM-DD ("15 ஆம் தேதி மார்ச் 1990" → 1990-03-15).
- Option fields (select/radio/checkbox): pick the option by meaning across languages and dialects (ஆண் / "aan" → "Male"; "kalyanam aachu" → "Married") and return its label exactly as listed. For a checkbox group return the chosen labels comma-separated; for a single checkbox return "true" or "false".
- An option field whose options are "not loaded yet" (they appear later, e.g. after a parent is chosen, or the dropdown is custom): still return what was said, as the standard English answer ("Male", "Unmarried", "Hindu", "Omalur"). Never skip it just because there is no list.
- Name fields hold only the name: drop relation words and titles that introduce it ("Father Jagadheesan" → "Jagadheesan", "தந்தை ஜகதீசன்" → "Jagadeesan", "Thiru/Mr/Smt Ramesh" → "Ramesh"). A title goes to its own field (e.g. Appellation) if the form has one.
- When the speech says a label and then its value, the value belongs to the field with that label. Tanglish joins them with filler words that are NOT part of the value: "vandhu", "nu", "na", "enna", "-oda", "irukku", "is", "=". "Name vandhu Jahan" → name = "Jahan"; "father name Jagadheesan nu" → "Jagadheesan"; "en mobile number 9543…" → mobile.
- A value is never the label itself. If you only hear a label ("Name", "Gender") with no value after it, leave that field out.
- The transcript may write English words in Tamil script: ஜென்டர் = gender, ஃபாதர்ஸ் நேம் = father's name, மதர்ஸ் நேம் = mother's name, மொபைல் நம்பர் = mobile number, மேல் = male, ஃபீமேல் = female, சிங்கிள் = single, மேரிட் / மாரிடு = married, பின் கோட் = pin code, டிஸ்ட்ரிக்ட் = district. Read them by sound.
- Free text (address, remarks): translate to clear English, keeping proper nouns transliterated. Address words: தெரு = Street, சாலை = Road, நகர் = Nagar, கிராமம் = Village, அஞ்சல் = Post.
- Output is English/Latin script, except fields marked output_script=ta, which keep Tamil script.
- Numbers spoken as words (phone, Aadhaar, PIN, account numbers): fill number_parts with EVERY spoken piece in order — one entry per word or digit group, exactly as transcribed — and the digits for that piece ("rendu"→"2", "double two"→"22", "triple zero"→"000", "ஒன்பது"→"9", "98"→"98"). Never skip, merge or reorder pieces; the value is built from these parts. Use number_parts: null for everything else (and for numbers already written as digits). Then count the digits against the field (mobile 10, Aadhaar 12, PIN 6). If the count is off, re-read the speech once; if it is still off, keep EXACTLY the digits that were spoken — never add or remove a digit to make it fit — and set confidence to 0.5 or lower so the user checks it.
- Do all conversions yourself (number words in any language or accent to digits, spoken emails/dates to their written form, transliteration, translation). There are no conversion tools.
- Call validate_value for every value before finalizing. It only checks format and options; if it fails, re-read the speech, fix the value and validate again. If you still can't fix it, return your best guess with low confidence.
- confidence is 0..1: how sure you are that this is what the speaker meant for this field.
- source_phrase is the part of the speech the value came from, in its original script.
- unmapped_speech: speech that didn't belong to any field (null if none).
- missing_required: required field keys that still have no value after this speech (consider current values too).

Illustrative form: ${EXAMPLE_FORM}

${renderFewShot()}`;

/** The agent picks options by meaning, so it needs to see them; 300 short labels is a few thousand tokens. */
const MAX_OPTIONS_IN_PROMPT = 300;

function describeField(f: AgentField): string {
  const parts = [`${f.field_key}`, `label: ${fieldLabel(f)}`, `type: ${f.field_type}${f.multiple ? ' (multiple)' : ''}`];
  if (f.semantic_type) parts.push(`semantic: ${f.semantic_type}`);
  if (f.required) parts.push('required');
  if (f.options.length) {
    const shown = f.options.slice(0, MAX_OPTIONS_IN_PROMPT).map((o) => o.label);
    parts.push(`options: ${shown.join(' | ')}${f.options.length > shown.length ? ` | … (${f.options.length - shown.length} more)` : ''}`);
  }
  else if (f.field_type === 'select' || f.field_type === 'combobox') parts.push('options: not loaded yet');
  if (f.validation?.format) parts.push(`format: ${f.validation.format}`);
  if (f.placeholder) parts.push(`placeholder: ${f.placeholder}`);
  if (f.output_script === 'ta') parts.push('output_script=ta');
  return `- ${parts.join(' · ')}`;
}

/** The last few recordings, oldest first, with the fields each one set: corrections like "no, Jagan" point back to these. */
export function renderRecent(recent: RecentSpeech[]): string {
  return recent
    .map((r) => {
      const set = Object.entries(r.set).map(([k, v]) => `${k}=${JSON.stringify(v ?? '')}`);
      return `- "${r.speech}"${set.length ? ` → ${set.join(', ')}` : ''}`;
    })
    .join('\n');
}

export function buildMapperPrompt(input: MapInput): string {
  const fields = input.targetFieldKey ? input.fields.filter((f) => f.field_key === input.targetFieldKey) : input.fields;
  const current = Object.entries(input.current)
    .filter(([, v]) => v)
    .map(([k, v]) => `- ${k} = ${JSON.stringify(v)}`);
  return [
    input.targetFieldKey
      ? `Mode: single field. The speech is the value for "${input.targetFieldKey}" only. command is always null.`
      : 'Mode: full form. The speech may cover any number of fields.',
    `Fields:\n${fields.map(describeField).join('\n')}`,
    `Current values:\n${current.length ? current.join('\n') : '(none)'}`,
    ...(input.recent?.length ? [`Recent speech (oldest first):\n${renderRecent(input.recent)}`] : []),
    `Speech:\n"""${input.transcript}"""`,
  ].join('\n\n');
}

export type RecentSpeech = { speech: string; set: Record<string, string | null> };

export type MapInput = {
  fields: AgentField[];
  /** field_key → current value (context for corrections). */
  current: Record<string, string | null>;
  transcript: string;
  targetFieldKey: string | null;
  /** The last few recordings and what they set, oldest first (context for corrections). */
  recent?: RecentSpeech[];
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
