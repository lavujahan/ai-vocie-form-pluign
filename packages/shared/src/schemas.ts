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
  group_key: z.string().nullable().default(null),
  depends_on: z.string().nullable().default(null),
  step_index: z.number().int().min(0).default(0),
  min: z.string().nullable().default(null),
  max: z.string().nullable().default(null),
  pattern: z.string().nullable().default(null),
  placeholder: z.string().nullable().default(null),
  /** Short text around the field (help text, error messages). */
  context: z.string().max(1000).nullable().default(null),
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
// OpenAI structured outputs in strict mode.

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

export const FieldAnalysis = z.object({
  field_key: z.string(),
  clean_label: z.string(),
  semantic_type: SemanticType,
  required: z.boolean(),
  validation: ValidationRules,
  depends_on: z.string().nullable(),
  step_index: z.number().int(),
  output_script: OutputScript,
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

export const MappingResult = z.object({
  values: z.array(MappedValue),
  unmapped_speech: z.string().nullable(),
  missing_required: z.array(z.string()),
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
  created_at: string;
};

export type SessionInfo = {
  id: string;
  form_name: string;
  page_url: string;
  status: SessionStatus;
  expires_at: string;
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
};

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
  error?: string;
};

// ---------- Extension messaging ----------

/** field_key → value to put into the page. */
export type FillPayload = { values: Record<string, string | null> };

export type FillReport = {
  filled: string[];
  skipped: { field_key: string; reason: string }[];
};
