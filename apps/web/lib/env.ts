import 'server-only';

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name}`);
  return v;
}

/** Read lazily so `next build` works without secrets. */
export const env = {
  get supabaseUrl() {
    return process.env.SUPABASE_URL || required('NEXT_PUBLIC_SUPABASE_URL');
  },
  get serviceRoleKey() {
    return required('SUPABASE_SERVICE_ROLE_KEY');
  },
  get jwtSecret() {
    return required('SUPABASE_JWT_SECRET');
  },
  get openaiKey() {
    return required('OPENAI_API_KEY');
  },
  get agentModel() {
    return process.env.AGENT_MODEL || 'gpt-4o';
  },
  get transcribeModel() {
    return process.env.TRANSCRIBE_MODEL || 'gpt-4o-transcribe';
  },
  get publicBaseUrl() {
    return (process.env.PUBLIC_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
  },
  get isProd() {
    return process.env.NODE_ENV === 'production';
  },
};
