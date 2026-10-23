import { z } from 'zod';

// ---------- Detector output ----------

export const FieldType = z.enum([
  'text',
  'email',
  'tel',
  'number',
  'url',
  'password',
  'textarea',
  'select',
  'radio',
  'checkbox',
  'date',
  'contenteditable',
  'combobox',
  /** File upload (photo / PDF): filled from the phone's camera or files, never by voice. */
  'file',
]);
export type FieldType = z.infer<typeof FieldType>;

export const FieldOption = z.object({
  value: z.string(),
  label: z.string(),
});
export type FieldOption = z.infer<typeof FieldOption>;

export const FieldDescriptor = z.object({
  field_key: z.string().min(1).max(300),
  label: z.string().max(500),
  field_type: FieldType,
  required: z.boolean(),
  options: z.array(FieldOption).max(1000).default([]),
  /** True for a checkbox group (several boxes sharing one name). */
  multiple: z.boolean().default(false),
  /** Dropdown whose options load later (empty or disabled when scanned, e.g. Taluk before District). */
  dynamic_options: z.boolean().default(false),
  group_key: z.string().nullable().default(null),
  depends_on: z.string().nullable().default(null),
  step_index: z.number().int().min(0).default(0),
  min: z.string().nullable().default(null),
  max: z.string().nullable().default(null),
  pattern: z.string().nullable().default(null),
  placeholder: z.string().nullable().default(null),
  /** Short text around the field (help text, error messages). */
  context: z.string().max(1000).nullable().default(null),
  /** File inputs: the `accept` attribute (".pdf", "image/*", …). */
  accept: z.string().max(300).nullable().default(null),
});
export type FieldDescriptor = z.infer<typeof FieldDescriptor>;
export type FieldDescriptorInput = z.input<typeof FieldDescriptor>;

export const FormSchema = z.object({
  page_url: z.string().url(),
  page_title: z.string().max(500),
  form_title: z.string().max(500).nullable().default(null),
  html_snippet: z.string().max(20000).default(''),
  fields: z.array(FieldDescriptor).min(1).max(200),
});
export type FormSchema = z.infer<typeof FormSchema>;
export type FormSchemaInput = z.input<typeof FormSchema>;

// ---------- AI layer ----------
// Agent output types use only required / nullable properties so they work with
// strict JSON-schema structured output.

export const SemanticType = z.enum([
  'full_name',
  'first_name',
  'last_name',
  'email',
  'phone',
  'date',
  'date_of_birth',
  'address',
  'city',
  'district',
  'state',
  'country',
  'pincode',
  'gst',
  'pan',
  'aadhaar',
  'number',
  'url',
  'gender',
  'marital_status',
  'company',
  'occupation',
  'boolean',
  'choice',
  'free_text',
  'other',
]);
export type SemanticType = z.infer<typeof SemanticType>;

export const OutputScript = z.enum(['en', 'ta']);
export type OutputScript = z.infer<typeof OutputScript>;

export const ValidationRules = z.object({
  regex: z.string().nullable(),
  min_length: z.number().int().nullable(),
  max_length: z.number().int().nullable(),
  format: z.string().nullable().describe('Human-readable format hint, e.g. "DD/MM/YYYY" or "10 digits"'),
});
export type ValidationRules = z.infer<typeof ValidationRules>;

/** What a file upload field takes, read from `accept` and the page text by the Form Analyzer. */
export const FileRules = z.object({
  kind: z.enum(['photo', 'signature', 'document']),
  formats: z.array(z.enum(['jpg', 'png', 'pdf'])).describe('Allowed formats; empty if the page does not say'),
  max_kb: z.number().nullable().describe('Largest allowed size in KB, only if the page states it'),
  min_kb: z.number().nullable(),
  max_pages: z.number().int().nullable().describe('PDFs: most pages allowed, if stated'),
  width_px: z.number().int().nullable().describe('Required image width in pixels, if stated'),
  height_px: z.number().int().nullable(),
  note: z.string().nullable().describe('Other stated requirements, e.g. "Passport size, white background"'),
});
export type FileRules = z.infer<typeof FileRules>;
export type FileFormat = FileRules['formats'][number];

export const FieldAnalysis = z.object({
  field_key: z.string(),
  clean_label: z.string(),
  semantic_type: SemanticType,
  required: z.boolean(),
  validation: ValidationRules,
  depends_on: z.string().nullable(),
  step_index: z.number().int(),
  output_script: OutputScript,
  label_ta: z.string().describe("Short Tamil translation of the label for the phone screen, e.g. \"தந்தை பெயர்\" for Father's name"),
  file_rules: FileRules.nullable().describe('Only for file upload fields (type file); null for every other field'),
});
export type FieldAnalysis = z.infer<typeof FieldAnalysis>;

export const FormAnalysis = z.object({
  form_purpose: z.string().describe('Short sentence-case name for the form, e.g. "Customer onboarding"'),
  fields: z.array(FieldAnalysis),
});
export type FormAnalysis = z.infer<typeof FormAnalysis>;

export const NumberPart = z.object({
  heard: z.string().describe('One spoken piece, as transcribed: "rendu", "double two", "ஒன்பது", "98"'),
  digits: z.string().describe('The digits for exactly that piece: "2", "22", "9", "98"'),
});

export const MappedValue = z.object({
  field_key: z.string(),
  value: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  source_phrase: z.string().nullable(),
  number_parts: z
    .array(NumberPart)
    .nullable()
    .describe('For numbers spoken as words (phone, Aadhaar, PIN…): every spoken piece in order with its digits. null otherwise.'),
});
export type MappedValue = z.infer<typeof MappedValue>;

/** Spoken commands: the phone always asks before acting on one. */
export const VoiceCommand = z.enum(['start_over', 'send', 'whats_left']);
export type VoiceCommand = z.infer<typeof VoiceCommand>;

export const MappingResult = z.object({
  values: z.array(MappedValue),
  unmapped_speech: z.string().nullable(),
  missing_required: z.array(z.string()),
  command: VoiceCommand.nullable().describe(
    'Only when the whole speech is a command: "start over"/"clear everything" → start_over, "send it" → send, "what is left?" → whats_left. null otherwise.',
  ),
});
export type MappingResult = z.infer<typeof MappingResult>;

// ---------- API DTOs ----------

export const Phone = z.string().regex(/^\d{6,15}$/, 'Phone must be 6–15 digits');
export const Pin = z.string().regex(/^\d{5}$/, 'PIN must be 5 digits');

export const LoginRequest = z.object({ phone: Phone, pin: Pin });
export type LoginRequest = z.infer<typeof LoginRequest>;

export const UserRole = z.enum(['admin', 'user']);
export type UserRole = z.infer<typeof UserRole>;

export type PublicUser = {
  id: string;
  name: string;
  phone: string;
  role: UserRole;
};

export type LoginResponse = {
  token: string;
  expires_at: string;
  user: PublicUser;
};

export type ApiError = {
  error: string;
  /** Remaining PIN attempts before lockout, when relevant. */
  attempts_left?: number;
  locked_until?: string;
  /** Machine-readable reason, e.g. 'tab_closed' or 'cleared' (phone requests). */
  code?: string;
};

export const CreateUserRequest = z.object({
  name: z.string().trim().min(1).max(100),
  phone: Phone,
  pin: Pin,
  role: UserRole.default('user'),
});
export type CreateUserRequest = z.infer<typeof CreateUserRequest>;

export const UpdateUserRequest = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  phone: Phone.optional(),
  pin: Pin.optional(),
  role: UserRole.optional(),
  is_active: z.boolean().optional(),
  unlock: z.boolean().optional(),
});
export type UpdateUserRequest = z.infer<typeof UpdateUserRequest>;

export type AdminUserRow = PublicUser & {
  is_active: boolean;
  failed_attempts: number;
  locked_until: string | null;
  created_at: string;
};

export type CreateSessionResponse = {
  session_id: string;
  session_code: string;
  qr_url: string;
  expires_at: string;
  form_name: string;
};

export type SessionStatus = 'waiting' | 'paired' | 'filled' | 'expired';

export type ChoiceReason = 'ambiguous' | 'no_match' | 'parent_changed' | 'not_loaded';

/** Set on a dropdown field when the spoken value couldn't be matched to the loaded options: the phone shows a picker. */
export type ChoiceHint = {
  spoken: string;
  /** Best candidates, most likely first (may be empty). */
  top: string[];
  reason: ChoiceReason;
};

export type SessionField = {
  id: string;
  field_key: string;
  label: string;
  field_type: FieldType;
  required: boolean;
  options: FieldOption[];
  multiple: boolean;
  semantic_type: SemanticType | null;
  step_index: number;
  position: number;
  /** Parent field this one's options depend on (District for Taluk). */
  depends_on: string | null;
  dynamic_options: boolean;
  choice_hint: ChoiceHint | null;
  /** Tamil translation of the label (phone screens in Tamil). */
  label_ta?: string | null;
  /** File upload fields: the input's `accept` and the rules read from the page. */
  accept?: string | null;
  file_rules?: FileRules | null;
};

export type FileStatus = 'uploaded' | 'filled' | 'rejected';

/** A file the phone uploaded for a file field (one live file per field; a newer one replaces it). */
export type FieldFile = {
  id: string;
  field_id: string;
  file_name: string;
  mime: string;
  bytes: number;
  pages: number | null;
  status: FileStatus;
  /** Why the website refused it (its own size/type check), when rejected. */
  reason: string | null;
  created_at: string;
};

export type SessionValue = {
  field_id: string;
  value: string | null;
  confidence: number | null;
  source_phrase: string | null;
  source_seq: number;
  updated_at: string;
};

export type UtteranceStatus = 'processing' | 'done' | 'error';

export type UtteranceRow = {
  id: string;
  session_id: string;
  seq: number;
  target_field_key: string | null;
  status: UtteranceStatus;
  transcript: string | null;
  error: string | null;
  /** Pieces of one long recording share this id (null for a single-piece recording on old rows). */
  recording_id?: string | null;
  /** 0, 1, 2… within the recording. */
  part?: number | null;
  created_at: string;
};

/** 'phone' = Start over clears the phone's answers; 'both' = also clears the form on the computer. */
export type ResetScope = 'phone' | 'both';

/** The desktop form tab: still on the form's site, moved to another site, or closed. */
export type DesktopState = 'open' | 'moved' | 'closed';

/** The extension's last full fill (after Send to desktop / Fill form), shown on the phone. */
export type DesktopReport = { filled: number; skipped: number; total: number; at: string };

export type SessionInfo = {
  id: string;
  form_name: string;
  page_url: string;
  status: SessionStatus;
  expires_at: string;
  /** Seq of the last Start over (0 = never). Values and utterances older than this are gone. */
  reset_seq: number;
  reset_scope: ResetScope | null;
  desktop_state: DesktopState;
  desktop_report: DesktopReport | null;
};

export type PairResponse = {
  token: string;
  token_expires_at: string;
  session: SessionInfo;
  fields: SessionField[];
  values: SessionValue[];
  utterances: UtteranceRow[];
  next_seq: number;
};

/** Extension: snapshot of a session it created. */
export type SessionSnapshot = {
  session: SessionInfo;
  fields: SessionField[];
  values: SessionValue[];
  utterances: UtteranceRow[];
  /** Files uploaded from the phone (migration 0007). */
  files?: FieldFile[];
};

export const FileMime = z.enum(['image/jpeg', 'image/png', 'application/pdf']);

/** Phone → server: ask where to upload a file it has prepared (checked against the field's rules). */
export const FileUploadUrlRequest = z.object({
  field_key: z.string(),
  mime: FileMime,
  bytes: z.number().int().min(1),
  pages: z.number().int().min(1).nullable().default(null),
});
export type FileUploadUrlRequest = z.infer<typeof FileUploadUrlRequest>;
export type FileUploadUrlResponse = { path: string; token: string };

/** Phone → server: the upload finished; the server checks the stored file before the computer sees it. */
export const FileCommitRequest = z.object({
  field_key: z.string(),
  path: z.string().min(1).max(500),
  file_name: z.string().min(1).max(200),
  pages: z.number().int().min(1).nullable().default(null),
});
export type FileCommitRequest = z.infer<typeof FileCommitRequest>;

/** Extension → server: the file was put into the page (it is then deleted), or the website refused it. */
export const FileStatusRequest = z.object({
  status: z.enum(['filled', 'rejected']),
  reason: z.string().max(500).nullable().default(null),
});
export type FileStatusRequest = z.infer<typeof FileStatusRequest>;

export const PatchValuesRequest = z.object({
  /** The phone's next seq: manual edits win over older speech. */
  seq: z.number().int().min(1),
  values: z
    .array(z.object({ field_key: z.string(), value: z.string().max(5000).nullable() }))
    .min(1)
    .max(200),
});
export type PatchValuesRequest = z.infer<typeof PatchValuesRequest>;

export type UtteranceResponse = {
  utterance_id: string;
  seq: number;
  status: UtteranceStatus;
  transcript: string | null;
  values: MappedValue[];
  unmapped_speech: string | null;
  /** A spoken command ("start over", "send it", "what is left?"): the phone asks before acting. */
  command?: VoiceCommand | null;
  error?: string;
};

export const ChoiceHintSchema = z.object({
  spoken: z.string().max(500),
  top: z.array(z.string().max(300)).max(10),
  reason: z.enum(['ambiguous', 'no_match', 'parent_changed', 'not_loaded']),
});

/** Extension → server: dropdown options as loaded on the page, and picker hints for the phone. */
export const UpdateFieldsRequest = z.object({
  fields: z
    .array(
      z.object({
        field_key: z.string(),
        options: z.array(FieldOption).max(3000).optional(),
        choice_hint: ChoiceHintSchema.nullable().optional(),
      }),
    )
    .min(1)
    .max(200),
});
export type UpdateFieldsRequest = z.infer<typeof UpdateFieldsRequest>;

/** Server → extension: fields added to a session after the first scan (a wizard's next step, a revealed field). */
export type AddFieldsResponse = { fields: SessionField[] };

/** Phone → server: Start over. `seq` is the phone's next seq, so anything said before it loses. */
export const ResetRequest = z.object({
  seq: z.number().int().min(1),
  scope: z.enum(['phone', 'both']),
});
export type ResetRequest = z.infer<typeof ResetRequest>;

/** Extension → server: the form tab's state, and/or the result of a full fill. */
export const DesktopUpdateRequest = z
  .object({
    state: z.enum(['open', 'moved', 'closed']).optional(),
    report: z
      .object({
        filled: z.number().int().min(0),
        skipped: z.number().int().min(0),
        total: z.number().int().min(0),
      })
      .optional(),
  })
  .refine((b) => b.state || b.report, 'Nothing to update');
export type DesktopUpdateRequest = z.infer<typeof DesktopUpdateRequest>;

/** Extension → server: pick the option the speaker meant from the options loaded on the page. */
export const ResolveOptionRequest = z.object({
  session_code: z.string(),
  field_key: z.string(),
  spoken: z.string().min(1).max(500),
  options: z.array(FieldOption).min(1).max(3000),
});
export type ResolveOptionRequest = z.infer<typeof ResolveOptionRequest>;

export type ResolveOptionResponse = {
  /** Exact label of the chosen option, or null when unsure. */
  choice: string | null;
  ambiguous: boolean;
  /** Best candidates (labels), most likely first. */
  top: string[];
};

// ---------- Extension messaging ----------

/** field_key → value to put into the page. */
export type FillPayload = { values: Record<string, string | null> };

export type FillReport = {
  filled: string[];
  skipped: { field_key: string; reason: string }[];
  /** Dropdowns where the spoken value couldn't be matched; the phone shows a picker. */
  unresolved?: { field_key: string; spoken: string; top: string[]; reason: ChoiceReason }[];
  /** Options of dropdowns whose lists loaded during the fill (sent to the phone for editing). */
  options?: Record<string, FieldOption[]>;
};
