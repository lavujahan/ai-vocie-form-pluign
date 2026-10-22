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

const SESSION_COLUMNS =
  'id, user_id, session_code, status, form_name, page_url, page_origin, page_title, analysis_status, expires_at, paired_at, created_at';

export async function getSessionByCode(code: string): Promise<SessionRow> {
  const row = must(await db().from('form_sessions').select(SESSION_COLUMNS).eq('session_code', code).maybeSingle());
  if (!row) throw fail(404, 'Session not found');
  return row as SessionRow;
}

export async function getSessionById(id: string): Promise<SessionRow> {
  const row = must(await db().from('form_sessions').select(SESSION_COLUMNS).eq('id', id).maybeSingle());
  if (!row) throw fail(404, 'Session not found');
  return row as SessionRow;
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
  };
}

export const toSessionInfo = (s: SessionRow): SessionInfo => ({
  id: s.id,
  form_name: s.form_name,
  page_url: s.page_url,
  status: s.status,
  expires_at: s.expires_at,
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
  return { session: toSessionInfo(session), fields: fields.map(toSessionField), values, utterances };
}

/** Next seq for the phone: one past anything spoken or edited so far. */
export function nextSeq(values: SessionValue[], utterances: UtteranceRow[]): number {
  return Math.max(0, ...values.map((v) => v.source_seq), ...utterances.map((u) => u.seq)) + 1;
}

/** Sessions stay usable for the code TTL plus the phone JWT TTL; after that they are expired. */
export function assertWritable(session: SessionRow) {
  if (session.status === 'expired') throw fail(410, 'This session has expired. Scan a new QR code.');
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
