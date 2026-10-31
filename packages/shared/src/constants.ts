/** Pairing code (QR) lifetime. Single-use. */
export const PAIR_CODE_TTL_MIN = 10;
/** Phone session JWT lifetime, longer than the code so a slow user keeps Realtime. */
export const SESSION_JWT_TTL_MIN = 30;
/** Answers a customer has sent wait this long for the operator (a site's logout must not lose them). */
export const SENT_HOLD_MIN = 120;
/** Picking up waiting answers leaves at least this long to fill the form. */
export const RESUME_HOLD_MIN = 30;
/** Waiting forms listed in the extension. */
export const MAX_HELD_FORMS = 5;
/** Extension / admin user JWT lifetime. */
export const USER_JWT_TTL_HOURS = 12;

export const MAX_PIN_ATTEMPTS = 5;
export const LOCK_MINUTES = 15;
/** Login attempts allowed per IP inside the LOCK_MINUTES window. */
export const IP_ATTEMPT_LIMIT = 20;

/** Below this, the phone and popup show the value as "check this". */
export const LOW_CONFIDENCE = 0.6;

/** Tamil helper on the phone page: the longest English text translated at once. */
export const TRANSLATE_MAX_CHARS = 500;

export const USER_COOKIE = 'vf_session';

/** Admin → Users → Add minutes: the default top-up. */
export const TOPUP_MINUTES = 50;
export const TOPUP_PRICE_INR = 79;
