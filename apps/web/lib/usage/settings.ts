import 'server-only';
import type { BillingSettings } from '@vff/shared';
import { fail, must } from '../http';
import { db } from '../supabase-admin';

/** Same as the migrations' column defaults (Sarvam pay-as-you-go; gpt-4o list price per 1M tokens). */
export const DEFAULT_BILLING: BillingSettings = { usd_inr_rate: 88, sarvam_inr_per_min: 0.49, input_usd_per_m: 2.5, output_usd_per_m: 10 };

type Row = Partial<Record<keyof BillingSettings, number | string>>;

export async function getBillingSettings(): Promise<BillingSettings> {
  const cols = 'usd_inr_rate, sarvam_inr_per_min, input_usd_per_m, output_usd_per_m';
  let res = await db().from('billing_settings').select(cols).eq('id', true).maybeSingle();
  // Before migration 0010 the token price columns don't exist: use the defaults for them.
  if (res.error?.code === '42703') res = await db().from('billing_settings').select('usd_inr_rate, sarvam_inr_per_min').eq('id', true).maybeSingle();
  const row = must(res) as Row | null;
  const pick = (k: keyof BillingSettings) => (row?.[k] == null ? DEFAULT_BILLING[k] : Number(row[k]));
  return {
    usd_inr_rate: pick('usd_inr_rate'),
    sarvam_inr_per_min: pick('sarvam_inr_per_min'),
    input_usd_per_m: pick('input_usd_per_m'),
    output_usd_per_m: pick('output_usd_per_m'),
  };
}

export async function saveBillingSettings(settings: BillingSettings, adminId: string): Promise<BillingSettings> {
  const { error } = await db()
    .from('billing_settings')
    .upsert({ id: true, ...settings, updated_at: new Date().toISOString(), updated_by: adminId });
  if (error) {
    console.error('billing settings save failed', error);
    if (error.code === 'PGRST204' || error.code === '42703') throw fail(500, 'Apply migration 0010_token_prices.sql to save token prices.');
    throw fail(500, 'Database error');
  }
  return settings;
}
