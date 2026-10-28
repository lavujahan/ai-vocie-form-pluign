/** Login PINs are this many digits (extension popup, admin panel). */
export const PIN_LENGTH = 6;

/**
 * True for a PIN that is easy to guess: all digits the same (111111), a straight run up or down
 * (123456, 654321, 890123), or a repeated pair or half (121212, 123123).
 */
export function isWeakPin(pin: string): boolean {
  const d = [...pin].map(Number);
  const steps = d.slice(1).map((x, i) => (x - d[i] + 10) % 10);
  if (steps.every((s) => s === steps[0]) && (steps[0] === 0 || steps[0] === 1 || steps[0] === 9)) return true;
  const repeats = (n: number) => pin.length % n === 0 && pin === pin.slice(0, n).repeat(pin.length / n);
  return repeats(2) || repeats(3);
}

/**
 * A random login PIN for the admin to give a user: PIN_LENGTH digits from the browser's or Node's crypto
 * random source (never Math.random), leading zeros allowed, easy-to-guess ones skipped.
 */
export function randomPin(): string {
  const buf = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    // 4,294,000,000 is a multiple of 10^6: drawing below it keeps every PIN equally likely.
    if (buf[0] >= 4_294_000_000) continue;
    const pin = String(buf[0] % 10 ** PIN_LENGTH).padStart(PIN_LENGTH, '0');
    if (!isWeakPin(pin)) return pin;
  }
}
