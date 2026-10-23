import type { BillingSettings, UsageSummaryResponse, UsageSummaryRow } from '@vff/shared';

/** What the usage_summary() RPC returns (bigint / numeric arrive as numbers or strings). */
export type RawUsageRow = {
  user_id: string | null;
  name: string | null;
  phone: string | null;
  stt_calls: number | string;
  audio_ms: number | string;
  llm_calls: number | string;
  input_tokens: number | string;
  cached_input_tokens: number | string;
  output_tokens: number | string;
  openai_usd: number | string;
};

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function isMonth(s: string): boolean {
  return MONTH_RE.test(s);
}

/** The current month in India time, YYYY-MM. */
export function currentMonth(now = new Date()): string {
  return new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 7);
}

/** Start (inclusive) and end (exclusive) of a month at midnight India time (+05:30). */
export function monthBounds(month: string): { from: string; to: string } {
  const m = MONTH_RE.exec(month);
  if (!m) throw new Error(`Invalid month: ${month}`);
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const next = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
  return { from: new Date(`${month}-01T00:00:00+05:30`).toISOString(), to: new Date(`${next}-01T00:00:00+05:30`).toISOString() };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Prices each user's usage in ₹: Sarvam by minutes of audio, OpenAI by its USD cost × the admin's rate. */
export function priceSummary(raw: RawUsageRow[], settings: BillingSettings, month: string): UsageSummaryResponse {
  const rows: UsageSummaryRow[] = raw.map((r) => {
    const minutes = Number(r.audio_ms) / 60_000;
    const openaiUsd = Number(r.openai_usd);
    const input = Number(r.input_tokens);
    const output = Number(r.output_tokens);
    const sarvamInr = minutes * settings.sarvam_inr_per_min;
    const openaiInr = openaiUsd * settings.usd_inr_rate;
    return {
      user_id: r.user_id,
      name: r.name,
      phone: r.phone,
      stt_calls: Number(r.stt_calls),
      minutes,
      llm_calls: Number(r.llm_calls),
      input_tokens: input,
      cached_input_tokens: Number(r.cached_input_tokens),
      output_tokens: output,
      tokens: input + output,
      openai_usd: openaiUsd,
      sarvam_inr: round2(sarvamInr),
      openai_inr: round2(openaiInr),
      total_inr: round2(sarvamInr + openaiInr),
    };
  });
  const sum = (k: keyof UsageSummaryResponse['totals']) => rows.reduce((a, r) => a + r[k], 0);
  return {
    month,
    settings,
    rows,
    totals: {
      stt_calls: sum('stt_calls'),
      minutes: sum('minutes'),
      llm_calls: sum('llm_calls'),
      input_tokens: sum('input_tokens'),
      cached_input_tokens: sum('cached_input_tokens'),
      output_tokens: sum('output_tokens'),
      tokens: sum('tokens'),
      openai_usd: sum('openai_usd'),
      sarvam_inr: round2(sum('sarvam_inr')),
      openai_inr: round2(sum('openai_inr')),
      total_inr: round2(sum('total_inr')),
    },
  };
}
