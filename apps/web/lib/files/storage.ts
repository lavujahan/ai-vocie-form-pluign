import 'server-only';
import { sniffMime, type FieldFile } from '@vff/shared';
import { fail, must } from '../http';
import { db } from '../supabase-admin';

/**
 * Uploaded files live in a private Supabase Storage bucket. Clients never touch it directly: the phone
 * gets a one-time signed upload URL for one path, the extension a 60-second signed download URL, and
 * files are deleted as soon as the computer has them (or when the session expires).
 */

export const BUCKET = 'form-files';
const DOWNLOAD_TTL_S = 60;
/** Sessions expire 30 min after their QR code does (0002_cron); files go with them. */
const EXPIRE_AFTER_MS = 30 * 60_000;

const bucket = () => db().storage.from(BUCKET);

export type FileRow = FieldFile & { session_id: string; path: string };

const PUBLIC_COLUMNS = 'id, field_id, file_name, mime, bytes, pages, status, reason, created_at';

/** Files of a session, for snapshots (empty before migration 0007). */
export async function getFiles(sessionId: string): Promise<FieldFile[]> {
  const { data, error } = await db().from('field_files').select(PUBLIC_COLUMNS).eq('session_id', sessionId);
  return error ? [] : (data as FieldFile[]);
}

export async function getFileRow(sessionId: string, id: string): Promise<FileRow> {
  const row = must(await db().from('field_files').select('*').eq('session_id', sessionId).eq('id', id).maybeSingle());
  if (!row) throw fail(404, 'File not found');
  return row as FileRow;
}

/** A path nobody can guess: session / field / random name. */
export function newPath(sessionId: string, fieldKey: string, ext: string): string {
  const safeKey = fieldKey.replace(/[^\w-]+/g, '_').slice(0, 60) || 'field';
  return `${sessionId}/${safeKey}/${crypto.randomUUID()}.${ext}`;
}

export async function createUploadUrl(path: string): Promise<{ path: string; token: string }> {
  const { data, error } = await bucket().createSignedUploadUrl(path);
  if (error || !data) throw fail(500, 'Could not prepare the upload');
  return { path: data.path, token: data.token };
}

/** Reads what was really stored: size and type from the first bytes (not what the phone claimed). */
export async function inspectUpload(path: string): Promise<{ bytes: number; mime: ReturnType<typeof sniffMime> }> {
  const { data, error } = await bucket().download(path);
  if (error || !data) throw fail(400, 'The upload did not arrive. Try again.');
  const head = new Uint8Array(await data.slice(0, 8).arrayBuffer());
  return { bytes: data.size, mime: sniffMime(head) };
}

export async function signedDownloadUrl(path: string): Promise<string> {
  const { data, error } = await bucket().createSignedUrl(path, DOWNLOAD_TTL_S);
  if (error || !data) throw fail(404, 'The file is no longer available. Upload it again from the phone.');
  return data.signedUrl;
}

export async function removeObjects(paths: string[]) {
  const list = paths.filter(Boolean);
  if (!list.length) return;
  const { error } = await bucket().remove(list);
  if (error) console.warn('could not remove uploaded files', error.message);
}

/** Removes the stored files of one session (Start over, session ended). */
export async function removeSessionFiles(sessionId: string) {
  const { data } = await db().from('field_files').select('path').eq('session_id', sessionId);
  await removeObjects((data ?? []).map((r) => (r as { path: string }).path));
}

/**
 * Deletes files of expired sessions (storage objects and rows). Runs after each new session and from
 * the daily cron, so an abandoned upload doesn't outlive its session by much.
 */
export async function purgeExpiredFiles(limit = 100): Promise<number> {
  const cutoff = new Date(Date.now() - EXPIRE_AFTER_MS).toISOString();
  const now = new Date().toISOString();
  const expired = (filter: string) =>
    db().from('field_files').select('id, path, form_sessions!inner(expires_at, status)').or(filter, { referencedTable: 'form_sessions' }).limit(limit);
  // Sent forms on hold keep their files (migration 0022; before it, no such column).
  let { data, error } = await expired(`status.eq.expired,and(expires_at.lt.${cutoff},or(hold_until.is.null,hold_until.lt.${now}))`);
  if (error?.code === '42703') ({ data, error } = await expired(`expires_at.lt.${cutoff},status.eq.expired`));
  if (error || !data?.length) return 0;
  const rows = data as unknown as { id: string; path: string }[];
  await removeObjects(rows.map((r) => r.path));
  await db().from('field_files').delete().in('id', rows.map((r) => r.id));
  return rows.length;
}
