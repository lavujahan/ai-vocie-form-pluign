import { NextResponse } from 'next/server';
import { checkFile, FileCommitRequest, formatOfMime, type FieldFile } from '@vff/shared';
import { requirePhone } from '@/lib/auth';
import { getUploadField, uploadName } from '@/lib/files/fields';
import { inspectUpload, removeObjects } from '@/lib/files/storage';
import { fail, must, route } from '@/lib/http';
import { assertPhoneCanWrite, assertPhoneOf, getSessionByCode } from '@/lib/sessions';
import { db } from '@/lib/supabase-admin';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ code: string }> };

/**
 * The phone's upload finished. The server checks what was really stored (type from its first bytes,
 * real size) before the computer sees it, then records it for the field. A newer upload for the same
 * field replaces the older one (latest wins). The extension gets it through Realtime (field_files).
 */
export const POST = route<Ctx>(async (req, { params }) => {
  const { code } = await params;
  const claims = await requirePhone(req);
  const session = await getSessionByCode(code);
  assertPhoneOf(claims, session);
  assertPhoneCanWrite(session);

  const body = FileCommitRequest.parse(await req.json());
  if (!body.path.startsWith(`${session.id}/`)) throw fail(403, 'Not allowed');
  const { field, rules } = await getUploadField(session.id, body.field_key);

  const stored = await inspectUpload(body.path);
  const problem = stored.mime
    ? checkFile(rules, { mime: stored.mime, bytes: stored.bytes, pages: body.pages })
    : 'This is not a JPG, PNG or PDF file.';
  if (problem) {
    await removeObjects([body.path]);
    throw fail(422, problem);
  }

  const { data: previous } = await db().from('field_files').select('path').eq('field_id', field.id).maybeSingle();
  const now = new Date().toISOString();
  const row = must(
    await db()
      .from('field_files')
      .upsert(
        {
          session_id: session.id,
          field_id: field.id,
          path: body.path,
          file_name: uploadName(field, body.file_name, formatOfMime(stored.mime!)!),
          mime: stored.mime,
          bytes: stored.bytes,
          pages: body.pages,
          status: 'uploaded',
          reason: null,
          created_at: now,
          updated_at: now,
        },
        { onConflict: 'field_id' },
      )
      .select('id, field_id, file_name, mime, bytes, pages, status, reason, created_at')
      .single(),
  ) as FieldFile;
  const old = (previous as { path: string } | null)?.path;
  if (old && old !== body.path) await removeObjects([old]);
  return NextResponse.json(row, { status: 201 });
});
