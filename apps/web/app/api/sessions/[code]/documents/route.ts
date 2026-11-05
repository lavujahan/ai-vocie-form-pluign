import { NextResponse } from 'next/server';
import { ScanDocumentRequest } from '@vff/shared';
import { requireUser } from '@/lib/auth';
import { assertCanUse, recordUse, wasCounted } from '@/lib/billing/plans';
import { fail, route } from '@/lib/http';
import { getSessionByCode } from '@/lib/sessions';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ code: string }> };

/**
 * Fetch from scan saved a file for an upload field. The scan itself never leaves the computer; this only
 * counts it as a document (once per field, like a file sent from the phone), or refuses when none are left.
 */
export const POST = route<Ctx>(async (req, { params }) => {
  const { code } = await params;
  const user = await requireUser(req);
  const session = await getSessionByCode(code);
  if (session.user_id !== user.id) throw fail(403, 'Not allowed');
  const { field_key } = ScanDocumentRequest.parse(await req.json());
  if (user.role !== 'admin' && !(await wasCounted(session.id, 'documents', field_key))) {
    await assertCanUse(user.id, user.role, { minutes: false, counter: 'documents' });
    await recordUse(user.id, 'documents', { sessionId: session.id, ref: field_key });
  }
  return NextResponse.json({ ok: true });
});
