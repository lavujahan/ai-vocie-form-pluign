/**
 * OpenAI list prices, USD per 1M tokens (standard tier).
 * Source: https://developers.openai.com/api/docs/pricing (checked 2026-10-23).
 * Sarvam speech-to-text is priced per minute in ₹ and set by the admin (billing_settings);
 * list price ₹0.49/min pay-as-you-go, https://www.sarvam.ai/api-pricing.
 */
export const OPENAI_USD_PER_M: Record<string, { input: number; cached: number; output: number }> = {
  'gpt-4o': { input: 2.5, cached: 1.25, output: 10 },
  'gpt-4o-mini': { input: 0.15, cached: 0.075, output: 0.6 },
  'gpt-4.1': { input: 2, cached: 0.5, output: 8 },
  'gpt-4.1-mini': { input: 0.4, cached: 0.1, output: 1.6 },
  'gpt-4.1-nano': { input: 0.1, cached: 0.025, output: 0.4 },
};

export type TokenCounts = { input: number; cached: number; output: number };

/** "gpt-4o-2024-08-06" → "gpt-4o": dated snapshots cost the same as the alias. */
export function baseModel(model: string): string {
  return model.trim().toLowerCase().replace(/-\d{4}-\d{2}-\d{2}$/, '');
}

/** Cost of one run in USD; cached input tokens are part of `input` and billed at the cached rate. null = unknown model. */
export function openaiCostUsd(model: string, t: TokenCounts): number | null {
  const p = OPENAI_USD_PER_M[baseModel(model)];
  if (!p) return null;
  const cached = Math.min(t.cached, t.input);
  return ((t.input - cached) * p.input + cached * p.cached + t.output * p.output) / 1e6;
}
