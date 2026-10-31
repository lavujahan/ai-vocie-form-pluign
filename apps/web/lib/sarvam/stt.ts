import type { AgentField } from '../agents/tools';
import { sarvamPost } from './client';

/** Sarvam's REST speech-to-text is for clips under 30 s; the phone splits longer recordings. */
export const STT_MAX_SECONDS = 30;

export type SttConfig = {
  /** saaras:v3 (modes) or saaras:v4 (keyterms). */
  model: string;
  /** transcribe | translate | verbatim | translit | codemix. Empty string = don't send. */
  mode: string;
  /** BCP-47, e.g. ta-IN, or `unknown` to auto-detect. */
  language: string;
};

export function sttConfig(): SttConfig {
  return {
    model: process.env.SARVAM_STT_MODEL || 'saaras:v3',
    // codemix: English words in English letters, Tamil words in Tamil script, numbers as digits.
    mode: process.env.SARVAM_STT_MODE ?? 'codemix',
    language: process.env.SARVAM_STT_LANGUAGE || 'ta-IN',
  };
}

/**
 * Tamil typing in the popup: Tamil script throughout, not the forms' mix of Tamil and English letters.
 * A model without modes (SARVAM_STT_MODE empty) stays without one.
 */
export function dictationConfig(cfg: SttConfig = sttConfig()): SttConfig {
  return { ...cfg, mode: cfg.mode ? 'transcribe' : '', language: 'ta-IN' };
}

const TAMIL_DIGITS: Record<string, string> = {
  பூஜ்ஜியம்: '0', பூஜ்யம்: '0', சைபர்: '0', ஜீரோ: '0',
  ஒன்று: '1', ஒண்ணு: '1', இரண்டு: '2', ரெண்டு: '2', மூன்று: '3', மூணு: '3', நான்கு: '4', நாலு: '4',
  ஐந்து: '5', அஞ்சு: '5', ஆறு: '6', ஏழு: '7', எட்டு: '8', ஒன்பது: '9',
};
const DIGIT_WORD = Object.keys(TAMIL_DIGITS).join('|');
const DIGIT_RUN = new RegExp(`(?<![\\p{L}\\p{M}])(?:${DIGIT_WORD})(?:\\s+(?:${DIGIT_WORD})){2,}(?![\\p{L}\\p{M}])`, 'gu');

/**
 * Tamil script spells a spoken phone number out ("ஒன்பது எட்டு ஏழு…"): 3 or more number words in a row
 * become digits. Fewer are left alone: "ஒன்று இரண்டு" is usually "one or two", and ஆறு is also a river.
 */
export function tamilDigits(text: string): string {
  return text.replace(DIGIT_RUN, (run) => run.split(/\s+/).map((w) => TAMIL_DIGITS[w]).join(''));
}

const MAX_KEYTERMS = 50;
const MAX_KEYTERM_CHARS = 64;

/**
 * Words to bias recognition toward (saaras:v4 only): option labels first (places, names —
 * the words most often misheard), then field labels. Bilingual labels like "Dr / டாக்டர்" are split.
 */
export function buildKeyterms(fields: AgentField[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (raw: string) => {
    for (const part of raw.split('/')) {
      const t = part.replace(/[*:]/g, '').trim();
      const k = t.toLowerCase();
      if (!t || t.length > MAX_KEYTERM_CHARS || seen.has(k) || /^\d+$/.test(t)) continue;
      seen.add(k);
      out.push(t);
    }
  };
  for (const f of fields) for (const o of f.options) add(o.label);
  for (const f of fields) add(f.clean_label || f.label);
  return out.slice(0, MAX_KEYTERMS);
}

const EXT: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/mp4': 'mp4',
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
};

export function buildSttForm(audio: Blob, fields: AgentField[], cfg: SttConfig = sttConfig()): FormData {
  // Browsers label recordings "audio/webm;codecs=opus"; Sarvam only accepts the bare type ("audio/webm").
  const type = audio.type.split(';')[0].trim() || 'audio/webm';
  const file = new Blob([audio], { type });
  const form = new FormData();
  form.append('file', file, `utterance.${EXT[type] ?? 'webm'}`);
  form.append('model', cfg.model);
  form.append('language_code', cfg.language);
  if (cfg.mode) form.append('mode', cfg.mode);
  if (cfg.model.startsWith('saaras:v4')) {
    const keyterms = buildKeyterms(fields);
    if (keyterms.length) form.append('keyterms', JSON.stringify(keyterms));
  }
  return form;
}

/** Sarvam Saaras speech-to-text. The audio is only held in memory for this request. */
export async function transcribe(audio: Blob, fields: AgentField[], cfg: SttConfig = sttConfig()): Promise<string> {
  const res = await sarvamPost<{ transcript: string; language_code: string | null }>(
    '/speech-to-text',
    buildSttForm(audio, fields, cfg),
  );
  return (res.transcript ?? '').trim();
}
