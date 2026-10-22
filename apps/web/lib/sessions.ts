import 'server-only';
import type {
  ChoiceHint,
  FieldDescriptor,
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
  /** Migration 0006. */
  label_ta?: string | null;
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

/** form_fields rows for detected fields, placed from `startPosition` (and in `stepIndex` when given). */
export function fieldRows(sessionId: string, fields: FieldDescriptor[], startPosition = 0, stepIndex?: number) {
  return fields.map((f, i) => ({
    session_id: sessionId,
    field_key: f.field_key,
    label: f.label,
    field_type: f.field_type,
    required: f.required,
    options: f.options,
    multiple: f.multiple,
    dynamic_options: f.dynamic_options,
    group_key: f.group_key,
    depends_on: f.depends_on,
    step_index: stepIndex ?? f.step_index,
    min: f.min,
    max: f.max,
    pattern: f.pattern,
    placeholder: f.placeholder,
    context: f.context,
    position: startPosition + i,
  }));
}

/** Inserts field rows and returns them. Works before migration 0004 too (without `dynamic_options`). */
export async function insertFieldRows(rows: ReturnType<typeof fieldRows>): Promise<FieldRow[]> {
  let res = await db().from('form_fields').insert(rows).select('*');
  if (res.error?.code === 'PGRST204') {
    res = await db()
      .from('form_fields')
      .insert(rows.map(({ dynamic_options: _d, ...r }) => r))
      .select('*');
  }
  return must(res) as FieldRow[];
}

/** Fields the session doesn't have yet, with where they go: after the last field, in the next step. */
export function newFieldsPlacement(existing: Pick<FieldRow, 'field_key' | 'position' | 'step_index'>[], fields: FieldDescriptor[]) {
  const have = new Set(existing.map((f) => f.field_key));
  const seen = new Set<string>();
  const fresh = fields.filter((f) => !have.has(f.field_key) && !seen.has(f.field_key) && seen.add(f.field_key));
  return {
    fresh,
    startPosition: Math.max(-1, ...existing.map((f) => f.position)) + 1,
    stepIndex: Math.max(0, ...existing.map((f) => f.step_index ?? 0)) + 1,
  };
}

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
    label_ta: f.label_ta ?? null,
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

/**
 * The last few recordings before `beforeSeq` (since the last Start over), oldest first, with the
 * fields each one still holds: context for corrections like "no, not Jahan, Jagan". Earlier pieces of
 * the recording being mapped are left out (they are already joined into its transcript).
 */
export async function recentSpeech(
  session: Pick<SessionRow, 'id' | 'reset_seq'>,
  beforeSeq: number,
  recordingId: string | null,
  fields: Pick<FieldRow, 'id' | 'field_key'>[],
  values: SessionValue[],
  limit = 3,
): Promise<{ speech: string; set: Record<string, string | null> }[]> {
  const { data, error } = await db()
    .from('utterances')
    .select('seq, transcript, recording_id')
    .eq('session_id', session.id)
    .eq('status', 'done')
    .lt('seq', beforeSeq)
    .gt('seq', session.reset_seq ?? 0)
    .order('seq', { ascending: false })
    .limit(limit * 3);
  if (error || !data) return [];
  const keyById = new Map(fields.map((f) => [f.id, f.field_key]));
  return (data as { seq: number; transcript: string | null; recording_id: string | null }[])
    .filter((r) => r.transcript?.trim() && (!recordingId || r.recording_id !== recordingId))
    .slice(0, limit)
    .reverse()
    .map((r) => ({
      speech: r.transcript!.trim().slice(0, 400),
      set: Object.fromEntries(
        values.filter((v) => v.source_seq === r.seq && keyById.has(v.field_id)).map((v) => [keyById.get(v.field_id)!, v.value]),
      ),
    }));
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
