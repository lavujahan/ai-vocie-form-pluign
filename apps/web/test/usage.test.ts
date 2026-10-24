import { describe, expect, it } from 'vitest';
import { Usage } from '@openai/agents';
import { cachedTokens, openaiEvent, sttEvent } from '@/lib/usage/events';
import { openaiCostUsd } from '@/lib/usage/pricing';
import { currentMonth, isDate, monthBounds, priceDays, priceSummary, rangeBounds, rangeDays, todayIst, type RawUsageRow } from '@/lib/usage/summary';

describe('openaiCostUsd', () => {
  it('prices gpt-4o input, cached input and output separately', () => {
    // 10k input (2k cached) + 1k output: 8k × $2.50 + 2k × $1.25 + 1k × $10 per 1M
    expect(openaiCostUsd('gpt-4o', { input: 10_000, cached: 2_000, output: 1_000 })).toBeCloseTo(0.0325, 10);
  });
  it('treats dated snapshots like the alias', () => {
    expect(openaiCostUsd('gpt-4o-2024-08-06', { input: 1_000_000, cached: 0, output: 0 })).toBe(2.5);
  });
  it('returns null for an unknown model', () => {
    expect(openaiCostUsd('custom', { input: 100, cached: 0, output: 100 })).toBeNull();
  });
});

describe('usage events', () => {
  it('sums cached tokens across requests and prices the run', () => {
    const usage = new Usage({ requests: 1, inputTokens: 3000, outputTokens: 200, inputTokensDetails: { cached_tokens: 1000 } });
    usage.add(new Usage({ requests: 1, inputTokens: 3500, outputTokens: 300, inputTokensDetails: { cached_tokens: 2000 } }));
    expect(cachedTokens(usage)).toBe(3000);
    const e = openaiEvent({ user_id: 'u1', session_id: 's1', utterance_id: 'x' }, 'map', { usage, model: 'gpt-4o', ok: true });
    expect(e).toMatchObject({
      user_id: 'u1',
      kind: 'map',
      provider: 'openai',
      requests: 2,
      input_tokens: 6500,
      cached_input_tokens: 3000,
      output_tokens: 500,
    });
    expect(e.cost_usd).toBeCloseTo((3500 * 2.5 + 3000 * 1.25 + 500 * 10) / 1e6, 10);
  });
  it('records speech-to-text by audio length', () => {
    expect(sttEvent({ user_id: 'u1', session_id: 's1' }, 'saaras:v3', 12_500)).toMatchObject({ provider: 'sarvam', audio_ms: 12_500 });
  });
});

describe('monthly summary', () => {
  it('uses India-time month boundaries, including the year rollover', () => {
    expect(monthBounds('2026-10')).toEqual({ from: '2026-09-30T18:30:00.000Z', to: '2026-10-31T18:30:00.000Z' });
    expect(monthBounds('2026-12').to).toBe('2026-12-31T18:30:00.000Z');
    expect(() => monthBounds('2026-13')).toThrow();
    // 31 Oct 20:00 UTC is already 1 Nov in India.
    expect(currentMonth(new Date('2026-10-31T20:00:00Z'))).toBe('2026-11');
  });

  it("prices tokens at the admin's $ per 1M (input and output), Sarvam by minutes, with totals", () => {
    const raw: RawUsageRow[] = [
      { user_id: 'a', name: 'Anu', phone: '9000000001', stt_calls: '10', audio_ms: '600000', llm_calls: '10', input_tokens: '50000', cached_input_tokens: '10000', output_tokens: '5000', openai_usd: '0.5' },
      { user_id: 'b', name: 'Bala', phone: '9000000002', stt_calls: 2, audio_ms: 30_000, llm_calls: 3, input_tokens: 1000, cached_input_tokens: 0, output_tokens: 100, openai_usd: 0.01 },
    ];
    const settings = { usd_inr_rate: 88, sarvam_inr_per_min: 0.49, input_usd_per_m: 2.5, output_usd_per_m: 10 };
    const s = priceSummary(raw, settings);
    // Anu: 50k input × $2.50/1M = $0.125, 5k output × $10/1M = $0.05 → $0.175 → ₹15.40 (the stored list-price cost is not used).
    expect(s.rows[0]).toMatchObject({ minutes: 10, tokens: 55_000, input_usd: 0.125, output_usd: 0.05, openai_usd: 0.175, sarvam_inr: 4.9, openai_inr: 15.4, total_inr: 20.3 });
    expect(s.rows[1]).toMatchObject({ input_usd: 0.0025, output_usd: 0.001, openai_usd: 0.0035, openai_inr: 0.31 });
    expect(s.totals).toMatchObject({ tokens: 56_100, input_usd: 0.1275, output_usd: 0.051, openai_usd: 0.1785, openai_inr: 15.71 });
    // A new price applies straight away: input $1, output $4 per 1M.
    const cheaper = priceSummary(raw, { ...settings, input_usd_per_m: 1, output_usd_per_m: 4 });
    expect(cheaper.rows[0]).toMatchObject({ input_usd: 0.05, output_usd: 0.02, openai_usd: 0.07, openai_inr: 6.16 });
  });
});

describe('date range and day by day', () => {
  it('covers whole India-time days, both dates included', () => {
    expect(rangeBounds('2026-10-01', '2026-10-24')).toEqual({ from: '2026-09-30T18:30:00.000Z', to: '2026-10-24T18:30:00.000Z' });
    expect(rangeBounds('2026-10-24', '2026-10-24').to).toBe('2026-10-24T18:30:00.000Z');
    expect(rangeDays('2026-10-01', '2026-10-31')).toBe(31);
    expect(rangeDays('2026-12-31', '2027-01-01')).toBe(2);
    // 19:00 UTC on the 24th is already the 25th in India.
    expect(todayIst(new Date('2026-10-24T19:00:00Z'))).toBe('2026-10-25');
  });
  it('accepts only real dates', () => {
    expect(isDate('2026-02-28')).toBe(true);
    expect(isDate('2026-02-30')).toBe(false);
    expect(isDate('2026-10')).toBe(false);
  });
  it('prices each day with the same prices as the user table, with totals', () => {
    const settings = { usd_inr_rate: 88, sarvam_inr_per_min: 0.49, input_usd_per_m: 2.5, output_usd_per_m: 10 };
    const d = priceDays(
      [
        { day: '2026-10-01', stt_calls: 3, audio_ms: 120_000, llm_calls: 3, input_tokens: 20_000, cached_input_tokens: 0, output_tokens: 2_000 },
        { day: '2026-10-02', stt_calls: '1', audio_ms: '60000', llm_calls: '1', input_tokens: '30000', cached_input_tokens: '0', output_tokens: '3000' },
      ],
      settings,
    );
    expect(d.days[0]).toMatchObject({ day: '2026-10-01', minutes: 2, input_usd: 0.05, output_usd: 0.02, openai_usd: 0.07 });
    expect(d.days[1]).toMatchObject({ day: '2026-10-02', minutes: 1, input_usd: 0.075, output_usd: 0.03 });
    expect(d.day_totals).toMatchObject({ minutes: 3, input_tokens: 50_000, output_tokens: 5_000, input_usd: 0.125, output_usd: 0.05, openai_usd: 0.175 });
  });
});
