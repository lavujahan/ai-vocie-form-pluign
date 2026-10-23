import { NextResponse } from 'next/server';
import { checkFile, extensionOf, FileUploadUrlRequest, formatOfMime, type FileUploadUrlResponse } from '@vff/shared';
import { requirePhone } from '@/lib/auth';
import { getUploadField } from '@/lib/files/fields';
import { createUploadUrl, newPath } from '@/lib/files/storage';
import { fail, route } from '@/lib/http';
import { assertPhoneCanWrite, getSessionByCode } from '@/lib/sessions';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ code: string }> };

/**
 * The phone has prepared a file (photo compressed / pages made into a PDF): check it against the field's
 * rules and give it a one-time upload URL for one path. The phone uploads straight to storage (API
 * request bodies are limited in size), then confirms with POST /files.
 */
export const POST = route<Ctx>(async (req, { params }) => {
  const { code } = await params;
  const claims = await requirePhone(req);
  const session = await getSessionByCode(code);
  if (claims.session_id !== session.id) throw fail(403, 'Not allowed');
  assertPhoneCanWrite(session);

  const body = FileUploadUrlRequest.parse(await req.json());
  const { field, rules } = await getUploadField(session.id, body.field_key);
  const problem = checkFile(rules, body);
  if (problem) throw fail(422, problem);

  const ext = extensionOf(formatOfMime(body.mime)!);
  return NextResponse.json((await createUploadUrl(newPath(session.id, field.field_key, ext))) satisfies FileUploadUrlResponse);
});
