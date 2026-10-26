import { Agent, run, setTracingDisabled, type Model } from '@openai/agents';
import { z } from 'zod';
import { matchOption, type FieldOption, type ResolveOptionResponse } from '@vff/shared';
import { agentModel, modelName, runWithUsage, type OnUsage } from './usage';

setTracingDisabled(process.env.NODE_ENV === 'production');

/**
 * Option Resolver Agent: a dropdown's options were loaded on the page (e.g. Taluks of Salem), and
 * the spoken value didn't clearly match one. The AI decides which option was meant, by meaning and
 * sound (Tamil/English spellings, transliteration variants), or says it is ambiguous.
 */
export const RESOLVER_INSTRUCTIONS = `You match a spoken answer to one option of a dropdown on an Indian government or business form.
The spoken value may be English, Tamil, Tanglish or a transliteration (Tiruvallur = Thiruvallur, Kanchipuram = Kancheepuram, Omalur = Omaloor). Ignore case, spaces, punctuation and suffixes like "(Rural)" unless they distinguish options.

Return:
- choice: the EXACT label of the option that was meant, copied from the list; null if none fits or two or more fit equally well.
- ambiguous: true when two or more options are plausible. A value that matches one option's WHOLE name is not ambiguous just because another option starts with the same name: "Tulasampatti" → "Thulasampatti", not "Thulasampatti Pudur". But a partial value like "Tulasam" fits both and is ambiguous.
- top: up to 5 most likely option labels, best first (exact labels from the list). Empty if nothing is close.
Never invent an option that isn't in the list.`;

const Output = z.object({
  choice: z.string().nullable(),
  ambiguous: z.boolean(),
  top: z.array(z.string()),
});

/** Long lists are narrowed to the closest candidates first; the AI then decides among them. */
const MAX_OPTIONS = 400;

export async function resolveOption(
  input: { label: string; spoken: string; options: FieldOption[] },
  opts: { model?: Model | string; onUsage?: OnUsage } = {},
): Promise<ResolveOptionResponse> {
  let options = input.options;
  if (options.length > MAX_OPTIONS) {
    const ranked = matchOption(input.spoken, options).top; // top 3 by spelling
    const scored = options
      .map((o) => ({ o, s: matchOption(input.spoken, [o]).score }))
      .sort((a, b) => b.s - a.s)
      .slice(0, MAX_OPTIONS)
      .map((x) => x.o);
    options = [...new Map([...ranked.map((r) => r.option), ...scored].map((o) => [o.label, o])).values()];
  }

  const { model, modelSettings, timeoutMs } = agentModel('resolver', opts.model);
  const agent = new Agent({
    name: 'Option Resolver Agent',
    instructions: RESOLVER_INSTRUCTIONS,
    model,
    modelSettings,
    outputType: Output,
  });
  const prompt = `Field: ${input.label}\nSpoken value: ${JSON.stringify(input.spoken)}\nOptions:\n${options.map((o) => `- ${o.label}`).join('\n')}`;
  const result = await runWithUsage(opts.onUsage, modelName(model), () => run(agent, prompt, { maxTurns: 2, signal: AbortSignal.timeout(timeoutMs) }));
  const out = result.finalOutput;
  if (!out) return { choice: null, ambiguous: false, top: [] };

  // Only exact labels from the list survive.
  const labels = new Set(input.options.map((o) => o.label));
  const top = out.top.filter((l) => labels.has(l)).slice(0, 5);
  const choice = out.choice && labels.has(out.choice) && !out.ambiguous ? out.choice : null;
  return { choice, ambiguous: out.ambiguous || (!choice && top.length > 1), top: choice && !top.includes(choice) ? [choice, ...top] : top };
}
