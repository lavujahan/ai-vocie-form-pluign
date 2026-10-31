import type { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dictationConfig, tamilDigits } from '@/lib/sarvam/stt';

const mocks = vi.hoisted(() => ({
  assertCanUse: vi.fn(),
  recordUsage: vi.fn(),
  requireUser: vi.fn(),
  transcribe: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ requireUser: mocks.requireUser }));
vi.mock('@/lib/billing/plans', () => ({ assertCanUse: mocks.assertCanUse }));
vi.mock('@/lib/usage/record', () => ({ recordUsage: mocks.recordUsage }));
vi.mock('@/lib/sarvam/stt', async (original) => ({
  ...(await original<typeof import('@/lib/sarvam/stt')>()),
  transcribe: mocks.transcribe,
}));

const { POST } = await import('@/app/api/dictate/route');
const { fail } = await import('@/lib/http');

function post(fields: { part?: string; duration_ms?: string; audio?: Blob | null } = {}) {
  const form = new FormData();
  const audio = fields.audio === undefined ? new Blob([new Uint8Array([1, 2])], { type: 'audio/webm' }) : fields.audio;
  if (audio) form.append('audio', audio);
  form.append('part', fields.part ?? '0');
  if (fields.duration_ms !== '') form.append('duration_ms', fields.duration_ms ?? '24000');
  return POST(new Request('http://x/api/dictate', { method: 'POST', body: form }) as unknown as NextRequest, undefined);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ id: 'u1', role: 'user' });
  mocks.assertCanUse.mockResolvedValue(undefined);
  mocks.transcribe.mockResolvedValue('வணக்கம்');
});

describe('POST /api/dictate', () => {
  it('returns the Tamil and counts the seconds for the user, with no form', async () => {
    const res = await post();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ text: 'வணக்கம்' });
    expect(mocks.recordUsage).toHaveBeenCalledOnce();
    expect(mocks.recordUsage.mock.calls[0][0][0]).toMatchObject({ user_id: 'u1', session_id: null, kind: 'stt', audio_ms: 24000 });
  });

  it('asks Sarvam for Tamil script', async () => {
    await post();
    expect(mocks.transcribe.mock.calls[0][2]).toMatchObject({ mode: 'transcribe', language: 'ta-IN' });
  });

  it('never counts more than the longest piece Sarvam takes', async () => {
    await post({ duration_ms: '900000' });
    expect(mocks.recordUsage.mock.calls[0][0][0].audio_ms).toBe(30_000);
  });

  it('blocks a new recording with no minutes left, and spends nothing', async () => {
    mocks.assertCanUse.mockRejectedValue(fail(402, 'Used up', { code: 'quota_exceeded' }));
    const res = await post();
    expect(res.status).toBe(402);
    expect((await res.json()).code).toBe('quota_exceeded');
    expect(mocks.transcribe).not.toHaveBeenCalled();
    expect(mocks.recordUsage).not.toHaveBeenCalled();
  });

  it('lets a recording that started finish', async () => {
    mocks.assertCanUse.mockRejectedValue(fail(402, 'Used up'));
    const res = await post({ part: '1' });
    expect(res.status).toBe(200);
    expect(mocks.assertCanUse).not.toHaveBeenCalled();
    expect(mocks.recordUsage).toHaveBeenCalledOnce();
  });

  it('counts nothing when the speech service fails', async () => {
    mocks.transcribe.mockRejectedValue(new Error('nope'));
    const res = await post();
    expect(res.status).toBe(502);
    expect(mocks.recordUsage).not.toHaveBeenCalled();
  });

  it('refuses a piece without its duration, so no speech goes uncounted', async () => {
    expect((await post({ duration_ms: '' })).status).toBe(400);
    expect((await post({ duration_ms: '0' })).status).toBe(400);
    expect(mocks.transcribe).not.toHaveBeenCalled();
  });

  it('refuses a piece without audio', async () => {
    expect((await post({ audio: null })).status).toBe(400);
  });
});

describe('tamilDigits', () => {
  it('writes a spoken phone number in digits', () => {
    expect(tamilDigits('என் நம்பர் ஒன்பது எட்டு ஏழு ஆறு ஐந்து நான்கு மூன்று இரண்டு ஒன்று பூஜ்ஜியம்.')).toBe('என் நம்பர் 9876543210.');
  });

  it('understands the spoken forms of the words', () => {
    expect(tamilDigits('ரெண்டு மூணு நாலு அஞ்சு ஒண்ணு')).toBe('23451');
  });

  it('leaves one or two number words alone', () => {
    expect(tamilDigits('ஒன்று இரண்டு நாட்கள்')).toBe('ஒன்று இரண்டு நாட்கள்');
    expect(tamilDigits('ஆறு ஓடுகிறது')).toBe('ஆறு ஓடுகிறது');
  });

  it('does not touch longer words that start like a number', () => {
    expect(tamilDigits('ஒன்று இரண்டு மூன்றாவது')).toBe('ஒன்று இரண்டு மூன்றாவது');
  });
});

describe('dictationConfig', () => {
  it('uses Tamil script whatever the forms use', () => {
    expect(dictationConfig({ model: 'saaras:v3', mode: 'codemix', language: 'unknown' })).toEqual({ model: 'saaras:v3', mode: 'transcribe', language: 'ta-IN' });
  });

  it('sends no mode to a model without modes', () => {
    expect(dictationConfig({ model: 'saaras:v4', mode: '', language: 'ta-IN' }).mode).toBe('');
  });
});
