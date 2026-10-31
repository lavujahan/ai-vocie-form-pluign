import { describe, expect, it } from 'vitest';
import { MAX_LATEST_FORMS, QueueSessionRequest } from '@vff/shared';
import { cloneFieldRows, latestForms, type OperatorForm } from '@/lib/queue';

const form = (form_name: string, last_used_at: string, uses = 1, page_url = 'https://exams.example.in/apply/form'): OperatorForm => ({
  fingerprint: `fp-${form_name}`,
  form_name,
  page_url,
  uses,
  last_used_at,
  source_id: `session-${form_name}`,
  field_count: 10,
});

describe('Latest forms', () => {
  it('puts the most used form first', () => {
    const forms = latestForms([form('Scholarship', '2026-10-31T10:00:00Z', 1), form('Exam application', '2026-10-30T10:00:00Z', 7)]);
    expect(forms.map((f) => [f.form_name, f.uses])).toEqual([
      ['Exam application', 7],
      ['Scholarship', 1],
    ]);
  });

  it('puts the form used last first when forms are used equally', () => {
    const forms = latestForms([form('Older', '2026-10-30T10:00:00Z', 2), form('Newer', '2026-10-31T10:00:00Z', 2)]);
    expect(forms.map((f) => f.form_name)).toEqual(['Newer', 'Older']);
  });

  it('shows each form memory row as it comes, with the session a QR code copies', () => {
    expect(latestForms([form('Exam application', '2026-10-31T10:00:00Z', 3)])).toEqual([
      {
        source_id: 'session-Exam application',
        form_name: 'Exam application',
        page_origin: 'https://exams.example.in',
        field_count: 10,
        uses: 3,
        last_used_at: '2026-10-31T10:00:00Z',
      },
    ]);
  });

  it('keeps a form scanned just now when the most used forms fill the list', () => {
    const busy = Array.from({ length: MAX_LATEST_FORMS }, (_, i) => form(`Busy ${i}`, `2026-10-${10 + i}T10:00:00Z`, 5));
    const forms = latestForms([...busy, form('Just scanned', '2026-10-31T10:00:00Z', 1)]);
    expect(forms).toHaveLength(MAX_LATEST_FORMS);
    expect(forms.at(-1)).toMatchObject({ form_name: 'Just scanned', uses: 1 });
  });

  it('stops at the limit', () => {
    const many = Array.from({ length: MAX_LATEST_FORMS + 3 }, (_, i) => form(`Form ${i}`, `2026-10-${10 + i}T10:00:00Z`));
    const forms = latestForms(many);
    expect(forms).toHaveLength(MAX_LATEST_FORMS);
    expect(forms[0].form_name).toBe(`Form ${MAX_LATEST_FORMS + 2}`);
  });

  it('has nothing to show for an operator with no forms', () => {
    expect(latestForms([])).toEqual([]);
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
