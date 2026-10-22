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
} as const;

type SessionState = { status: SessionStatus; desktop_state: DesktopState; reset_seq: number };

/** Why the phone can't speak, edit or start over (null = allowed). `seq` = the request's seq. */
export function phoneWriteBlock(s: SessionState, seq?: number): string | null {
  if (s.desktop_state === 'closed') return MSG.tabClosed;
  if (seq !== undefined && seq <= s.reset_seq) return MSG.cleared;
  return null;
}

/** Why "Send to desktop" isn't possible right now (null = allowed). */
export function sendBlock(s: SessionState): string | null {
  if (s.desktop_state === 'closed') return MSG.tabClosed;
  if (s.desktop_state === 'moved') return MSG.tabMoved;
  return null;
}

/** Message for a QR code that couldn't be paired (the single-use, unexpired check failed). */
export function pairFailure(s: { status: SessionStatus } | null): string {
  if (!s) return MSG.qrUnknown;
  if (s.status === 'paired' || s.status === 'filled') return MSG.qrUsed;
  return MSG.qrExpired;
}
