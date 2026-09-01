'use client';

/** VANTAGE — Login gate. Rendered only when VANTAGE_AUTH_PASSWORD is set. */

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Lock, Loader2, AlertTriangle } from 'lucide-react';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? 'Login failed.');
        return;
      }
      // `next` comes from our own middleware redirect; keep it relative so it
      // cannot be used as an open redirect.
      const next = params.get('next');
      router.replace(next && next.startsWith('/') && !next.startsWith('//') ? next : '/');
      router.refresh();
    } catch {
      setError('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="w-[min(340px,calc(100vw-2rem))] space-y-3 rounded-lg border p-5"
      style={{ background: 'var(--bg-panel-solid)', borderColor: 'var(--border-cyan)' }}
    >
      <div className="flex items-center gap-2 text-[12px] font-bold tracking-[0.2em]">
        <Lock size={14} style={{ color: 'var(--cyan-primary)' }} />
        VANTAGE
      </div>
      <p className="text-[11px] opacity-60">This instance is password protected.</p>

      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        autoFocus
        autoComplete="current-password"
        aria-label="Password"
        className="w-full rounded bg-transparent px-2 py-2 text-[13px] outline-none"
        style={{ border: '1px solid var(--border-primary)' }}
      />

      <button
        type="submit"
        disabled={busy || !password}
        className="flex w-full items-center justify-center gap-2 rounded py-2 text-[11px] font-bold disabled:opacity-40"
        style={{ background: 'var(--cyan-primary)', color: '#000' }}
      >
        {busy && <Loader2 size={12} className="animate-spin" />} SIGN IN
      </button>

      {error && (
        <p className="flex items-start gap-1 text-[11px]" style={{ color: '#ff6b6b' }}>
          <AlertTriangle size={11} className="mt-0.5 shrink-0" /> {error}
        </p>
      )}
    </form>
  );
}

export default function LoginPage() {
  return (
    <main
      className="flex min-h-screen items-center justify-center p-4"
      style={{ background: 'var(--bg-void, #000)', color: 'var(--text-primary, #fff)' }}
    >
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
