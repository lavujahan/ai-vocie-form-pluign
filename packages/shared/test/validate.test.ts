import { describe, expect, it } from 'vitest';
import { validateValue, type ValidatableField } from '../src';

const base: ValidatableField = { label: 'X', field_type: 'text', required: false, options: [] };

describe('validateValue', () => {
  it('enforces required', () => {
    expect(validateValue({ ...base, required: true }, '').ok).toBe(false);
    expect(validateValue(base, null)).toEqual({ ok: true, value: '' });
  });
  it('checks email and phone', () => {
    expect(validateValue({ ...base, field_type: 'email' }, 'a@b.com').ok).toBe(true);
    expect(validateValue({ ...base, field_type: 'email' }, 'a@b').ok).toBe(false);
    expect(validateValue({ ...base, field_type: 'tel' }, '12').ok).toBe(false);
  });
  it('resolves select options to their label', () => {
    const f: ValidatableField = {
      ...base,
      field_type: 'select',
      options: [
        { value: 'tn', label: 'Tamil Nadu' },
        { value: 'kl', label: 'Kerala' },
      ],
    };
    expect(validateValue(f, 'tamilnadu')).toEqual({ ok: true, value: 'Tamil Nadu' });
    expect(validateValue(f, 'Goa').ok).toBe(false);
  });
  it('handles checkbox groups and single checkboxes', () => {
    const group: ValidatableField = {
      ...base,
      field_type: 'checkbox',
      multiple: true,
      options: [
        { value: 'sms', label: 'SMS' },
        { value: 'email', label: 'Email' },
      ],
    };
    expect(validateValue(group, 'email, sms')).toEqual({ ok: true, value: 'Email, SMS' });
    expect(validateValue({ ...base, field_type: 'checkbox' }, 'yes')).toEqual({ ok: true, value: 'true' });
  });
  it('normalizes dates and checks ranges', () => {
    const f: ValidatableField = { ...base, field_type: 'date', min: '2000-01-01' };
    expect(validateValue(f, '15/03/2001')).toEqual({ ok: true, value: '2001-03-15' });
    expect(validateValue(f, '15/03/1990').ok).toBe(false);
  });
  it('applies semantic and analyzer rules', () => {
    expect(validateValue({ ...base, semantic_type: 'pincode' }, '60001').ok).toBe(false);
    expect(
      validateValue(
        { ...base, validation: { regex: '[A-Z]{3}', min_length: null, max_length: null, format: 'ABC' } },
        'abc',
      ).ok,
    ).toBe(false);
  });
});
