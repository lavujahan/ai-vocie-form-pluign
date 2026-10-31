import { describe, expect, it } from 'vitest';
import { MAX_LATEST_FORMS, QueueSessionRequest } from '@vff/shared';
import { cloneFieldRows, latestForms, type ScannedForm } from '@/lib/queue';

const scan = (id: string, form_name: string, created_at: string, field_count = 10, page_origin = 'https://exams.example.in'): ScannedForm => ({
  id,
  form_name,
  page_origin,
  created_at,
  field_count,
});

describe('Latest forms', () => {
  it('lists each form once, last used first', () => {
    const forms = latestForms([
      scan('a', 'Exam application', '2026-10-30T10:00:00Z'),
      scan('b', 'Scholarship', '2026-10-31T10:00:00Z'),
      scan('c', 'Exam application', '2026-10-31T09:00:00Z'),
    ]);
    expect(forms.map((f) => f.form_name)).toEqual(['Scholarship', 'Exam application']);
    expect(forms[1].last_used_at).toBe('2026-10-31T09:00:00Z');
  });

  it('copies from the scan with the most fields, so a wizard keeps its later steps', () => {
    const [form] = latestForms([
      scan('first-step-only', 'Exam application', '2026-10-31T10:00:00Z', 8),
      scan('whole-wizard', 'Exam application', '2026-10-30T10:00:00Z', 23),
    ]);
    expect(form).toMatchObject({ source_id: 'whole-wizard', field_count: 23, last_used_at: '2026-10-31T10:00:00Z' });
  });

  it('takes the newest scan when the field counts are equal', () => {
    const [form] = latestForms([scan('old', 'Exam application', '2026-10-29T10:00:00Z'), scan('new', 'Exam application', '2026-10-31T10:00:00Z')]);
    expect(form.source_id).toBe('new');
  });

  it('keeps forms of the same name on different sites apart', () => {
    const forms = latestForms([
      scan('a', 'Application', '2026-10-31T10:00:00Z', 10, 'https://a.example.in'),
      scan('b', 'Application', '2026-10-31T09:00:00Z', 10, 'https://b.example.in'),
    ]);
    expect(forms).toHaveLength(2);
  });

  it('leaves out a scan with no fields, and stops at the limit', () => {
    expect(latestForms([scan('a', 'Empty', '2026-10-31T10:00:00Z', 0)])).toEqual([]);
    const many = Array.from({ length: MAX_LATEST_FORMS + 3 }, (_, i) => scan(`s${i}`, `Form ${i}`, `2026-10-${10 + i}T10:00:00Z`));
    const forms = latestForms(many);
    expect(forms).toHaveLength(MAX_LATEST_FORMS);
    expect(forms[0].form_name).toBe(`Form ${MAX_LATEST_FORMS + 2}`);
  });
});

describe('copying a form for a new QR code', () => {
  const row = {
    id: 'old-field',
    session_id: 'old-session',
    field_key: 'txtName',
    label_ta: 'பெயர்',
    position: 3,
    context: 'Welcome Ramesh Kumar, application 4821',
    choice_hint: { spoken: 'Erode', top: [], reason: 'no_match' },
  };

  it('keeps the form but gets a new row in the new session', () => {
    const [copy] = cloneFieldRows([row], 'new-session');
    expect(copy).toMatchObject({ session_id: 'new-session', field_key: 'txtName', label_ta: 'பெயர்', position: 3 });
    expect(copy).not.toHaveProperty('id');
  });

  it('carries nothing over from the last applicant', () => {
    const [copy] = cloneFieldRows([row], 'new-session');
    expect(copy.context).toBeNull();
    expect(copy.choice_hint).toBeNull();
  });
});

describe('a request for a new QR code', () => {
  const source_id = '4f7c1c1e-7c1a-4b52-9a11-0f6f0d4a7b10';

  it('is a voice form unless typing only is asked for', () => {
    expect(QueueSessionRequest.parse({ source_id }).voice).toBe(true);
    expect(QueueSessionRequest.parse({ source_id, voice: false }).voice).toBe(false);
  });

  it('needs a session id', () => {
    expect(() => QueueSessionRequest.parse({ source_id: 'x' })).toThrow();
  });
});
