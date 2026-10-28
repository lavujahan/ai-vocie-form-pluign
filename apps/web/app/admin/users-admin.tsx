'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CreditCard, KeyRound, LogOut, Pencil, Plus, Power, Search, Unlock, X } from 'lucide-react';
import { PIN_LENGTH, randomPin, type AdminUserRow, type UserRole } from '@vff/shared';
import { Button, Card, Input, Pill } from '@/components/ui';
import { AdminNav } from './admin-nav';
import { api } from './api';
import { PlanCell, PlanDialog } from './plan-dialog';

type Status = 'Active' | 'Locked' | 'Inactive';

function statusOf(u: AdminUserRow): Status {
  if (!u.is_active) return 'Inactive';
  if (u.locked_until && new Date(u.locked_until) > new Date()) return 'Locked';
  return 'Active';
}

const TONE = { Active: 'live', Locked: 'warn', Inactive: 'neutral' } as const;

type Dialog =
  | { kind: 'create' }
  | { kind: 'edit'; user: AdminUserRow }
  | { kind: 'pin'; user: AdminUserRow }
  | { kind: 'plan'; user: AdminUserRow }
  | null;

export function UsersAdmin() {
  const router = useRouter();
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);

  const load = useCallback(async (query: string) => {
    setLoading(true);
    try {
      const { users } = await api<{ users: AdminUserRow[] }>(`/api/admin/users?q=${encodeURIComponent(query)}`);
      setUsers(users);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
      if ((e as Error).message.includes('sign in')) router.replace('/admin/login');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    const t = setTimeout(() => load(q), 250);
    return () => clearTimeout(t);
  }, [q, load]);

  // Before migration 0013 there are no plans: the column is left out.
  const showPlans = users.some((u) => u.plan !== undefined);
  const replace = (u: AdminUserRow) => setUsers((list) => list.map((x) => (x.id === u.id ? u : x)));

  async function patch(id: string, body: Record<string, unknown>) {
    try {
      const { user } = await api<{ user: AdminUserRow }>(`/api/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
      replace(user);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/admin/login');
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <header className="mb-4 flex items-center justify-between gap-3">
        <AdminNav />
        <div className="flex gap-2">
          <Button onClick={() => setDialog({ kind: 'create' })}>
            <Plus size={16} /> Add user
          </Button>
          <Button variant="ghost" onClick={logout} aria-label="Sign out">
            <LogOut size={16} />
          </Button>
        </div>
      </header>

      <Card className="p-0">
        <div className="flex items-center gap-2 border-b border-line px-4 py-2">
          <Search size={16} className="text-muted" />
          <input
            className="min-h-9 flex-1 bg-transparent text-sm focus:outline-none"
            placeholder="Search by name or phone"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        {error && <p className="border-b border-line px-4 py-2 text-sm text-danger-ink">{error}</p>}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Phone</th>
                <th className="px-4 py-2 font-medium">Role</th>
                <th className="px-4 py-2 font-medium">Status</th>
                {showPlans && <th className="px-4 py-2 font-medium">Plan</th>}
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const status = statusOf(u);
                return (
                  <tr key={u.id} className="border-t border-line">
                    <td className="px-4 py-2.5 font-medium">{u.name}</td>
                    <td className="px-4 py-2.5 tabular-nums">{u.phone}</td>
                    <td className="px-4 py-2.5 capitalize text-muted">{u.role}</td>
                    <td className="px-4 py-2.5">
                      <Pill tone={TONE[status]}>{status}</Pill>
                    </td>
                    {showPlans && (
                      <td className="px-4 py-2">
                        <PlanCell user={u} />
                      </td>
                    )}
                    <td className="px-4 py-1.5">
                      <div className="flex justify-end gap-1">
                        {showPlans && (
                          <IconBtn label="Plan and payments" onClick={() => setDialog({ kind: 'plan', user: u })}>
                            <CreditCard size={15} />
                          </IconBtn>
                        )}
                        <IconBtn label="Reset PIN" onClick={() => setDialog({ kind: 'pin', user: u })}>
                          <KeyRound size={15} />
                        </IconBtn>
                        {status === 'Locked' && (
                          <IconBtn label="Unlock" onClick={() => patch(u.id, { unlock: true })}>
                            <Unlock size={15} />
                          </IconBtn>
                        )}
                        <IconBtn label="Edit" onClick={() => setDialog({ kind: 'edit', user: u })}>
                          <Pencil size={15} />
                        </IconBtn>
                        <IconBtn
                          label={u.is_active ? 'Deactivate' : 'Reactivate'}
                          onClick={() => patch(u.id, { is_active: !u.is_active })}
                        >
                          <Power size={15} className={u.is_active ? '' : 'text-live-ink'} />
                        </IconBtn>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!users.length && !loading && (
                <tr>
                  <td colSpan={showPlans ? 6 : 5} className="px-4 py-8 text-center text-sm text-muted">
                    No users found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {dialog?.kind === 'plan' && <PlanDialog user={dialog.user} onClose={() => setDialog(null)} onSaved={replace} />}
      {dialog && dialog.kind !== 'plan' && (
        <UserDialog
          dialog={dialog}
          onClose={() => setDialog(null)}
          // The dialog closes itself (after showing a new PIN once).
          onSaved={(u, created) => {
            if (created) setUsers((list) => [u, ...list]);
            else replace(u);
          }}
        />
      )}
    </main>
  );
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="grid size-9 place-items-center rounded-lg text-muted hover:bg-subtle hover:text-ink"
    >
      {children}
    </button>
  );
}

function UserDialog({
  dialog,
  onClose,
  onSaved,
}: {
  dialog: Exclude<Dialog, { kind: 'plan' } | null>;
  onClose: () => void;
  onSaved: (u: AdminUserRow, created: boolean) => void;
}) {
  const user = dialog.kind === 'create' ? null : dialog.user;
  const [name, setName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [role, setRole] = useState<UserRole>(user?.role ?? 'user');
  const [pin, setPin] = useState('');
  /** A generated PIN is shown in clear text, so the admin can pass it on. */
  const [pinVisible, setPinVisible] = useState(false);
  /** After saving a new PIN: shown once (it is stored hashed and can't be seen again). */
  const [savedPin, setSavedPin] = useState<{ name: string; pin: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const title = dialog.kind === 'create' ? 'Add user' : dialog.kind === 'edit' ? 'Edit user' : `Reset PIN for ${user?.name}`;
  const showProfile = dialog.kind !== 'pin';
  const showPin = dialog.kind !== 'edit';
  const valid = (!showProfile || (name.trim() && phone.length >= 6)) && (!showPin || pin.length === PIN_LENGTH);

  function generate() {
    setPin(randomPin());
    setPinVisible(true);
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError('Copy failed: select the PIN and copy it by hand.');
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body =
        dialog.kind === 'create'
          ? { name, phone, role, pin }
          : dialog.kind === 'edit'
            ? { name, phone, role }
            : { pin };
      const { user: saved } = await api<{ user: AdminUserRow }>(
        dialog.kind === 'create' ? '/api/admin/users' : `/api/admin/users/${user!.id}`,
        { method: dialog.kind === 'create' ? 'POST' : 'PATCH', body: JSON.stringify(body) },
      );
      onSaved(saved, dialog.kind === 'create');
      if (showPin) setSavedPin({ name: saved.name, pin });
      else onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-10 grid place-items-center bg-black/30 px-4" onClick={onClose}>
      <div className="w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
      <Card>
        <form onSubmit={save} className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">{title}</h2>
            <button type="button" onClick={onClose} aria-label="Close" className="text-muted hover:text-ink">
              <X size={18} />
            </button>
          </div>
          {showProfile && (
            <>
              <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
              <Input
                inputMode="numeric"
                placeholder="Phone (9876543210)"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 15))}
              />
              <div className="flex gap-2 text-sm">
                {(['user', 'admin'] as const).map((r) => (
                  <label key={r} className="flex items-center gap-1.5 capitalize">
                    <input type="radio" name="role" checked={role === r} onChange={() => setRole(r)} /> {r}
                  </label>
                ))}
              </div>
            </>
          )}
          {savedPin ? (
            <div className="space-y-3">
              <p className="text-sm">
                PIN for <span className="font-medium">{savedPin.name}</span>. Pass it on now: it is stored hashed and can&apos;t be
                shown again.
              </p>
              <div className="flex items-center gap-2">
                <span className="flex-1 select-all rounded-lg bg-subtle px-3 py-2 text-center font-mono text-xl tracking-[0.3em]">
                  {savedPin.pin}
                </span>
                <Button type="button" onClick={() => copy(savedPin.pin)}>
                  {copied ? 'Copied' : 'Copy'}
                </Button>
              </div>
              {error && <p className="text-xs text-danger-ink">{error}</p>}
              <Button type="button" className="w-full" onClick={onClose}>
                Done
              </Button>
            </div>
          ) : (
            <>
              {showPin && (
                <div className="flex gap-2">
                  <Input
                    type={pinVisible ? 'text' : 'password'}
                    inputMode="numeric"
                    placeholder={`${PIN_LENGTH}-digit PIN`}
                    maxLength={PIN_LENGTH}
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, PIN_LENGTH))}
                    autoFocus={dialog.kind === 'pin'}
                    className={pinVisible ? 'font-mono tracking-widest' : undefined}
                  />
                  <Button type="button" onClick={generate} title="A random PIN that is hard to guess">
                    Generate
                  </Button>
                </div>
              )}
              {error && <p className="text-xs text-danger-ink">{error}</p>}
              <Button type="submit" className="w-full" loading={busy} disabled={!valid}>
                Save
              </Button>
            </>
          )}
        </form>
      </Card>
      </div>
    </div>
  );
}
