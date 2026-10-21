import { tool } from '@openai/agents';
import { z } from 'zod';
import {
  matchOption,
  normalizeValue,
  SemanticType,
  validateValue,
  type FieldDescriptor,
  type FieldOption,
  type FieldType,
  type OutputScript,
  type ValidationRules,
} from '@vff/shared';

/** What the agents need to know about a field (a subset of a form_fields row). */
export type AgentField = {
  field_key: string;
  label: string;
  clean_label?: string | null;
  field_type: FieldType;
  required: boolean;
  options: FieldOption[];
  multiple?: boolean;
  pattern?: string | null;
  min?: string | null;
  max?: string | null;
  placeholder?: string | null;
  semantic_type?: SemanticType | null;
  validation?: ValidationRules | null;
  output_script?: OutputScript;
};

export const fieldLabel = (f: AgentField) => f.clean_label || f.label || f.field_key;

// ---------- pure tool bodies (unit-tested) ----------

export function matchOptionForField(fields: Map<string, AgentField>, fieldKey: string, spoken: string) {
  const field = fields.get(fieldKey);
  if (!field) return { error: `Unknown field_key "${fieldKey}"` };
  if (!field.options.length) return { error: `Field "${fieldKey}" has no options` };
  const m = matchOption(spoken, field.options);
  return {
    best: m.option?.label ?? null,
    score: Number(m.score.toFixed(2)),
    ambiguous: m.score - m.runner_up < 0.05,
    top: m.top.map((t) => ({ label: t.option.label, score: Number(t.score.toFixed(2)) })),
  };
}

export function validateForField(fields: Map<string, AgentField>, fieldKey: string, value: string) {
  const field = fields.get(fieldKey);
  if (!field) return { ok: false as const, error: `Unknown field_key "${fieldKey}"` };
  return validateValue({ ...field, label: fieldLabel(field), required: false }, value);
}

// ---------- agent tools ----------

export function mapperTools(fieldList: AgentField[]) {
  const fields = new Map(fieldList.map((f) => [f.field_key, f]));
  return [
    tool({
      name: 'normalize_value',
      description:
        'Normalize a raw spoken value for a semantic type: phones to digits, spoken emails to addresses, dates to YYYY-MM-DD, number words to digits.',
      parameters: z.object({ semantic_type: SemanticType, raw: z.string() }),
      execute: async ({ semantic_type, raw }) => normalizeValue(semantic_type, raw),
    }),
    tool({
      name: 'match_option',
      description:
        'Fuzzy-match a spoken value against the options of a select/radio/checkbox field. Returns the best option label, its score (0-1) and the top 3.',
      parameters: z.object({ field_key: z.string(), spoken: z.string() }),
      execute: async ({ field_key, spoken }) => JSON.stringify(matchOptionForField(fields, field_key, spoken)),
    }),
    tool({
      name: 'validate_value',
      description:
        'Check a candidate value against the field type, options and validation rules. Returns {ok, value} with the normalized value, or {ok:false, error}. Call this for every value before finalizing.',
      parameters: z.object({ field_key: z.string(), value: z.string() }),
      execute: async ({ field_key, value }) => JSON.stringify(validateForField(fields, field_key, value)),
    }),
  ];
}

export function analyzerTools(fieldList: FieldDescriptor[]) {
  const fields = new Map(fieldList.map((f) => [f.field_key, f]));
  return [
    tool({
      name: 'get_field_context',
      description: 'Get the full details of one field: label, placeholder, pattern, min/max, all options and nearby text.',
      parameters: z.object({ field_key: z.string() }),
      execute: async ({ field_key }) => {
        const f = fields.get(field_key);
        return f ? JSON.stringify(f) : JSON.stringify({ error: `Unknown field_key "${field_key}"` });
      },
    }),
  ];
}
