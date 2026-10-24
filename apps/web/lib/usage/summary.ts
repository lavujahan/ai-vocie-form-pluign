import type { BillingSettings, UsageCosts, UsageDayRow, UsageSummaryRow } from '@vff/shared';

/** Token and audio totals as the usage_summary() / usage_daily() RPCs return them (bigint / numeric may be strings). */
type RawCounts = {
  stt_calls: number | string;
  audio_ms: number | string;
  llm_calls: number | string;
  input_tokens: number | string;
  cached_input_tokens: number | string;
  output_tokens: number | string;
};

/** One user's totals from usage_summary(). */
export type RawUsageRow = RawCounts & {
  user_id: string | null;
  name: string | null;
  phone: string | null;
  /** Cost at list price when each run was recorded; not used (the admin's prices are). */
  openai_usd?: number | string;
};

/** One day's totals from usage_daily(). */
export type RawDayRow = RawCounts & { day: string };

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const IST_MS = 330 * 60_000;
const DAY_MS = 86_400_000;
/** The longest date range the page shows at once. */
export const MAX_RANGE_DAYS = 366;

export function isMonth(s: string): boolean {
  return MONTH_RE.test(s);
}

/** A real calendar date, YYYY-MM-DD (not 2026-02-30). */
export function isDate(s: string): boolean {
  return DATE_RE.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
}

/** The current month in India time, YYYY-MM. */
export function currentMonth(now = new Date()): string {
  return new Date(now.getTime() + IST_MS).toISOString().slice(0, 7);
}

/** Today in India time, YYYY-MM-DD. */
export function todayIst(now = new Date()): string {
  return new Date(now.getTime() + IST_MS).toISOString().slice(0, 10);
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

/** Days from `from` to `to`, both included (YYYY-MM-DD). */
export function rangeDays(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS) + 1;
}

/** Start of `from` and end of `to` (inclusive dates) at midnight India time. */
export function rangeBounds(from: string, to: string): { from: string; to: string } {
  return {
    from: new Date(`${from}T00:00:00+05:30`).toISOString(),
    to: new Date(Date.parse(`${to}T00:00:00+05:30`) + DAY_MS).toISOString(),
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

/**
 * Prices usage with the admin's prices. OpenAI: input tokens × input $ per 1M + output tokens × output
 * $ per 1M (cached input tokens count as input), also in ₹ at the admin's rate. Sarvam: minutes × ₹/min.
 */
export function priceCounts(r: RawCounts, settings: BillingSettings): UsageCosts {
  const minutes = Number(r.audio_ms) / 60_000;
  const input = Number(r.input_tokens);
  const output = Number(r.output_tokens);
  const inputUsd = (input / 1e6) * settings.input_usd_per_m;
  const outputUsd = (output / 1e6) * settings.output_usd_per_m;
  const openaiUsd = inputUsd + outputUsd;
  const sarvamInr = minutes * settings.sarvam_inr_per_min;
  const openaiInr = openaiUsd * settings.usd_inr_rate;
  return {
    stt_calls: Number(r.stt_calls),
    minutes,
    llm_calls: Number(r.llm_calls),
    input_tokens: input,
    cached_input_tokens: Number(r.cached_input_tokens),
    output_tokens: output,
    tokens: input + output,
    input_usd: round6(inputUsd),
    output_usd: round6(outputUsd),
    openai_usd: round6(openaiUsd),
    sarvam_inr: round2(sarvamInr),
    openai_inr: round2(openaiInr),
    total_inr: round2(sarvamInr + openaiInr),
  };
}

/** Totals of several priced rows (users or days). */
export function sumCosts(rows: UsageCosts[]): UsageCosts {
  const sum = (k: keyof UsageCosts) => rows.reduce((a, r) => a + r[k], 0);
  return {
    stt_calls: sum('stt_calls'),
    minutes: sum('minutes'),
    llm_calls: sum('llm_calls'),
    input_tokens: sum('input_tokens'),
    cached_input_tokens: sum('cached_input_tokens'),
    output_tokens: sum('output_tokens'),
    tokens: sum('tokens'),
    input_usd: round6(sum('input_usd')),
    output_usd: round6(sum('output_usd')),
    openai_usd: round6(sum('openai_usd')),
    sarvam_inr: round2(sum('sarvam_inr')),
    openai_inr: round2(sum('openai_inr')),
    total_inr: round2(sum('total_inr')),
  };
}

/** Each user's usage in the chosen dates, priced, with totals. */
export function priceSummary(raw: RawUsageRow[], settings: BillingSettings): { rows: UsageSummaryRow[]; totals: UsageCosts } {
  const rows = raw.map((r) => ({ user_id: r.user_id, name: r.name, phone: r.phone, ...priceCounts(r, settings) }));
  return { rows, totals: sumCosts(rows) };
}

/** Day-by-day usage, priced, with totals. */
export function priceDays(raw: RawDayRow[], settings: BillingSettings): { days: UsageDayRow[]; day_totals: UsageCosts } {
  const days = raw.map((r) => ({ day: String(r.day).slice(0, 10), ...priceCounts(r, settings) }));
  return { days, day_totals: sumCosts(days) };
}
