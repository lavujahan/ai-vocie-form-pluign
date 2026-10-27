import { describe, expect, it } from 'vitest';
import { Usage } from '@openai/agents';
import { cachedTokens, openaiEvent, sttEvent } from '@/lib/usage/events';
import { openaiCostUsd } from '@/lib/usage/pricing';
import { currentMonth, isDate, monthBounds, priceCounts, priceDays, priceSummary, rangeBounds, rangeDays, todayIst, type RawUsageRow } from '@/lib/usage/summary';

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

  it("prices tokens at the admin's $ per 1M (input, cached input and output), Sarvam by minutes, with totals", () => {
    const raw: RawUsageRow[] = [
      { user_id: 'a', name: 'Anu', phone: '9000000001', stt_calls: '10', audio_ms: '600000', llm_calls: '10', input_tokens: '50000', cached_input_tokens: '10000', output_tokens: '5000', openai_usd: '0.5' },
      { user_id: 'b', name: 'Bala', phone: '9000000002', stt_calls: 2, audio_ms: 30_000, llm_calls: 3, input_tokens: 1000, cached_input_tokens: 0, output_tokens: 100, openai_usd: 0.01 },
    ];
    const settings = { usd_inr_rate: 88, sarvam_inr_per_min: 0.49, input_usd_per_m: 2.5, cached_usd_per_m: 1.25, output_usd_per_m: 10 };
    const s = priceSummary(raw, settings);
    // Anu: 40k uncached × $2.50/1M + 10k cached × $1.25/1M = $0.1125, 5k output × $10/1M = $0.05 → $0.1625 → ₹14.30
    // (the stored list-price cost is not used).
    expect(s.rows[0]).toMatchObject({ minutes: 10, tokens: 55_000, input_usd: 0.1125, output_usd: 0.05, openai_usd: 0.1625, sarvam_inr: 4.9, openai_inr: 14.3, total_inr: 19.2 });
    expect(s.rows[1]).toMatchObject({ input_usd: 0.0025, output_usd: 0.001, openai_usd: 0.0035, openai_inr: 0.31 });
    expect(s.totals).toMatchObject({ tokens: 56_100, input_usd: 0.115, output_usd: 0.051, openai_usd: 0.166, openai_inr: 14.61 });
    // A new price applies straight away: input $1, cached $0.10, output $4 per 1M.
    const cheaper = priceSummary(raw, { ...settings, input_usd_per_m: 1, cached_usd_per_m: 0.1, output_usd_per_m: 4 });
    expect(cheaper.rows[0]).toMatchObject({ input_usd: 0.041, output_usd: 0.02, openai_usd: 0.061, openai_inr: 5.37 });
  });

  it('never counts more cached tokens than input tokens', () => {
    const settings = { usd_inr_rate: 88, sarvam_inr_per_min: 0.49, input_usd_per_m: 2.5, cached_usd_per_m: 1.25, output_usd_per_m: 10 };
    const row = priceCounts({ stt_calls: 0, audio_ms: 0, llm_calls: 1, input_tokens: 1000, cached_input_tokens: 5000, output_tokens: 0 }, settings);
    // All 1,000 input tokens at the cached price.
    expect(row.input_usd).toBe(0.00125);
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
    const settings = { usd_inr_rate: 88, sarvam_inr_per_min: 0.49, input_usd_per_m: 2.5, cached_usd_per_m: 1.25, output_usd_per_m: 10 };
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

describe('forms completed', () => {
  it('counts a form the computer filled with at most 2 fields left empty', async () => {
    const { isCompleted } = await import('@/lib/completions');
    expect(isCompleted(15, 15)).toBe(true);
    expect(isCompleted(13, 15)).toBe(true); // 2 left empty
    expect(isCompleted(12, 15)).toBe(false);
    expect(isCompleted(1, 2)).toBe(true);
    expect(isCompleted(0, 2)).toBe(false); // nothing filled is never a completed form
  });

  it('puts the counts on user and India-time day rows; null before the table exists', async () => {
    const { istDay, withForms } = await import('@/lib/usage/summary');
    const zero = priceCounts({ stt_calls: 0, audio_ms: 0, llm_calls: 0, input_tokens: 0, cached_input_tokens: 0, output_tokens: 0 }, {
      usd_inr_rate: 88, sarvam_inr_per_min: 0.49, input_usd_per_m: 0.75, cached_usd_per_m: 0.075, output_usd_per_m: 4.5,
    });
    const done = [
      { user_id: 'u1', completed_at: '2026-10-27T20:00:00Z' }, // 28 Oct in India
      { user_id: 'u1', completed_at: '2026-10-27T10:00:00Z' },
      { user_id: 'u2', completed_at: '2026-10-27T10:00:00Z' },
    ];
    expect(istDay('2026-10-27T20:00:00Z')).toBe('2026-10-28');
    const users = withForms([{ ...zero, user_id: 'u1' }, { ...zero, user_id: 'u3' }], done, (c) => c.user_id, (r) => r.user_id);
    expect(users.map((r) => r.forms_completed)).toEqual([2, 0]);
    const days = withForms([{ ...zero, day: '2026-10-27' }, { ...zero, day: '2026-10-28' }], done, (c) => istDay(c.completed_at), (d) => d.day);
    expect(days.map((d) => d.forms_completed)).toEqual([2, 1]);
    expect(withForms([{ ...zero, user_id: 'u1' }], null, (c) => c.user_id, (r) => r.user_id)[0].forms_completed).toBeNull();
  });
});
