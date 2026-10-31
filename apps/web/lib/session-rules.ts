import type { DesktopState, SessionStatus } from '@vff/shared';

/**
 * What the phone may do with a session, and the messages it shows when it can't. Pure (no DB), so
 * the routes, the phone page and the tests all agree.
 */

export const MSG = {
  tabClosed: 'Tab closed. The form tab on the computer was closed. Nothing will be sent. Scan a new QR code from the computer to continue.',
  tabMoved: 'The form tab on the computer moved to another site. Open the form again on the computer to send.',
  cleared: 'This was cleared by Start over.',
  qrExpired: 'This QR code has expired. Generate a new one on the computer.',
  qrUsed: 'This QR code was already opened on another phone. Generate a new one on the computer.',
  qrUnknown: 'This QR code is not valid. Generate a new one on the computer.',
  phoneReplaced: 'This phone was disconnected because the QR code was shown again on the computer. Scan it to continue.',
  planEnded: 'Your plan has ended. Renew it to keep filling forms by voice.',
  minutesUsed: 'You have used all the voice minutes in your plan. Renew it or add minutes to continue.',
  voiceOff: 'Voice is off for this form. Tap Type on a field to fill it.',
  heldGone: 'These answers are no longer available. Scan the form again.',
} as const;

type SessionState = { status: SessionStatus; desktop_state: DesktopState; reset_seq: number };

/** Why the phone can't speak, edit or start over (null = allowed). `seq` = the request's seq. */
export function phoneWriteBlock(s: SessionState, seq?: number): string | null {
  if (s.desktop_state === 'closed') return MSG.tabClosed;
  if (seq !== undefined && seq <= s.reset_seq) return MSG.cleared;
  return null;
}

/** A typing-only form (the operator turned voice off): recordings are refused before any AI is spent. */
export function voiceBlock(s: { voice_enabled?: boolean }): string | null {
  return s.voice_enabled === false ? MSG.voiceOff : null;
}

/** Sent answers still waiting for the operator (migration 0022): they survive a closed form tab. */
export function isHeld(s: { status: SessionStatus; hold_until?: string | null }, now = Date.now()): boolean {
  return s.status !== 'expired' && !!s.hold_until && Date.parse(s.hold_until) > now;
}

/** Why "Send to desktop" isn't possible right now (null = allowed). */
export function sendBlock(s: SessionState): string | null {
  if (s.desktop_state === 'closed') return MSG.tabClosed;
  if (s.desktop_state === 'moved') return MSG.tabMoved;
  return null;
}

/**
 * A phone token belongs to the session's current pairing: "Connect phone again" on the computer pairs
 * a new phone, and tokens from the earlier pairing stop working. Compared as times (the database may
 * write the same moment differently). Tokens without the claim (issued before this check) still pass.
 */
export function phoneTokenCurrent(claimPairedAt: string | undefined, sessionPairedAt: string | null): boolean {
  if (!claimPairedAt) return true;
  if (!sessionPairedAt) return false;
  return Date.parse(claimPairedAt) === Date.parse(sessionPairedAt);
}

/** Message for a QR code that couldn't be paired (the single-use, unexpired check failed). */
export function pairFailure(s: { status: SessionStatus } | null): string {
  if (!s) return MSG.qrUnknown;
  if (s.status === 'paired' || s.status === 'filled') return MSG.qrUsed;
  return MSG.qrExpired;
}
