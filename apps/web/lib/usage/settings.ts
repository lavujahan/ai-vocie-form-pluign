import 'server-only';
import type { BillingSettings } from '@vff/shared';
import { fail, must } from '../http';
import { db } from '../supabase-admin';

/** Same as the migration's column defaults (Sarvam pay-as-you-go list price). */
export const DEFAULT_BILLING: BillingSettings = { usd_inr_rate: 88, sarvam_inr_per_min: 0.49 };

export async function getBillingSettings(): Promise<BillingSettings> {
  const row = must(
    await db().from('billing_settings').select('usd_inr_rate, sarvam_inr_per_min').eq('id', true).maybeSingle(),
  ) as { usd_inr_rate: number | string; sarvam_inr_per_min: number | string } | null;
  if (!row) return DEFAULT_BILLING;
  return { usd_inr_rate: Number(row.usd_inr_rate), sarvam_inr_per_min: Number(row.sarvam_inr_per_min) };
}

export async function saveBillingSettings(settings: BillingSettings, adminId: string): Promise<BillingSettings> {
  const { error } = await db()
    .from('billing_settings')
    .upsert({ id: true, ...settings, updated_at: new Date().toISOString(), updated_by: adminId });
  if (error) {
    console.error('billing settings save failed', error);
    throw fail(500, 'Database error');
  }
  return settings;
}
