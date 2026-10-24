import { NextResponse } from 'next/server';
import { BillingSettings } from '@vff/shared';
import { requireAdmin } from '@/lib/auth';
import { route } from '@/lib/http';
import { getBillingSettings, saveBillingSettings } from '@/lib/usage/settings';

export const runtime = 'nodejs';

export const GET = route(async (req) => {
  await requireAdmin(req);
  return NextResponse.json({ settings: await getBillingSettings() });
});

/** The admin sets OpenAI's input / output token prices ($ per 1M), the USD→INR rate and Sarvam's ₹ per minute. */
export const PATCH = route(async (req) => {
  const admin = await requireAdmin(req);
  const body = BillingSettings.parse(await req.json());
  return NextResponse.json({ settings: await saveBillingSettings(body, admin.id) });
});
