import { AgentsError, type Model, type Usage } from '@openai/agents';

/** Token usage of one agent run (all its model requests), for billing. `ok` = the run produced output. */
export type AgentRunUsage = { usage: Usage; model: string; ok: boolean };
export type OnUsage = (run: AgentRunUsage) => void;

export function modelName(model: Model | string): string {
  return typeof model === 'string' ? model : 'custom';
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
