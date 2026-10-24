'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import type { BillingSettings, UsageSummaryResponse, UsageSummaryRow } from '@vff/shared';
import { Button, Card, Input } from '@/components/ui';
import { AdminNav } from '../admin-nav';
import { api } from '../api';

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Token costs are often fractions of a cent: up to 4 decimals.
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 4 });
const num = new Intl.NumberFormat('en-IN');
const mins = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** This month in India time, YYYY-MM. */
function thisMonth(): string {
  return new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 7);
}

export function UsageAdmin() {
  const router = useRouter();
  const [month, setMonth] = useState(thisMonth);
  const [data, setData] = useState<UsageSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (m: string) => {
      setLoading(true);
      try {
        setData(await api<UsageSummaryResponse>(`/api/admin/usage?month=${encodeURIComponent(m)}`));
        setError(null);
      } catch (e) {
        setError((e as Error).message);
        if ((e as Error).message.includes('sign in')) router.replace('/admin/login');
      } finally {
        setLoading(false);
      }
    },
    [router],
  );

  useEffect(() => {
    if (/^\d{4}-\d{2}$/.test(month)) void load(month);
  }, [month, load]);

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/admin/login');
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <header className="mb-4 flex items-center justify-between gap-3">
        <AdminNav />
        <Button variant="ghost" onClick={logout} aria-label="Sign out">
          <LogOut size={16} />
        </Button>
      </header>

      <div className="mb-4 grid gap-3 lg:grid-cols-[auto_1fr]">
        <Card>
          <label className="block text-xs font-medium text-muted" htmlFor="month">
            Month
          </label>
          <Input id="month" type="month" value={month} max={thisMonth()} onChange={(e) => setMonth(e.target.value)} className="mt-1" />
        </Card>
        {data && <RatesCard settings={data.settings} onSaved={() => load(month)} />}
      </div>

      <Card className="p-0">
        {error && <p className="border-b border-line px-4 py-2 text-sm text-danger-ink">{error}</p>}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="px-4 py-2 font-medium">User</th>
                <th className="px-4 py-2 text-right font-medium">Minutes</th>
                <th className="px-4 py-2 text-right font-medium">Input tokens</th>
                <th className="px-4 py-2 text-right font-medium">Input cost</th>
                <th className="px-4 py-2 text-right font-medium">Output tokens</th>
                <th className="px-4 py-2 text-right font-medium">Output cost</th>
                <th className="px-4 py-2 text-right font-medium">OpenAI</th>
                <th className="px-4 py-2 text-right font-medium">Sarvam</th>
                <th className="px-4 py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {data?.rows.map((r) => (
                <tr key={r.user_id ?? 'unknown'} className="border-t border-line">
                  <td className="px-4 py-2.5">
                    <div className="font-medium">{r.name ?? 'Deleted user'}</div>
                    {r.phone && <div className="text-xs tabular-nums text-muted">{r.phone}</div>}
                  </td>
                  <UsageCells row={r} />
                </tr>
              ))}
              {data && !data.rows.length && !loading && (
                <tr>
                  <td colSpan={COLUMNS} className="px-4 py-8 text-center text-sm text-muted">
                    No AI usage in this month.
                  </td>
                </tr>
              )}
              {!data && loading && (
                <tr>
                  <td colSpan={COLUMNS} className="px-4 py-8 text-center text-sm text-muted">
                    Loading…
                  </td>
                </tr>
              )}
            </tbody>
            {data && data.rows.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-line bg-subtle/50 font-semibold">
                  <td className="px-4 py-2.5">Total</td>
                  <UsageCells row={data.totals} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>

      <p className="mt-3 text-xs text-muted">
        OpenAI cost per user = input tokens × your input price + output tokens × your output price (per 1M tokens, in $; cached
        input tokens count as input), shown in ₹ at your rate. A new price applies to every month. Check the{' '}
        <a className="underline" href="https://developers.openai.com/api/docs/pricing" target="_blank" rel="noreferrer">
          OpenAI prices
        </a>{' '}
        and{' '}
        <a className="underline" href="https://www.sarvam.ai/api-pricing" target="_blank" rel="noreferrer">
          Sarvam speech-to-text
        </a>{' '}
        (per minute of audio). Months follow India time.
      </p>
    </main>
  );
}

const COLUMNS = 9;

function UsageCells({ row }: { row: Omit<UsageSummaryRow, 'user_id' | 'name' | 'phone'> }) {
  return (
    <>
      <td className="px-4 py-2.5 text-right tabular-nums" title={`${num.format(row.stt_calls)} recordings`}>
        {mins.format(row.minutes)}
      </td>
      <td className="px-4 py-2.5 text-right tabular-nums" title={`${num.format(row.cached_input_tokens)} of them cached · ${num.format(row.llm_calls)} runs`}>
        {num.format(row.input_tokens)}
      </td>
      <td className="px-4 py-2.5 text-right tabular-nums">{usd.format(row.input_usd)}</td>
      <td className="px-4 py-2.5 text-right tabular-nums">{num.format(row.output_tokens)}</td>
      <td className="px-4 py-2.5 text-right tabular-nums">{usd.format(row.output_usd)}</td>
      <td className="px-4 py-2.5 text-right tabular-nums">
        <div>{usd.format(row.openai_usd)}</div>
        <div className="text-xs text-muted">{inr.format(row.openai_inr)}</div>
      </td>
      <td className="px-4 py-2.5 text-right tabular-nums">{inr.format(row.sarvam_inr)}</td>
      <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{inr.format(row.total_inr)}</td>
    </>
  );
}

/** One price field: `min` / `max` as in the server's check. */
type Rate = { key: keyof BillingSettings; label: string; min: number; max: number };

const RATES: Rate[] = [
  { key: 'input_usd_per_m', label: 'Input tokens · $ per 1M', min: 0, max: 1000 },
  { key: 'output_usd_per_m', label: 'Output tokens · $ per 1M', min: 0, max: 1000 },
  { key: 'usd_inr_rate', label: '1 USD in ₹', min: 0.01, max: 1000 },
  { key: 'sarvam_inr_per_min', label: 'Sarvam ₹ per minute', min: 0.01, max: 100 },
];

const asText = (s: BillingSettings) => Object.fromEntries(RATES.map((r) => [r.key, String(s[r.key])])) as Record<keyof BillingSettings, string>;

/** The admin's prices: OpenAI input / output tokens in $ per 1M, the $→₹ rate, Sarvam ₹ per minute. */
function RatesCard({ settings, onSaved }: { settings: BillingSettings; onSaved: () => void }) {
  const [text, setText] = useState(() => asText(settings));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => setText(asText(settings)), [settings]);

  const values = Object.fromEntries(RATES.map((r) => [r.key, Number(text[r.key])])) as BillingSettings;
  const valid = RATES.every((r) => text[r.key].trim() !== '' && values[r.key] >= r.min && values[r.key] <= r.max);
  const changed = RATES.some((r) => values[r.key] !== settings[r.key]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await api('/api/admin/billing-settings', { method: 'PATCH', body: JSON.stringify(values) });
      setMsg({ ok: true, text: 'Saved' });
      onSaved();
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <form onSubmit={save} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto] lg:items-end">
        {RATES.map((r) => (
          <label key={r.key} className="block">
            <span className="text-xs font-medium text-muted">{r.label}</span>
            <Input
              type="number"
              inputMode="decimal"
              step="any"
              min={r.min}
              max={r.max}
              value={text[r.key]}
              onChange={(e) => setText((t) => ({ ...t, [r.key]: e.target.value }))}
              className="mt-1"
            />
          </label>
        ))}
        <Button type="submit" variant="primary" loading={busy} disabled={!valid || !changed}>
          Save prices
        </Button>
        {msg && <p className={`text-xs sm:col-span-2 lg:col-span-5 ${msg.ok ? 'text-live-ink' : 'text-danger-ink'}`}>{msg.text}</p>}
      </form>
    </Card>
  );
}
