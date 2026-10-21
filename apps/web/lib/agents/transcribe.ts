import 'server-only';
import OpenAI, { toFile } from 'openai';
import { env } from '../env';
import { fieldLabel, type AgentField } from './tools';

let client: OpenAI | null = null;
const openai = () => (client ??= new OpenAI({ apiKey: env.openaiKey }));

/** Biases recognition toward this form's vocabulary. Kept short: the prompt is a hint, not instructions. */
export function transcriptionPrompt(fields: AgentField[]): string {
  const labels = fields.map(fieldLabel).join(', ');
  const options = [...new Set(fields.flatMap((f) => f.options.map((o) => o.label)))].slice(0, 60).join(', ');
  const text = `Speech may mix Tamil and English (Tanglish). A person is filling a form with: ${labels}.${options ? ` Possible answers: ${options}.` : ''}`;
  return text.slice(0, 900);
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

/**
 * gpt-4o-transcribe with no forced language (handles code-mixed speech), falling back to whisper-1.
 * The audio is only held in memory for this request.
 */
export async function transcribe(audio: Blob, fields: AgentField[]): Promise<string> {
  const type = audio.type.split(';')[0] || 'audio/webm';
  const file = await toFile(Buffer.from(await audio.arrayBuffer()), `utterance.${EXT[type] ?? 'webm'}`, { type });
  const prompt = transcriptionPrompt(fields);
  try {
    const r = await openai().audio.transcriptions.create({ file, model: env.transcribeModel, prompt });
    return r.text.trim();
  } catch (e) {
    if (env.transcribeModel === 'whisper-1') throw e;
    console.warn('primary transcription failed, falling back to whisper-1', e);
    const r = await openai().audio.transcriptions.create({ file, model: 'whisper-1', prompt });
    return r.text.trim();
  }
}
