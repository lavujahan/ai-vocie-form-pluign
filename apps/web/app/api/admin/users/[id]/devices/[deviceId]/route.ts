import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { signOutDevice } from '@/lib/billing/devices';
import { route } from '@/lib/http';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string; deviceId: string }> };

/** Sign one of the user's computers out: it asks for the PIN at its next step and stops counting. */
export const DELETE = route<Ctx>(async (req, { params }) => {
  await requireAdmin(req);
  const { id, deviceId } = await params;
  await signOutDevice(deviceId, id);
  return NextResponse.json({ ok: true });
});
