import type { InputGuardrail, OutputGuardrail } from '@openai/agents';
import { MappingResult, normalizeText, type MappedValue, type VoiceCommand } from '@vff/shared';
import { fieldLabel, validateForField, type AgentField } from './tools';

export type MapperContext = { transcript: string; fieldKeys: Set<string> };

/** True when the transcript has no real speech in it (silence, noise, a single character). */
export function isEmptyTranscript(t: string): boolean {
  return (t.match(/[\p{L}\p{N}]/gu)?.length ?? 0) < 2;
}

/** Input guardrail: never spend a model call on an empty transcript. */
export const emptyTranscriptGuardrail: InputGuardrail = {
  name: 'empty_transcript',
  runInParallel: false,
  execute: async ({ context }) => {
    const { transcript } = context.context as MapperContext;
    return { tripwireTriggered: isEmptyTranscript(transcript), outputInfo: { length: transcript.length } };
  },
};

/** Output guardrail: trips if the model mostly invented field keys (it is mapping the wrong form). */
export const unknownKeysGuardrail: OutputGuardrail<typeof MappingResult> = {
  name: 'unknown_field_keys',
  execute: async ({ agentOutput, context }) => {
    const { fieldKeys } = context.context as MapperContext;
    const values = agentOutput.values ?? [];
    const unknown = values.filter((v) => !fieldKeys.has(v.field_key));
    return {
      tripwireTriggered: values.length > 0 && unknown.length > values.length / 2,
      outputInfo: { unknown: unknown.map((v) => v.field_key) },
    };
  },
};

export type SanitizedValue = MappedValue & { error: string | null };
export type SanitizedMapping = {
  values: SanitizedValue[];
  unmapped_speech: string | null;
  missing_required: string[];
  command: VoiceCommand | null;
};

/**
 * Server-side authority over the mapper's output:
 * - drops unknown keys (and other fields in field-by-field mode)
 * - drops nulls (null = not mentioned, so the existing value stays)
 * - turns "" into an explicit clear
 * - re-validates every value; invalid ones are kept with low confidence so the user sees "check this"
 */
export function sanitizeMapping(
  result: MappingResult,
  fields: AgentField[],
  targetFieldKey: string | null,
): SanitizedMapping {
  const byKey = new Map(fields.map((f) => [f.field_key, f]));
  const out = new Map<string, SanitizedValue>();
  // Label words ("Name", "Gender", "Father name") are never values of free-text fields.
  const labelWords = new Set<string>();
  for (const f of fields) {
    for (const part of [fieldLabel(f), f.label, ...fieldLabel(f).split('/')]) {
      const n = normalizeText(part);
      if (n) labelWords.add(n);
    }
  }
  labelWords.add('name');

  for (const raw of result.values) {
    const field = byKey.get(raw.field_key);
    if (!field) continue;
    if (targetFieldKey && raw.field_key !== targetFieldKey) continue;
    // For numbers spoken as words the agent lists each piece it heard with its digits; joining
    // those is more reliable than its one-shot answer (which can drop or swap digits). No word
    // lists here: the AI did the interpreting, code only concatenates.
    const joined = raw.number_parts?.length ? raw.number_parts.map((p) => p.digits.replace(/\D/g, '')).join('') : '';
    // Only for values that are all digits: joining would drop the letters of a code like a GST number.
    const lettered = /[\p{L}]/u.test(raw.value ?? '');
    const v = joined && !lettered ? { ...raw, value: joined } : raw;
    if (v.value === null) continue;

    const confidence = Math.min(1, Math.max(0, v.confidence));
    if (v.value.trim() === '') {
      out.set(v.field_key, { ...v, value: null, confidence: 1, error: null });
      continue;
    }

    if (!field.options.length && labelWords.has(normalizeText(v.value))) continue;

    const check = validateForField(byKey, v.field_key, v.value);
    if (!check.ok) {
      out.set(v.field_key, { ...v, confidence: Math.min(confidence, 0.3), error: check.error });
      continue;
    }
    // Tamil script left in an English-output field means transliteration was skipped.
    const isChoice = field.options.length > 0;
    const tamilLeft = field.output_script !== 'ta' && !isChoice && /[஀-௿]/.test(check.value);
    out.set(v.field_key, {
      ...v,
      value: check.value,
      confidence: tamilLeft ? Math.min(confidence, 0.5) : confidence,
      error: tamilLeft ? `${fieldLabel(field)} should be in English letters` : null,
    });
  }

  const values = [...out.values()];
  return {
    values,
    unmapped_speech: result.unmapped_speech?.trim() || null,
    missing_required: result.missing_required.filter((k) => byKey.has(k)),
    // A command is the whole speech ("start over", "send it"): never alongside values, never in single-field mode.
    command: !targetFieldKey && !values.length ? (result.command ?? null) : null,
  };
}
