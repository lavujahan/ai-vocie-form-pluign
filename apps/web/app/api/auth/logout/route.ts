import { NextResponse } from 'next/server';
import { USER_COOKIE } from '@vff/shared';

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(USER_COOKIE);
  return res;
}
