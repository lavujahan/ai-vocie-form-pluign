import { describe, expect, it } from 'vitest';
import type { FormAnalysis, FormSchema } from '@vff/shared';
import { sanitizeAnalysis } from '@/lib/agents/formAnalyzer';
import { uploadName } from '@/lib/files/fields';

const field = (field_key: string, field_type: 'text' | 'file', accept: string | null = null) => ({
  field_key,
  label: field_key,
  field_type,
  required: false,
  options: [],
  multiple: false,
  dynamic_options: false,
  group_key: null,
  depends_on: null,
  step_index: 0,
  min: null,
  max: null,
  pattern: null,
  placeholder: null,
  min_length: null,
  max_length: null,
  title: null,
  inputmode: null,
  context: null,
  accept,
});

describe('upload fields', () => {
  it('keeps upload rules only for upload fields, and the accept attribute wins over the AI', () => {
    const schema = { page_url: 'https://x.test/', page_title: 'X', form_title: null, html_snippet: '', fields: [field('cert', 'file', '.pdf'), field('name', 'text')] } satisfies FormSchema;
    const rules = { kind: 'document', formats: ['jpg'], max_kb: 1024, min_kb: null, max_pages: 3, width_px: null, height_px: null, shape: null, note: 'self-attested' } as const;
    const base = { clean_label: 'X', semantic_type: 'other', required: false, validation: { regex: null, min_length: null, max_length: null, format: null }, depends_on: null, step_index: 0, output_script: 'en', label_ta: '' } as const;
    const analysis: FormAnalysis = {
      form_purpose: 'Certificate',
      fields: [
        { ...base, field_key: 'cert', file_rules: { ...rules, formats: [...rules.formats] } },
        { ...base, field_key: 'name', file_rules: { ...rules, formats: [...rules.formats] } },
      ],
    };
    const [cert, name] = sanitizeAnalysis(analysis, schema);
    expect(cert.file_rules).toMatchObject({ formats: ['pdf'], max_kb: 1024, max_pages: 3, note: 'self-attested' });
    expect(name.file_rules).toBeNull();
  });

  it('gives the website a clean file name from the field label', () => {
    expect(uploadName({ label: 'Applicant Photo *', clean_label: 'Applicant photo', field_key: 'p' }, 'IMG_2031.jpg', 'jpg')).toBe('Applicant_photo.jpg');
    expect(uploadName({ label: 'சான்றிதழ்', clean_label: null, field_key: 'cert' }, 'scan.pdf', 'pdf')).toBe('scan.pdf');
  });
});
