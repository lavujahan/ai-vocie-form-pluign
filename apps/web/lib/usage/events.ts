import type { Usage } from '@openai/agents';
import type { AgentRunUsage } from '../agents/usage';
import { openaiCostUsd } from './pricing';

export type UsageKind = 'stt' | 'map' | 'analyze' | 'resolve';

/** One row of usage_events: a paid Sarvam or OpenAI call. */
export type UsageEvent = {
  user_id: string | null;
  session_id: string | null;
  utterance_id?: string | null;
  kind: UsageKind;
  provider: 'sarvam' | 'openai';
  model: string;
  ok: boolean;
  audio_ms?: number | null;
  requests?: number;
  input_tokens?: number;
  cached_input_tokens?: number;
  output_tokens?: number;
  cost_usd?: number | null;
};

export type UsageOwner = { user_id: string | null; session_id: string | null; utterance_id?: string | null };

/** Cached input tokens across all requests of a run (they are part of the input tokens). */
export function cachedTokens(usage: Usage): number {
  return usage.inputTokensDetails.reduce((sum, d) => sum + (typeof d?.cached_tokens === 'number' ? d.cached_tokens : 0), 0);
}

export function openaiEvent(owner: UsageOwner, kind: UsageKind, run: AgentRunUsage): UsageEvent {
  const input = run.usage.inputTokens;
  const cached = cachedTokens(run.usage);
  const output = run.usage.outputTokens;
  return {
    ...owner,
    kind,
    provider: 'openai',
    model: run.model,
    ok: run.ok,
    requests: run.usage.requests,
    input_tokens: input,
    cached_input_tokens: cached,
    output_tokens: output,
    cost_usd: openaiCostUsd(run.model, { input, cached, output }),
  };
}

export function sttEvent(owner: UsageOwner, model: string, audioMs: number | null): UsageEvent {
  return { ...owner, kind: 'stt', provider: 'sarvam', model, ok: true, audio_ms: audioMs };
}
