import 'server-only';
import type {
  ChoiceHint,
  FieldOption,
  FieldType,
  OutputScript,
  SemanticType,
  SessionField,
  SessionInfo,
  SessionSnapshot,
  SessionValue,
  UtteranceRow,
  ValidationRules,
} from '@vff/shared';
import { fail, must } from './http';
import { phoneWriteBlock } from './session-rules';
import { db } from './supabase-admin';

export type SessionRow = SessionInfo & {
  user_id: string;
  session_code: string;
  page_origin: string;
  page_title: string | null;
  analysis_status: 'pending' | 'done' | 'error';
  paired_at: string | null;
  created_at: string;
};

/** Full field row, including detector extras and analyzer output. */
export type FieldRow = {
  id: string;
  session_id: string;
  field_key: string;
  label: string;
  clean_label: string | null;
  field_type: FieldType;
  required: boolean;
  options: FieldOption[];
  multiple: boolean;
  group_key: string | null;
  depends_on: string | null;
  step_index: number;
  min: string | null;
  max: string | null;
  pattern: string | null;
  placeholder: string | null;
  context: string | null;
  semantic_type: SemanticType | null;
  validation: ValidationRules | null;
  output_script: OutputScript;
  position: number;
  dynamic_options: boolean;
  choice_hint: ChoiceHint | null;
};

const BASE_COLUMNS =
  'id, user_id, session_code, status, form_name, page_url, page_origin, page_title, analysis_status, expires_at, paired_at, created_at';
const SESSION_COLUMNS = `${BASE_COLUMNS}, reset_seq, reset_scope, desktop_state, desktop_report`;

/** Defaults for the migration-0005 columns (Start over, desktop tab state) on rows read without them. */
export function withSessionDefaults(row: Record<string, unknown>): SessionRow {
  return { reset_seq: 0, reset_scope: null, desktop_state: 'open', desktop_report: null, ...row } as SessionRow;
}

/** Reads one session. Works before migration 0005 is applied too (its columns get their defaults). */
async function selectSession(column: 'id' | 'session_code', value: string): Promise<SessionRow> {
  let res = await db().from('form_sessions').select(SESSION_COLUMNS).eq(column, value).maybeSingle();
  if (res.error?.code === '42703') res = await db().from('form_sessions').select(BASE_COLUMNS).eq(column, value).maybeSingle();
  const row = must(res);
  if (!row) throw fail(404, 'Session not found');
  return withSessionDefaults(row as Record<string, unknown>);
}

export const getSessionByCode = (code: string) => selectSession('session_code', code);
export const getSessionById = (id: string) => selectSession('id', id);

export async function getFieldRows(sessionId: string): Promise<FieldRow[]> {
  return must(
    await db().from('form_fields').select('*').eq('session_id', sessionId).order('position'),
  ) as FieldRow[];
}

export function toSessionField(f: FieldRow): SessionField {
  return {
    id: f.id,
    field_key: f.field_key,
    label: f.clean_label || f.label || f.field_key,
    field_type: f.field_type,
    required: f.required,
    options: f.options ?? [],
    multiple: f.multiple,
    semantic_type: f.semantic_type,
    step_index: f.step_index,
    position: f.position,
    depends_on: f.depends_on,
    dynamic_options: f.dynamic_options ?? false,
    choice_hint: f.choice_hint ?? null,
  };
}

export const toSessionInfo = (s: SessionRow): SessionInfo => ({
  id: s.id,
  form_name: s.form_name,
  page_url: s.page_url,
  status: s.status,
  expires_at: s.expires_at,
  reset_seq: s.reset_seq ?? 0,
  reset_scope: s.reset_scope ?? null,
  desktop_state: s.desktop_state ?? 'open',
  desktop_report: s.desktop_report ?? null,
});

export async function getValues(sessionId: string): Promise<SessionValue[]> {
  return must(
    await db()
      .from('field_values')
      .select('field_id, value, confidence, source_phrase, source_seq, updated_at')
      .eq('session_id', sessionId),
  ) as SessionValue[];
}

export async function getUtterances(sessionId: string): Promise<UtteranceRow[]> {
  return must(
    await db().from('utterances').select('*').eq('session_id', sessionId).order('seq', { ascending: false }).limit(50),
  ) as UtteranceRow[];
}

export async function getSnapshot(session: SessionRow): Promise<SessionSnapshot> {
  const [fields, values, utterances] = await Promise.all([
    getFieldRows(session.id),
    getValues(session.id),
    getUtterances(session.id),
  ]);
  return {
    session: toSessionInfo(session),
    fields: fields.map(toSessionField),
    values,
    // Utterances from before a Start over are deleted by reset_session; also hide any that raced it.
    utterances: utterances.filter((u) => u.seq > (session.reset_seq ?? 0)),
  };
}

/** Next seq for the phone: one past anything spoken, edited or reset so far. */
export function nextSeq(values: SessionValue[], utterances: UtteranceRow[], resetSeq = 0): number {
  return Math.max(0, resetSeq, ...values.map((v) => v.source_seq), ...utterances.map((u) => u.seq)) + 1;
}

/** Sessions stay usable for the code TTL plus the phone JWT TTL; after that they are expired. */
export function assertWritable(session: SessionRow) {
  if (session.status === 'expired') throw fail(410, 'This session has expired. Scan a new QR code.');
}

/** The phone may speak / edit / start over: not expired, desktop tab not closed, seq newer than the last reset. */
export function assertPhoneCanWrite(session: SessionRow, seq?: number) {
  assertWritable(session);
  const block = phoneWriteBlock(session, seq);
  if (block) throw fail(409, block, { code: session.desktop_state === 'closed' ? 'tab_closed' : 'cleared' });
}

export async function upsertValue(args: {
  sessionId: string;
  fieldId: string;
  value: string | null;
  confidence: number | null;
  sourcePhrase: string | null;
  seq: number;
  utteranceId: string | null;
}): Promise<boolean> {
  return must(
    await db().rpc('upsert_field_value', {
      p_session: args.sessionId,
      p_field: args.fieldId,
      p_value: args.value,
      p_confidence: args.confidence,
      p_source_phrase: args.sourcePhrase,
      p_seq: args.seq,
      p_utterance: args.utteranceId,
    }),
  ) as boolean;
}
