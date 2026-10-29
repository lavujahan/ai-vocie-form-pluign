import { AgentsError, type Model, type ModelSettings, type Usage } from '@openai/agents';

/** Token usage of one agent run (all its model requests), for billing. `ok` = the run produced output. */
export type AgentRunUsage = { usage: Usage; model: string; ok: boolean };
export type OnUsage = (run: AgentRunUsage) => void;

/** Name for billing: "gpt-5-mini@minimal" → "gpt-5-mini". */
export function modelName(model: Model | string): string {
  return typeof model === 'string' ? parseModelSpec(model).model : 'custom';
}

export type AgentStep = 'mapper' | 'analyzer' | 'resolver' | 'translator';
type Effort = NonNullable<NonNullable<ModelSettings['reasoning']>['effort']>;

const STEP_ENV: Record<AgentStep, string> = {
  mapper: 'MAPPER_MODEL',
  analyzer: 'ANALYZER_MODEL',
  resolver: 'RESOLVER_MODEL',
  translator: 'TRANSLATOR_MODEL',
};
/**
 * Used when no MAPPER_MODEL / ANALYZER_MODEL / RESOLVER_MODEL / AGENT_MODEL is set. Chosen with
 * a comparison on real recordings (English and Tamil; docs/ai-model-plan.md): as accurate as gpt-4o for about a tenth of the cost.
 */
export const DEFAULT_AGENT_MODEL = 'gpt-5.4-mini@low';

/**
 * Per step: the most output tokens (reasoning included) and the longest wait. A reply that runs away
 * (seen with gpt-4.1-mini: 4 minutes until the 32k-token limit) fails fast instead of costing and waiting.
 */
export const STEP_LIMITS: Record<AgentStep, { maxTokens: number; timeoutMs: number }> = {
  mapper: { maxTokens: 4_000, timeoutMs: 30_000 }, // about 850 used for a whole form
  analyzer: { maxTokens: 16_000, timeoutMs: 90_000 }, // big forms: many fields, each with a Tamil label
  resolver: { maxTokens: 2_000, timeoutMs: 20_000 }, // picks one option
  translator: { maxTokens: 1_500, timeoutMs: 15_000 }, // a label or a short phrase, as the user types
};

/** "gpt-5-mini@minimal" → model and reasoning effort (the part after @ is optional). */
export function parseModelSpec(spec: string): { model: string; effort: Effort | null } {
  const [model, effort] = spec.trim().split('@');
  return { model: model.trim(), effort: (effort?.trim() as Effort) || null };
}

/** GPT-5 family and o-series models reason before answering (billed as output tokens). */
export const isReasoningModel = (model: string) => /^(gpt-5|o\d)/i.test(model.trim());

/**
 * These steps need a quick answer, not long thinking: reasoning models run at the lowest effort they
 * accept. gpt-5 / -mini / -nano accept "minimal"; later GPT-5.x versions start at "low" here, which
 * every reasoning model accepts ("none" can be tried with a spec like "gpt-5.4-mini@none").
 */
function defaultEffort(model: string): Effort | null {
  if (!isReasoningModel(model)) return null;
  return /^gpt-5(-mini|-nano)?(-\d{4}-\d{2}-\d{2})?$/i.test(model) ? 'minimal' : 'low';
}

/**
 * The model for one AI step and its settings: MAPPER_MODEL / ANALYZER_MODEL / RESOLVER_MODEL / TRANSLATOR_MODEL, else
 * AGENT_MODEL, else the default. AGENT_REASONING sets the reasoning effort for all reasoning models.
 * A Model object (tests) is used as it is. Every step gets its STEP_LIMITS.
 *
 * Prompt caching: OpenAI bills a repeated prompt start (the instructions, the form's fields) at 10%.
 * `prompt_cache_key` sends requests with the same start to the same cache (`cacheKey`: e.g. the form),
 * and GPT-5.x keeps cached starts up to 24 h, so the first recording after a quiet hour is cheap too.
 */
export function agentModel(
  step: AgentStep,
  override?: Model | string,
  cacheKey?: string,
): { model: Model | string; modelSettings: ModelSettings; timeoutMs: number } {
  const { maxTokens, timeoutMs } = STEP_LIMITS[step];
  if (override && typeof override !== 'string') return { model: override, modelSettings: { maxTokens }, timeoutMs };
  const spec = override || process.env[STEP_ENV[step]] || process.env.AGENT_MODEL || DEFAULT_AGENT_MODEL;
  const { model, effort } = parseModelSpec(spec);
  const chosen = effort ?? ((process.env.AGENT_REASONING || null) as Effort | null) ?? defaultEffort(model);
  const reasoning = isReasoningModel(model) && chosen ? { reasoning: { effort: chosen } } : {};
  const retention = /^gpt-5\.\d/i.test(model) ? { promptCacheRetention: '24h' as const } : {};
  return {
    model,
    modelSettings: { maxTokens, ...reasoning, ...retention, providerData: { prompt_cache_key: `${step}:${cacheKey ?? 'all'}` } },
    timeoutMs,
  };
}

/**
 * Runs an agent and reports its token usage, also when the run fails after reaching the model
 * (output guardrail, max turns, a tool error): those tokens are billed too.
 */
export async function runWithUsage<T extends { runContext: { usage: Usage } }>(
  onUsage: OnUsage | undefined,
  model: string,
  fn: () => Promise<T>,
): Promise<T> {
  const report = (usage: Usage | undefined, ok: boolean) => {
    if (!onUsage || !usage || usage.requests === 0) return;
    try {
      onUsage({ usage, model, ok });
    } catch (e) {
      console.warn('usage report failed', e);
    }
  };
  try {
    const result = await fn();
    report(result.runContext.usage, true);
    return result;
  } catch (e) {
    if (e instanceof AgentsError) report(e.state?.usage, false);
    throw e;
  }
}
