import { NextResponse, type NextRequest } from 'next/server';
import { purgeExpiredFiles } from '@/lib/files/storage';
import { fail, route } from '@/lib/http';

export const runtime = 'nodejs';

/**
 * Safety net for uploaded files of abandoned sessions (normally they are deleted once filled, on Start
 * over, when the form tab closes, and after each new session). Called by Vercel Cron (vercel.json),
 * which sends `Authorization: Bearer $CRON_SECRET`.
 */
export const GET = route(async (req: NextRequest) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) throw fail(401, 'Not allowed');
  let purged = 0;
  for (let i = 0; i < 20; i++) {
    const n = await purgeExpiredFiles(100);
    purged += n;
    if (n < 100) break;
  }
  return NextResponse.json({ purged });
});
