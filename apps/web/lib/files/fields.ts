import 'server-only';
import { effectiveFileRules, uploadFileName, type FileFormat } from '@vff/shared';
import { fail } from '../http';
import { getFieldRows, type FieldRow } from '../sessions';

/** The upload field `fieldKey` of a session, with the rules that apply to it. */
export async function getUploadField(sessionId: string, fieldKey: string) {
  const field = (await getFieldRows(sessionId)).find((f) => f.field_key === fieldKey);
  if (!field || field.field_type !== 'file') throw fail(400, 'This is not an upload field');
  return { field, rules: effectiveFileRules(field) };
}

/** A clean file name for the website. A label in Tamil script has no plain letters left: fall back to the phone's name, then the key. */
export function uploadName(field: Pick<FieldRow, 'label' | 'clean_label' | 'field_key'>, given: string, format: FileFormat): string {
  return uploadFileName([field.clean_label, field.label, given, field.field_key], format);
}
