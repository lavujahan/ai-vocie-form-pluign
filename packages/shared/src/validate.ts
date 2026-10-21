import { matchOption, normalizeBoolean, normalizeDate } from './normalize';
import type { FieldOption, FieldType, SemanticType, ValidationRules } from './schemas';

export type ValidatableField = {
  label: string;
  field_type: FieldType;
  required: boolean;
  options: FieldOption[];
  multiple?: boolean;
  pattern?: string | null;
  min?: string | null;
  max?: string | null;
  semantic_type?: SemanticType | null;
  validation?: ValidationRules | null;
};

export type ValidationResult = { ok: true; value: string } | { ok: false; error: string };

/** Minimum option-match score to accept a spoken value for a select/radio. */
export const OPTION_ACCEPT_SCORE = 0.75;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const SEMANTIC_RE: Partial<Record<SemanticType, [RegExp, string]>> = {
  pincode: [/^\d{6}$/, 'PIN code must be 6 digits'],
  gst: [/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, 'GST number must look like 22AAAAA0000A1Z5'],
  pan: [/^[A-Z]{5}\d{4}[A-Z]$/, 'PAN must look like ABCDE1234F'],
  aadhaar: [/^\d{12}$/, 'Aadhaar must be 12 digits'],
};

function safeRegex(src: string): RegExp | null {
  try {
    return new RegExp(`^(?:${src})$`, 'u');
  } catch {
    return null;
  }
}

/**
 * Checks a value against a field's type, options and rules.
 * For choice fields the returned value is the canonical option label.
 */
export function validateValue(field: ValidatableField, raw: string | null): ValidationResult {
  const value = (raw ?? '').trim();
  if (!value) {
    return field.required ? { ok: false, error: `${field.label || 'This field'} is required` } : { ok: true, value: '' };
  }

  // Choice fields: the value must resolve to one of the options.
  if ((field.field_type === 'select' || field.field_type === 'radio' || field.field_type === 'combobox') && field.options.length) {
    const m = matchOption(value, field.options);
    if (!m.option || m.score < OPTION_ACCEPT_SCORE) {
      return { ok: false, error: `"${value}" is not one of: ${field.options.map((o) => o.label).slice(0, 15).join(', ')}` };
    }
    return { ok: true, value: m.option.label };
  }

  if (field.field_type === 'checkbox') {
    if (field.multiple && field.options.length) {
      const picked: string[] = [];
      for (const part of value.split(/\s*[,;]\s*/).filter(Boolean)) {
        const m = matchOption(part, field.options);
        if (!m.option || m.score < OPTION_ACCEPT_SCORE) return { ok: false, error: `"${part}" is not an option` };
        if (!picked.includes(m.option.label)) picked.push(m.option.label);
      }
      return { ok: true, value: picked.join(', ') };
    }
    const b = normalizeBoolean(value);
    return b ? { ok: true, value: b } : { ok: false, error: 'Checkbox value must be yes or no' };
  }

  if (field.field_type === 'date' || field.semantic_type === 'date' || field.semantic_type === 'date_of_birth') {
    const iso = normalizeDate(value);
    if (!iso) return { ok: false, error: `"${value}" is not a valid date` };
    if (field.min && iso < field.min) return { ok: false, error: `Date must be on or after ${field.min}` };
    if (field.max && iso > field.max) return { ok: false, error: `Date must be on or before ${field.max}` };
    return { ok: true, value: iso };
  }

  if (field.field_type === 'email' || field.semantic_type === 'email') {
    if (!EMAIL_RE.test(value)) return { ok: false, error: `"${value}" is not a valid email` };
  }

  if (field.field_type === 'tel' || field.semantic_type === 'phone') {
    const digits = value.replace(/[^\d]/g, '');
    if (digits.length < 6 || digits.length > 15) return { ok: false, error: 'Phone number must have 6–15 digits' };
  }

  if (field.field_type === 'number' || field.semantic_type === 'number') {
    const n = Number(value);
    if (!Number.isFinite(n)) return { ok: false, error: `"${value}" is not a number` };
    if (field.min && n < Number(field.min)) return { ok: false, error: `Must be at least ${field.min}` };
    if (field.max && n > Number(field.max)) return { ok: false, error: `Must be at most ${field.max}` };
  }

  const sem = field.semantic_type ? SEMANTIC_RE[field.semantic_type] : undefined;
  if (sem && !sem[0].test(value)) return { ok: false, error: sem[1] };

  if (field.pattern) {
    const re = safeRegex(field.pattern);
    if (re && !re.test(value)) return { ok: false, error: `Doesn't match the required format` };
  }

  const rules = field.validation;
  if (rules) {
    if (rules.regex) {
      const re = safeRegex(rules.regex);
      if (re && !re.test(value)) return { ok: false, error: `Doesn't match the format ${rules.format ?? ''}`.trim() };
    }
    if (rules.min_length != null && value.length < rules.min_length) {
      return { ok: false, error: `Must be at least ${rules.min_length} characters` };
    }
    if (rules.max_length != null && value.length > rules.max_length) {
      return { ok: false, error: `Must be at most ${rules.max_length} characters` };
    }
  }

  return { ok: true, value };
}
