'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import type { BillingSettings, UsageSummaryResponse, UsageSummaryRow } from '@vff/shared';
import { Button, Card, Input } from '@/components/ui';
import { AdminNav } from '../admin-nav';
import { api } from '../api';

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

      <div className="mb-4 grid gap-3 md:grid-cols-[auto_1fr]">
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
                <th className="px-4 py-2 text-right font-medium">Tokens</th>
                <th className="px-4 py-2 text-right font-medium">Sarvam</th>
                <th className="px-4 py-2 text-right font-medium">OpenAI</th>
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
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted">
                    No AI usage in this month.
                  </td>
                </tr>
              )}
              {!data && loading && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted">
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
        Estimates from official list prices (checked 23 Oct 2026):{' '}
        <a className="underline" href="https://www.sarvam.ai/api-pricing" target="_blank" rel="noreferrer">
          Sarvam speech-to-text
        </a>{' '}
        is billed per minute of audio;{' '}
        <a className="underline" href="https://developers.openai.com/api/docs/pricing" target="_blank" rel="noreferrer">
          OpenAI
        </a>{' '}
        per token in USD, converted at your rate. Months follow India time.
      </p>
    </main>
  );
}

function UsageCells({ row }: { row: Omit<UsageSummaryRow, 'user_id' | 'name' | 'phone'> }) {
  return (
    <>
      <td className="px-4 py-2.5 text-right tabular-nums" title={`${num.format(row.stt_calls)} recordings`}>
        {mins.format(row.minutes)}
      </td>
      <td
        className="px-4 py-2.5 text-right tabular-nums"
        title={`Input ${num.format(row.input_tokens)} (cached ${num.format(row.cached_input_tokens)}) · Output ${num.format(row.output_tokens)} · ${num.format(row.llm_calls)} runs`}
      >
        {num.format(row.tokens)}
      </td>
      <td className="px-4 py-2.5 text-right tabular-nums">{inr.format(row.sarvam_inr)}</td>
      <td className="px-4 py-2.5 text-right tabular-nums" title={`$${row.openai_usd.toFixed(4)}`}>
        {inr.format(row.openai_inr)}
      </td>
      <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{inr.format(row.total_inr)}</td>
    </>
  );
}

function RatesCard({ settings, onSaved }: { settings: BillingSettings; onSaved: () => void }) {
  const [usd, setUsd] = useState(String(settings.usd_inr_rate));
  const [sarvam, setSarvam] = useState(String(settings.sarvam_inr_per_min));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    setUsd(String(settings.usd_inr_rate));
    setSarvam(String(settings.sarvam_inr_per_min));
  }, [settings.usd_inr_rate, settings.sarvam_inr_per_min]);

  const usdN = Number(usd);
  const sarvamN = Number(sarvam);
  const valid = usdN > 0 && usdN <= 1000 && sarvamN > 0 && sarvamN <= 100;
  const changed = usdN !== settings.usd_inr_rate || sarvamN !== settings.sarvam_inr_per_min;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await api('/api/admin/billing-settings', {
        method: 'PATCH',
        body: JSON.stringify({ usd_inr_rate: usdN, sarvam_inr_per_min: sarvamN }),
      });
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
      <form onSubmit={save} className="flex flex-wrap items-end gap-3">
        <label className="block min-w-36 flex-1">
          <span className="text-xs font-medium text-muted">1 USD in ₹ (OpenAI)</span>
          <Input type="number" inputMode="decimal" step="0.01" min="0.01" value={usd} onChange={(e) => setUsd(e.target.value)} className="mt-1" />
        </label>
        <label className="block min-w-36 flex-1">
          <span className="text-xs font-medium text-muted">Sarvam ₹ per minute</span>
          <Input type="number" inputMode="decimal" step="0.01" min="0.01" value={sarvam} onChange={(e) => setSarvam(e.target.value)} className="mt-1" />
        </label>
        <Button type="submit" variant="primary" loading={busy} disabled={!valid || !changed}>
          Save rates
        </Button>
        {msg && <p className={`w-full text-xs ${msg.ok ? 'text-live-ink' : 'text-danger-ink'}`}>{msg.text}</p>}
      </form>
    </Card>
  );
}
