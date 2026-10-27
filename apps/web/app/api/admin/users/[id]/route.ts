import { NextResponse } from 'next/server';
import { UpdateUserRequest, type AdminUserRow } from '@vff/shared';
import { hashPin, requireAdmin } from '@/lib/auth';
import { fail, route } from '@/lib/http';
import { db } from '@/lib/supabase-admin';
import { ADMIN_USER_COLUMNS } from '@/lib/admin';
import { attachPlans } from '@/lib/billing/admin';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

async function update(id: string, patch: Record<string, unknown>) {
  const { data, error } = await db().from('users').update(patch).eq('id', id).select(ADMIN_USER_COLUMNS).maybeSingle();
  if (error?.code === '23505') throw fail(409, 'A user with this phone number already exists');
  if (error) throw fail(500, 'Database error');
  if (!data) throw fail(404, 'User not found');
  return NextResponse.json({ user: (await attachPlans([data as AdminUserRow]))[0] });
}

export const PATCH = route<Ctx>(async (req, { params }) => {
  const admin = await requireAdmin(req);
  const { id } = await params;
  const body = UpdateUserRequest.parse(await req.json());

  if (id === admin.id && (body.is_active === false || body.role === 'user')) {
    throw fail(400, "You can't deactivate or demote your own account");
  }

  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) patch.name = body.name;
  if (body.phone !== undefined) patch.phone = body.phone;
  if (body.role !== undefined) patch.role = body.role;
  if (body.is_active !== undefined) patch.is_active = body.is_active;
  if (body.pin !== undefined) patch.pin_hash = await hashPin(body.pin);
  // A PIN reset also clears any lock.
  if (body.unlock || body.pin !== undefined) {
    patch.failed_attempts = 0;
    patch.locked_until = null;
  }
  if (!Object.keys(patch).length) throw fail(400, 'Nothing to update');
  return update(id, patch);
});

/** Soft delete: users are deactivated, never removed, so session history stays intact. */
export const DELETE = route<Ctx>(async (req, { params }) => {
  const admin = await requireAdmin(req);
  const { id } = await params;
  if (id === admin.id) throw fail(400, "You can't deactivate your own account");
  return update(id, { is_active: false });
});
