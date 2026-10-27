import 'server-only';
import type { BillingSettings } from '@vff/shared';
import { fail, must } from '../http';
import { db } from '../supabase-admin';

/**
 * Used until the admin saves prices: Sarvam pay-as-you-go and gpt-5.4-mini's list price per 1M tokens
 * (the AI model since Oct 2026; the migration's column defaults are gpt-4o's).
 */
export const DEFAULT_BILLING: BillingSettings = {
  usd_inr_rate: 88,
  sarvam_inr_per_min: 0.49,
  input_usd_per_m: 0.75,
  cached_usd_per_m: 0.075,
  output_usd_per_m: 4.5,
};

type Row = Partial<Record<keyof BillingSettings, number | string>>;

/** Newest columns first: before migration 0014 there is no cached price, before 0010 no token prices. */
const COLUMN_SETS = [
  'usd_inr_rate, sarvam_inr_per_min, input_usd_per_m, cached_usd_per_m, output_usd_per_m',
  'usd_inr_rate, sarvam_inr_per_min, input_usd_per_m, output_usd_per_m',
  'usd_inr_rate, sarvam_inr_per_min',
];

export async function getBillingSettings(): Promise<BillingSettings> {
  let res = await db().from('billing_settings').select(COLUMN_SETS[0]).eq('id', true).maybeSingle();
  // A column that doesn't exist yet: try without it and use the default for it.
  for (const cols of COLUMN_SETS.slice(1)) {
    if (res.error?.code !== '42703') break;
    res = await db().from('billing_settings').select(cols).eq('id', true).maybeSingle();
  }
  const row = must(res) as Row | null;
  const pick = (k: keyof BillingSettings) => (row?.[k] == null ? DEFAULT_BILLING[k] : Number(row[k]));
  return {
    usd_inr_rate: pick('usd_inr_rate'),
    sarvam_inr_per_min: pick('sarvam_inr_per_min'),
    input_usd_per_m: pick('input_usd_per_m'),
    cached_usd_per_m: pick('cached_usd_per_m'),
    output_usd_per_m: pick('output_usd_per_m'),
  };
}

export async function saveBillingSettings(settings: BillingSettings, adminId: string): Promise<BillingSettings> {
  const { error } = await db()
    .from('billing_settings')
    .upsert({ id: true, ...settings, updated_at: new Date().toISOString(), updated_by: adminId });
  if (error) {
    console.error('billing settings save failed', error);
    if (error.code === 'PGRST204' || error.code === '42703') throw fail(500, 'Apply migrations 0010_token_prices.sql and 0014_cached_token_price.sql to save token prices.');
    throw fail(500, 'Database error');
  }
  return settings;
}
