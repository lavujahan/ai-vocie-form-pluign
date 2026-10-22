import { z } from 'zod';
import { defineTool, type AgentTool } from './runAgent';
import {
  validateValue,
  type SemanticType,
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

/**
 * Checks a value the agent already chose. It never interprets speech (no word lists, no synonyms):
 * it only answers "is this a valid phone / date / one of the options?", so the agent can fix itself.
 */
export function validateForField(fields: Map<string, AgentField>, fieldKey: string, value: string) {
  const field = fields.get(fieldKey);
  if (!field) return { ok: false as const, error: `Unknown field_key "${fieldKey}"` };
  return validateValue({ ...field, label: fieldLabel(field), required: false }, value);
}

// ---------- agent tools ----------

/**
 * The Field Mapping Agent interprets speech itself (language, digits, emails, dates, option choice).
 * Its only tool is a checker, which behaves the same whoever is speaking.
 */
export function mapperTools(fieldList: AgentField[]): AgentTool[] {
  const fields = new Map(fieldList.map((f) => [f.field_key, f]));
  return [
    defineTool({
      name: 'validate_value',
      description:
        'Check a candidate value against the field type, options and validation rules. Returns {ok, value} with the normalized value, or {ok:false, error}. Call this for every value before finalizing.',
      parameters: z.object({ field_key: z.string(), value: z.string() }),
      execute: async ({ field_key, value }) => JSON.stringify(validateForField(fields, field_key, value)),
    }),
  ];
}

export function analyzerTools(fieldList: FieldDescriptor[]): AgentTool[] {
  const fields = new Map(fieldList.map((f) => [f.field_key, f]));
  return [
    defineTool({
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
