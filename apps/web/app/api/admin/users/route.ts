import { NextResponse } from 'next/server';
import { CreateUserRequest, type AdminUserRow } from '@vff/shared';
import { hashPin, requireAdmin } from '@/lib/auth';
import { fail, must, route } from '@/lib/http';
import { ADMIN_USER_COLUMNS } from '@/lib/admin';
import { db } from '@/lib/supabase-admin';

export const runtime = 'nodejs';


export const GET = route(async (req) => {
  await requireAdmin(req);
  const q = req.nextUrl.searchParams.get('q')?.trim().replace(/[%,()]/g, '');
  let query = db().from('users').select(ADMIN_USER_COLUMNS).order('created_at', { ascending: false }).limit(500);
  if (q) query = query.or(`name.ilike.%${q}%,phone.ilike.%${q}%`);
  const users = must(await query) as AdminUserRow[];
  return NextResponse.json({ users });
});

export const POST = route(async (req) => {
  await requireAdmin(req);
  const body = CreateUserRequest.parse(await req.json());
  const { data, error } = await db()
    .from('users')
    .insert({ name: body.name, phone: body.phone, role: body.role, pin_hash: await hashPin(body.pin) })
    .select(ADMIN_USER_COLUMNS)
    .single();
  if (error?.code === '23505') throw fail(409, 'A user with this phone number already exists');
  if (error) throw fail(500, 'Database error');
  return NextResponse.json({ user: data as AdminUserRow }, { status: 201 });
});
