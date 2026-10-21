'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Shield } from 'lucide-react';
import { LOCK_MINUTES, MAX_PIN_ATTEMPTS, type ApiError, type LoginResponse } from '@vff/shared';
import { Button, Card, Input } from '@/components/ui';

export default function AdminLogin() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/login?web=1', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone, pin }),
      });
      const body = (await res.json()) as LoginResponse | ApiError;
      if (!res.ok) {
        const err = body as ApiError;
        setError(err.attempts_left !== undefined ? `${err.error}. ${err.attempts_left} tries left.` : err.error);
        return;
      }
      if ((body as LoginResponse).user.role !== 'admin') {
        await fetch('/api/auth/logout', { method: 'POST' });
        setError('This account is not an admin.');
        return;
      }
      router.replace('/admin');
    } catch {
      setError('Network error. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm items-center px-4">
      <Card className="w-full">
        <h1 className="flex items-center gap-2 text-base font-semibold">
          <Shield size={18} /> Admin sign in
        </h1>
        <form onSubmit={submit} className="mt-4 space-y-3">
          <Input
            inputMode="numeric"
            autoComplete="username"
            placeholder="9876543210"
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 15))}
            aria-label="Phone number"
          />
          <Input
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            placeholder="5-digit PIN"
            maxLength={5}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 5))}
            aria-label="PIN"
          />
          <Button type="submit" className="w-full" loading={busy} disabled={phone.length < 6 || pin.length !== 5}>
            Sign in
          </Button>
          <p className={error ? 'text-xs text-danger-ink' : 'text-xs text-muted'}>
            {error ?? `Locks for ${LOCK_MINUTES} min after ${MAX_PIN_ATTEMPTS} failed tries.`}
          </p>
        </form>
      </Card>
    </main>
  );
}
