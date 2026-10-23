import { NextResponse } from 'next/server';
import { FileStatusRequest } from '@vff/shared';
import { requireUser } from '@/lib/auth';
import { getFileRow, removeObjects, signedDownloadUrl } from '@/lib/files/storage';
import { fail, must, route } from '@/lib/http';
import { getSessionByCode } from '@/lib/sessions';
import { db } from '@/lib/supabase-admin';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ code: string; id: string }> };

async function ownedFile(req: Parameters<typeof requireUser>[0], code: string, id: string) {
  const user = await requireUser(req);
  const session = await getSessionByCode(code);
  if (session.user_id !== user.id) throw fail(403, 'Not allowed');
  return getFileRow(session.id, id);
}

/** For the extension: a 60-second link to download the file and put it into the page. */
export const GET = route<Ctx>(async (req, { params }) => {
  const { code, id } = await params;
  const file = await ownedFile(req, code, id);
  if (file.status !== 'uploaded') throw fail(410, 'This file was already used. Upload it again from the phone.');
  return NextResponse.json({ url: await signedDownloadUrl(file.path), file_name: file.file_name, mime: file.mime, bytes: file.bytes });
});

/**
 * From the extension: the file is in the page ('filled'), or the website refused it ('rejected', with
 * its message). Either way the stored copy is deleted now: the computer has it, or it must be redone.
 * The row stays (without content) so the phone shows the status.
 */
export const PATCH = route<Ctx>(async (req, { params }) => {
  const { code, id } = await params;
  const file = await ownedFile(req, code, id);
  const body = FileStatusRequest.parse(await req.json());
  must(
    await db()
      .from('field_files')
      .update({ status: body.status, reason: body.status === 'rejected' ? body.reason : null, updated_at: new Date().toISOString() })
      .eq('id', file.id),
  );
  await removeObjects([file.path]);
  return NextResponse.json({ ok: true });
});
