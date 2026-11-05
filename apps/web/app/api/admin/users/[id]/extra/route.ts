import { NextResponse } from 'next/server';
import { ExtraRequest } from '@vff/shared';
import { requireAdmin } from '@/lib/auth';
import { addExtra, adminUser } from '@/lib/billing/admin';
import { route } from '@/lib/http';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

/** Add voice minutes or more of a plan counter to the user's current period, recording the payment. */
export const POST = route<Ctx>(async (req, { params }) => {
  const admin = await requireAdmin(req);
  const { id } = await params;
  const body = ExtraRequest.parse(await req.json());
  await addExtra(id, body, admin.id);
  return NextResponse.json({ user: await adminUser(id) });
});
