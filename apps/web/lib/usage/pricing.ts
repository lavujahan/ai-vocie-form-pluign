/**
 * OpenAI list prices, USD per 1M tokens (standard tier, short context).
 * Source: https://developers.openai.com/api/docs/pricing (checked 2026-10-25).
 * Sarvam speech-to-text is priced per minute in ₹ and set by the admin (billing_settings);
 * list price ₹0.49/min pay-as-you-go, https://www.sarvam.ai/api-pricing.
 */
export const OPENAI_USD_PER_M: Record<string, { input: number; cached: number; output: number }> = {
  'gpt-4o': { input: 2.5, cached: 1.25, output: 10 },
  'gpt-4o-mini': { input: 0.15, cached: 0.075, output: 0.6 },
  'gpt-4.1': { input: 2, cached: 0.5, output: 8 },
  'gpt-4.1-mini': { input: 0.4, cached: 0.1, output: 1.6 },
  'gpt-4.1-nano': { input: 0.1, cached: 0.025, output: 0.4 },
  'gpt-5': { input: 1.25, cached: 0.125, output: 10 },
  'gpt-5-mini': { input: 0.25, cached: 0.025, output: 2 },
  'gpt-5-nano': { input: 0.05, cached: 0.005, output: 0.4 },
  'gpt-5.1': { input: 1.25, cached: 0.125, output: 10 },
  'gpt-5.2': { input: 1.75, cached: 0.175, output: 14 },
  'gpt-5.4': { input: 2.5, cached: 0.25, output: 15 },
  'gpt-5.4-mini': { input: 0.75, cached: 0.075, output: 4.5 },
  'gpt-5.4-nano': { input: 0.2, cached: 0.02, output: 1.25 },
  'gpt-5.5': { input: 5, cached: 0.5, output: 30 },
  'gpt-5.6-luna': { input: 0.2, cached: 0.02, output: 1.2 },
  'gpt-5.6-terra': { input: 2, cached: 0.2, output: 12 },
  'gpt-5.6-sol': { input: 4, cached: 0.4, output: 20 },
  o3: { input: 2, cached: 0.5, output: 8 },
  'o4-mini': { input: 1.1, cached: 0.275, output: 4.4 },
};

export type TokenCounts = { input: number; cached: number; output: number };

/** "gpt-4o-2024-08-06" → "gpt-4o": dated snapshots cost the same as the alias. */
export function baseModel(model: string): string {
  return model.split('@')[0].trim().toLowerCase().replace(/-\d{4}-\d{2}-\d{2}$/, '');
}

/** Cost of one run in USD; cached input tokens are part of `input` and billed at the cached rate. null = unknown model. */
export function openaiCostUsd(model: string, t: TokenCounts): number | null {
  const p = OPENAI_USD_PER_M[baseModel(model)];
  if (!p) return null;
  const cached = Math.min(t.cached, t.input);
  return ((t.input - cached) * p.input + cached * p.cached + t.output * p.output) / 1e6;
}
