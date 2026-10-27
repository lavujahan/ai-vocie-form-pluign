'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, Pencil, RotateCcw, Search, X } from 'lucide-react';
import type { AdminFormDetail, AdminFormField, AdminFormRow, AdminFormsResponse } from '@vff/shared';
import { Button, Card, Input, Pill } from '@/components/ui';
import { AdminNav } from '../admin-nav';
import { api } from '../api';

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = new Intl.NumberFormat('en-IN');
const when = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
const day = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

type SortKey = 'last_used' | 'uses' | 'read_on';
const SORTS: { key: SortKey; label: string }[] = [
  { key: 'last_used', label: 'Last used' },
  { key: 'uses', label: 'Times reused' },
  { key: 'read_on', label: 'Read on' },
];
const time = (s: string | null) => (s ? Date.parse(s) : 0);
const sorters: Record<SortKey, (a: AdminFormRow, b: AdminFormRow) => number> = {
  last_used: (a, b) => time(b.last_used_at) - time(a.last_used_at),
  uses: (a, b) => b.uses - a.uses || time(b.last_used_at) - time(a.last_used_at),
  read_on: (a, b) => time(b.created_at) - time(a.created_at),
};

/** Admin → Forms: the saved form readings (read by the AI once, reused by every later scan). */
export function FormsAdmin() {
  const router = useRouter();
  const [data, setData] = useState<AdminFormsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('last_used');
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api<AdminFormsResponse>('/api/admin/forms'));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
      if ((e as Error).message.includes('sign in')) router.replace('/admin/login');
    }
  }, [router]);

  useEffect(() => void load(), [load]);

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/admin/login');
  }

  async function readAgain(row: AdminFormRow) {
    if (!confirm(`Read "${row.form_name}" again?\n\nThe saved reading${row.edited_at ? ' and your edits' : ''} will be cleared. The next scan of this form is read by the AI (paid once).`)) return;
    setBusy(row.fingerprint);
    try {
      await api(`/api/admin/forms/${row.fingerprint}`, { method: 'DELETE' });
      setData((d) => d && { ...d, rows: d.rows.filter((r) => r.fingerprint !== row.fingerprint) });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (data?.rows ?? []).filter((r) => !q || r.form_name.toLowerCase().includes(q) || r.page_url.toLowerCase().includes(q));
    return [...list].sort(sorters[sort]);
  }, [data, query, sort]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <header className="mb-4 flex items-center justify-between gap-3">
        <AdminNav />
        <Button variant="ghost" onClick={logout} aria-label="Sign out">
          <LogOut size={16} />
        </Button>
      </header>

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="relative min-w-60 flex-1">
          <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
          <Input placeholder="Search form name or website" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" />
        </div>
        <label className="flex items-center gap-2 text-xs text-muted">
          Sort
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="min-h-11 rounded-lg border border-line bg-card px-2 text-sm text-ink focus:border-accent-ink focus:outline-none"
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <p className="mb-3 rounded-lg bg-danger-bg px-4 py-2 text-sm text-danger-ink">{error}</p>}

      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="px-4 py-2 font-medium">Form</th>
                <th className="px-4 py-2 text-right font-medium">Fields</th>
                <th className="px-4 py-2 font-medium">Model</th>
                <th className="px-4 py-2 font-medium">Read on</th>
                <th className="px-4 py-2 font-medium">Expires</th>
                <th className="px-4 py-2 text-right font-medium">Reused</th>
                <th className="px-4 py-2 font-medium">Last used</th>
                <th className="px-4 py-2 text-right font-medium">Cost</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.fingerprint} className="border-t border-line align-top">
                  <td className="max-w-80 px-4 py-2.5">
                    <div className="flex flex-wrap items-center gap-1.5 font-medium">
                      {r.form_name}
                      {r.partial && <Pill>Later step</Pill>}
                      {r.edited_at && <Pill tone="accent">Edited</Pill>}
                      {!r.fresh && <Pill tone="warn">Read again on next scan</Pill>}
                    </div>
                    <div className="truncate text-xs text-muted" title={r.page_url}>
                      {r.page_url.replace(/^https?:\/\//, '')}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{r.field_count}</td>
                  <td className="px-4 py-2.5 text-xs whitespace-nowrap">{r.model}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap">{day.format(new Date(r.created_at))}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap">{r.expires_at ? day.format(new Date(r.expires_at)) : <span className="text-muted">Kept (edited)</span>}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{num.format(r.uses)}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap">{r.last_used_at ? when.format(new Date(r.last_used_at)) : '—'}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{r.cost_usd === null ? '—' : inr.format(r.cost_usd * (data?.usd_inr_rate ?? 0))}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-1">
                      <IconBtn label="Edit labels" onClick={() => setEditing(r.fingerprint)}>
                        <Pencil size={16} />
                      </IconBtn>
                      <IconBtn label="Read again" onClick={() => readAgain(r)} disabled={busy === r.fingerprint}>
                        <RotateCcw size={16} />
                      </IconBtn>
                    </div>
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-sm text-muted">
                    {!data
                      ? 'Loading…'
                      : data.missing
                        ? 'Apply migration 0012_form_cache.sql in Supabase to save form readings.'
                        : data.rows.length
                          ? 'No form matches the search.'
                          : 'No forms read yet. A form appears here after its first scan.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="mt-3 text-xs text-muted">
        Each form is read by the AI once; every later scan of the same form, by any user, reuses the reading for free. A reading
        is reused for 30 days, and the form is read again sooner if its fields change on the website or the AI model changes. An
        edited reading is kept until you choose Read again. Cost is the one-time reading, at your $→₹ rate. Times are India time.
      </p>

      {editing && (
        <EditDialog
          fingerprint={editing}
          onClose={() => setEditing(null)}
          onSaved={(row) => {
            setData((d) => d && { ...d, rows: d.rows.map((r) => (r.fingerprint === row.fingerprint ? row : r)) });
            setEditing(null);
          }}
        />
      )}
    </main>
  );
}

function IconBtn({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="grid size-9 place-items-center rounded-lg text-muted hover:bg-subtle hover:text-ink disabled:opacity-40"
    >
      {children}
    </button>
  );
}

/** The form's fields: the website's label, and the English / Tamil labels and required flag users see. */
function EditDialog({ fingerprint, onClose, onSaved }: { fingerprint: string; onClose: () => void; onSaved: (row: AdminFormRow) => void }) {
  const [form, setForm] = useState<AdminFormDetail | null>(null);
  const [fields, setFields] = useState<AdminFormField[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<AdminFormDetail>(`/api/admin/forms/${fingerprint}`)
      .then((d) => {
        setForm(d);
        setFields(d.fields);
      })
      .catch((e) => setError((e as Error).message));
  }, [fingerprint]);

  const set = (key: string, patch: Partial<AdminFormField>) => setFields((list) => list.map((f) => (f.field_key === key ? { ...f, ...patch } : f)));
  const changed = form ? fields.filter((f, i) => {
    const o = form.fields[i];
    return f.clean_label !== o.clean_label || f.label_ta !== o.label_ta || f.required !== o.required;
  }) : [];
  const valid = fields.every((f) => f.clean_label.trim());

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = { fields: changed.map(({ field_key, clean_label, label_ta, required }) => ({ field_key, clean_label, label_ta, required })) };
      const saved = await api<AdminFormDetail>(`/api/admin/forms/${fingerprint}`, { method: 'PATCH', body: JSON.stringify(body) });
      const { fields: _fields, ...row } = saved;
      onSaved(row);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-10 grid place-items-center bg-black/30 px-4 py-6" onClick={onClose}>
      <div className="flex max-h-full w-full max-w-4xl flex-col" onClick={(e) => e.stopPropagation()}>
        <Card className="flex min-h-0 flex-col">
          <form onSubmit={save} className="flex min-h-0 flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">{form?.form_name ?? 'Form'}</h2>
                <p className="text-xs text-muted">Changes apply to new scans of this form; phones already connected keep their labels.</p>
              </div>
              <button type="button" onClick={onClose} aria-label="Close" className="text-muted hover:text-ink">
                <X size={18} />
              </button>
            </div>
            {!form && !error && <p className="py-6 text-center text-sm text-muted">Loading…</p>}
            {form && (
              <div className="min-h-0 overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted">
                      <th className="py-2 pr-3 font-medium">On the website</th>
                      <th className="py-2 pr-3 font-medium">English label</th>
                      <th className="py-2 pr-3 font-medium">Tamil label</th>
                      <th className="py-2 font-medium">Required</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fields.map((f) => (
                      <tr key={f.field_key} className="border-t border-line align-top">
                        <td className="max-w-56 py-2 pr-3">
                          <div className="break-words">{f.site_label || <span className="text-muted">(no label)</span>}</div>
                          <div className="text-xs text-muted">{f.field_type}</div>
                        </td>
                        <td className="py-2 pr-3">
                          <Input value={f.clean_label} onChange={(e) => set(f.field_key, { clean_label: e.target.value })} maxLength={200} className="min-h-9 text-sm" />
                        </td>
                        <td className="py-2 pr-3">
                          <Input value={f.label_ta} onChange={(e) => set(f.field_key, { label_ta: e.target.value })} maxLength={200} lang="ta" className="min-h-9 text-sm" />
                        </td>
                        <td className="py-2">
                          <label className="flex min-h-9 items-center gap-1.5 text-xs text-muted" title={f.site_required ? 'Marked required on the website' : undefined}>
                            <input
                              type="checkbox"
                              checked={f.required}
                              disabled={f.site_required}
                              onChange={(e) => set(f.field_key, { required: e.target.checked })}
                            />
                            {f.site_required && 'website'}
                          </label>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {error && <p className="text-sm text-danger-ink">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={busy} disabled={!form || !changed.length || !valid}>
                Save {changed.length ? `(${changed.length})` : ''}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
