const IST_MS = 330 * 60_000;

/** Today in India time, YYYY-MM-DD. */
export const todayIst = () => new Date(Date.now() + IST_MS).toISOString().slice(0, 10);

/** First and last day of the month `back` months before this one (India time); this month ends today. */
export function monthRange(back: number): { from: string; to: string } {
  const now = new Date(Date.now() + IST_MS);
  const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
  const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back + 1, 0));
  const to = back === 0 ? todayIst() : last.toISOString().slice(0, 10);
  return { from: first.toISOString().slice(0, 10), to };
}

export const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

export const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "24 Nov 2026" in India time. */
export const shortDate = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
