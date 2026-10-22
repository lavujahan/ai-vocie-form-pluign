import 'server-only';
import OpenAI, { toFile } from 'openai';
import { normalizeText } from '@vff/shared';
import { env } from '../env';
import type { AgentField } from './tools';

let client: OpenAI | null = null;
const openai = () => (client ??= new OpenAI({ apiKey: env.openaiKey }));

/**
 * A short style hint, written the way we want the transcript to look (Tanglish in English letters).
 * It deliberately does NOT list the form's labels/options: with a long list, gpt-4o-transcribe
 * tends to echo the prompt back as the "transcript" when the audio is short or unclear.
 */
export function transcriptionPrompt(_fields: AgentField[]): string {
  return 'Tamil and English mixed speech, written in English letters. Example: en peru Kavitha Raman, appa peru Raman, ooru Madurai, number 9876501234.';
}

const words = (s: string) => normalizeText(s).split(' ').filter(Boolean);

/**
 * True when the "transcript" is mostly the prompt repeated back (a known failure mode of
 * prompt-conditioned transcription on silence or unclear audio).
 */
export function isPromptEcho(transcript: string, prompt: string): boolean {
  const t = words(transcript);
  const p = words(prompt);
  if (!t.length) return false;
  if (t.length < 3) return t.every((w) => p.includes(w)) && t.join(' ') !== '';
  const grams = (ws: string[]) => {
    const g = new Set<string>();
    for (let i = 0; i + 2 < ws.length; i++) g.add(ws.slice(i, i + 3).join(' '));
    return g;
  };
  const pg = grams(p);
  const tg = [...grams(t)];
  if (!tg.length || !pg.size) return false;
  const shared = tg.filter((g) => pg.has(g)).length;
  // Mostly prompt, AND a real chunk of the prompt reproduced — real speech that happens to
  // share a phrase ("father name …") with the prompt doesn't meet both.
  return shared / tg.length >= 0.5 && shared / pg.size >= 0.3;
}

const EXT: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/mp4': 'mp4',
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'm4a',
};

async function run(file: File, model: string, prompt?: string): Promise<string> {
  const r = await openai().audio.transcriptions.create({ file, model, ...(prompt ? { prompt } : {}) });
  return r.text.trim();
}

/**
 * gpt-4o-transcribe with no forced language (handles code-mixed speech), falling back to whisper-1.
 * Echoed prompts are detected and retried without a prompt; if that is still unusable, returns ''
 * so the caller reports "didn't catch that". The audio is only held in memory for this request.
 */
export async function transcribe(audio: Blob, fields: AgentField[]): Promise<string> {
  const type = audio.type.split(';')[0] || 'audio/webm';
  const file = await toFile(Buffer.from(await audio.arrayBuffer()), `utterance.${EXT[type] ?? 'webm'}`, { type });
  const prompt = transcriptionPrompt(fields);

  let text: string;
  try {
    text = await run(file, env.transcribeModel, prompt);
  } catch (e) {
    if (env.transcribeModel === 'whisper-1') throw e;
    console.warn('primary transcription failed, falling back to whisper-1', e);
    text = await run(file, 'whisper-1', prompt);
  }

  if (isPromptEcho(text, prompt)) {
    console.warn('transcript echoed the prompt; retrying without a prompt');
    text = await run(file, env.transcribeModel);
    if (isPromptEcho(text, prompt)) return '';
  }
  return text;
}
