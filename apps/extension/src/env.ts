export const API_BASE = (import.meta.env.VITE_API_BASE || 'http://localhost:3000').replace(/\/$/, '');
export const SUPABASE_URL: string | undefined = import.meta.env.VITE_SUPABASE_URL;
export const SUPABASE_ANON_KEY: string | undefined = import.meta.env.VITE_SUPABASE_ANON_KEY;
/** Privacy policy page, linked from the consent notice on the sign-in card (Chrome Web Store requirement). */
/** Where people get an account or renew their plan (a WhatsApp link or a page on your site); empty hides the links. */
export const ACCOUNT_URL: string = import.meta.env.VITE_ACCOUNT_URL || '';
export const PRIVACY_URL: string = import.meta.env.VITE_PRIVACY_URL || `${API_BASE}/privacy`;
