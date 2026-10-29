import { Agent, run, setTracingDisabled, type Model } from '@openai/agents';
import { z } from 'zod';
import { agentModel, modelName, runWithUsage, type OnUsage } from './usage';

setTracingDisabled(process.env.NODE_ENV === 'production');

/**
 * Tamil helper on the phone page: English form text (a label, a help line, a short phrase) into the
 * Tamil used on Tamil Nadu forms, for the operator to read out or copy. Names keep their sound.
 */
export const TRANSLATOR_INSTRUCTIONS = `You translate English text from Indian government and business forms into Tamil, for an operator helping an applicant in Tamil Nadu.
- Use the plain, standard Tamil that Tamil Nadu government forms use ("Date of birth" → "பிறந்த தேதி", "Father's name" → "தந்தையின் பெயர்", "Mobile number" → "கைபேசி எண்", "Annual income" → "ஆண்டு வருமானம்").
- Names of people, streets, villages, towns and organisations are written in Tamil letters by their sound, never translated ("Ramesh Kumar" → "ரமேஷ் குமார்", "Gandhi Street" → "காந்தி தெரு", "Omalur" → "ஓமலூர்"). Common address words are translated (Street → தெரு, Road → சாலை, Nagar → நகர்).
- Keep numbers, dates, codes (PAN, IFSC, PIN code, Aadhaar), email addresses, web addresses and units exactly as written.
- Keep the meaning and the punctuation. Do not add explanations, quotes or the English text.
- If the text is already Tamil, return it unchanged.
Return only the Tamil text in "tamil".`;

const Output = z.object({ tamil: z.string() });

/** Recent answers on this server instance: the same label ("Date of birth") is asked for again and again. */
const CACHE_SIZE = 500;
const cache = new Map<string, string>();
const keyOf = (text: string) => text.trim().replace(/\s+/g, ' ').toLowerCase();

/** Empties the cache (tests). */
export function clearTranslateCache() {
  cache.clear();
}

export async function translateToTamil(text: string, opts: { model?: Model | string; onUsage?: OnUsage } = {}): Promise<string> {
  const key = keyOf(text);
  if (!key) return '';
  const hit = cache.get(key);
  if (hit !== undefined) {
    // Most recently used goes last, so the oldest is dropped first.
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }

  const { model, modelSettings, timeoutMs } = agentModel('translator', opts.model);
  const agent = new Agent({ name: 'Tamil Translator', instructions: TRANSLATOR_INSTRUCTIONS, model, modelSettings, outputType: Output });
  const result = await runWithUsage(opts.onUsage, modelName(model), () =>
    run(agent, `Text:\n"""${text.trim()}"""`, { maxTurns: 2, signal: AbortSignal.timeout(timeoutMs) }),
  );
  const tamil = result.finalOutput?.tamil.trim() ?? '';
  if (tamil) {
    cache.set(key, tamil);
    if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value!);
  }
  return tamil;
}
