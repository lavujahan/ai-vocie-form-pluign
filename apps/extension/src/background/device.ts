/**
 * This computer's id for the plan counter "Computers": random, made once and kept in this Chrome profile.
 * The server counts the computers a user is signed in on by it; it says nothing about the computer.
 */
const DEVICE_KEY = 'vff:device_key';

export async function deviceKey(): Promise<string> {
  const stored = (await chrome.storage.local.get(DEVICE_KEY))[DEVICE_KEY];
  if (typeof stored === 'string' && /^[\w-]{16,64}$/.test(stored)) return stored;
  const key = crypto.randomUUID();
  await chrome.storage.local.set({ [DEVICE_KEY]: key });
  return key;
}

/** "Chrome · Windows": how the computer is shown in the list of computers signed in. */
export function deviceLabel(ua = navigator.userAgent): string {
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : 'Chrome';
  const os = /Windows/.test(ua) ? 'Windows' : /CrOS/.test(ua) ? 'ChromeOS' : /Mac OS X/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : null;
  return os ? `${browser} · ${os}` : browser;
}
