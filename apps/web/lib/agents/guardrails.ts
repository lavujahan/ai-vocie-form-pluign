import { normalizeText, type MappedValue, type MappingResult } from '@vff/shared';
import { fieldLabel, validateForField, type AgentField } from './tools';

/** Input guardrail: no model call for a transcript with no real speech (silence, noise, one character). */
export function isEmptyTranscript(t: string): boolean {
  return (t.match(/[\p{L}\p{N}]/gu)?.length ?? 0) < 2;
}

/** Output guardrail: true if the model mostly invented field keys (it is mapping the wrong form). */
export function mostlyUnknownKeys(result: MappingResult, fieldKeys: Set<string>): boolean {
  const unknown = result.values.filter((v) => !fieldKeys.has(v.field_key));
  return result.values.length > 0 && unknown.length > result.values.length / 2;
}

export type SanitizedValue = MappedValue & { error: string | null };
export type SanitizedMapping = { values: SanitizedValue[]; unmapped_speech: string | null; missing_required: string[] };

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
    const v = joined ? { ...raw, value: joined } : raw;
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

  return {
    values: [...out.values()],
    unmapped_speech: result.unmapped_speech?.trim() || null,
    missing_required: result.missing_required.filter((k) => byKey.has(k)),
  };
}
