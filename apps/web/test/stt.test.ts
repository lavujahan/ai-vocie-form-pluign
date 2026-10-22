import { describe, expect, it } from 'vitest';
import { buildKeyterms, buildSttForm } from '@/lib/sarvam/stt';
import type { AgentField } from '@/lib/agents/tools';

const fields: AgentField[] = [
  { field_key: 'name', label: 'Applicant Name', field_type: 'text', required: true, options: [] },
  {
    field_key: 'title',
    label: 'Appellation',
    field_type: 'select',
    required: false,
    options: [
      { value: 'dr', label: 'Dr / டாக்டர்' },
      { value: 'thiru', label: 'Thiru / திரு' },
    ],
  },
  {
    field_key: 'district',
    label: 'District / மாவட்டம்',
    field_type: 'select',
    required: false,
    options: [
      { value: '1', label: 'Salem' },
      { value: '2', label: 'Coimbatore' },
    ],
  },
];

const audio = new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/webm;codecs=opus' });

describe('Sarvam speech-to-text request', () => {
  it('defaults to saaras:v3 codemix in Tamil, without keyterms', () => {
    const form = buildSttForm(audio, fields, { model: 'saaras:v3', mode: 'codemix', language: 'ta-IN' });
    expect(form.get('model')).toBe('saaras:v3');
    expect(form.get('mode')).toBe('codemix');
    expect(form.get('language_code')).toBe('ta-IN');
    expect(form.get('keyterms')).toBeNull();
    expect((form.get('file') as File).name).toBe('utterance.webm');
    // Sarvam rejects "audio/webm;codecs=opus"; the codec suffix must be stripped.
    expect((form.get('file') as File).type).toBe('audio/webm');
    const ios = buildSttForm(new Blob([new Uint8Array([1])], { type: 'audio/mp4;codecs=mp4a.40.2' }), fields);
    expect((ios.get('file') as File).type).toBe('audio/mp4');
    expect((ios.get('file') as File).name).toBe('utterance.mp4');
  });

  it('sends keyterms as one JSON array field on saaras:v4, and omits an empty mode', () => {
    const form = buildSttForm(audio, fields, { model: 'saaras:v4', mode: '', language: 'unknown' });
    expect(form.get('mode')).toBeNull();
    expect(JSON.parse(form.get('keyterms') as string)).toEqual(buildKeyterms(fields));
  });

  it('builds keyterms: options first, bilingual labels split, deduped, capped at 50 × 64 chars', () => {
    expect(buildKeyterms(fields)).toEqual([
      'Dr',
      'டாக்டர்',
      'Thiru',
      'திரு',
      'Salem',
      'Coimbatore',
      'Applicant Name',
      'Appellation',
      'District',
      'மாவட்டம்',
    ]);
    const many: AgentField[] = [
      {
        field_key: 'v',
        label: 'Village',
        field_type: 'select',
        required: false,
        options: Array.from({ length: 80 }, (_, i) => ({ value: String(i), label: `Village ${i}` })).concat({ value: 'x', label: 'x'.repeat(70) }),
      },
    ];
    const terms = buildKeyterms(many);
    expect(terms).toHaveLength(50);
    expect(terms.every((t) => t.length <= 64)).toBe(true);
  });
});
