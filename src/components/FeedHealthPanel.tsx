'use client';

/**
 * VANTAGE — feed health
 *
 * Per-upstream fetch status. A source that dies upstream turns into a red row
 * here instead of a quietly empty map layer. Only sources that have been
 * fetched since the last server restart appear.
 */

import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePanel } from '@/hooks/usePanel';
import type { MapFeedStatus } from '@/lib/map-feeds';
import { HeartPulse, X, Loader2, RefreshCw, Download } from 'lucide-react';

interface Feed {
  key: string;
  ok: boolean;
  count: number;
  lastSuccess: number | null;
  lastError: number | null;
  lastErrorMsg: string | null;
  servingStale: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  browserFeeds?: MapFeedStatus[];
  onRetry?: (key: string) => void;
  lowPower?: boolean;
  onLowPower?: (enabled: boolean) => void;
}

function ago(ts: number | null): string {
  if (!ts) return '—';
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  return `${Math.round(s / 3600)}h ago`;
}

function dotColor(f: Feed): string {
  if (f.ok) return '#4ADE80';
  if (f.servingStale) return '#FBBF24';
  return '#F87171';
}

export default function FeedHealthPanel({ open, onClose, browserFeeds = [], onRetry, lowPower, onLowPower }: Props) {
  const panel = usePanel<HTMLDivElement>(open, onClose);
  const [error, setError] = useState('');
  const [checks, setChecks] = useState<{ name: string; ok: boolean; detail: string }[]>([]);
  const [checking, setChecking] = useState(false);
  const diagnose = async () => {
    setChecking(true); setError('');
    try {
      const response = await fetch('/api/diagnostics');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Diagnostics failed.');
      setChecks(data.checks);
    } catch (e) { setError(e instanceof Error ? e.message : 'Diagnostics failed.'); }
    finally { setChecking(false); }
  };
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    setLoading(true);
    setNow(Date.now());
    try {
      const res = await fetch('/api/feed-health');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to load feed health.');
      setFeeds(data.feeds ?? []); setError('');
    } catch { setError('Unable to load feed health.'); } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const initial = setTimeout(load, 0);
    const t = setInterval(load, 30_000);
    return () => { clearTimeout(initial); clearInterval(t); };
  }, [open, load]);

  const failing = feeds.filter(f => !f.ok);

  return (
    <AnimatePresence>
      {open && (
        <motion.div ref={panel} role="dialog" aria-label="Feed health"
          initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 40 }}
          className="gotham-panel"
          style={{ position: 'absolute', top: 60, right: 12, width: 'min(380px, calc(100vw - 24px))', maxHeight: '70vh', zIndex: 900, display: 'flex', flexDirection: 'column' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, letterSpacing: '0.08em' }}>
              <HeartPulse size={13} /> FEED HEALTH
              {failing.length > 0 && <span style={{ color: '#F87171', fontSize: 10 }}>· {failing.length} failing</span>}
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={load} className="gotham-btn" style={{ padding: '2px 5px' }} title="Refresh">
                {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              </button>
              <button onClick={onClose} aria-label="Close feed health" className="gotham-btn" style={{ padding: '2px 5px' }}><X size={12} /></button>
            </div>
          </div>

          <div className="overflow-y-auto p-3 text-[12px] space-y-2">
            <label className="block"><input type="checkbox" checked={!!lowPower} onChange={e => onLowPower?.(e.target.checked)} /> Low power: slower polling and reduced UI animations</label>
            {error && <p role="alert" className="text-red-300">{error}</p>}
            <strong>Map data freshness</strong>
            {browserFeeds.map(f => <div key={f.key} className="border-b py-1">
              <div className="flex justify-between gap-2"><span>{f.key.replaceAll('_', ' ')}</span><button aria-label={`Refresh ${f.key}`} disabled={f.loading} onClick={() => onRetry?.(f.key)}>{f.loading ? 'Loading…' : f.error ? 'Retry' : 'Refresh'}</button></div>
              <p className={f.error ? 'text-amber-300' : 'opacity-70'}>{f.error ? `${f.lastSuccess ? 'Stale' : 'Unavailable'}: ${f.error}` : !f.lastSuccess ? 'Waiting for first response' : now - f.lastSuccess > (f.interval ?? Infinity) ? 'Refresh due' : 'Received successfully'} · Last received {ago(f.lastSuccess ?? null)}</p>
            </div>)}
            <button className="gotham-btn" disabled={checking} onClick={diagnose}>{checking ? 'Checking…' : 'Run setup checks'}</button>
            {checks.map(c => <p key={c.name}><strong>{c.name}: {c.ok ? 'Ready' : 'Check'}</strong> — {c.detail}</p>)}
            <strong>Upstream source health</strong>
          <div style={{ overflowY: 'auto', padding: '6px 10px', fontSize: 10.5, color: '#CBD5E1' }}>
            {feeds.length === 0 && (
              <div style={{ opacity: 0.6, padding: '6px 0' }}>
                {loading ? 'Loading…' : 'No fetches recorded yet — sources appear here after their first request.'}
              </div>
            )}
            {feeds.map(f => (
              <div key={f.key} style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <span style={{ width: 7, height: 7, borderRadius: 4, background: dotColor(f), flexShrink: 0, alignSelf: 'center' }} />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.lastErrorMsg ?? f.key}>
                  {f.key}
                </span>
                {f.ok
                  ? <span style={{ opacity: 0.7 }}>{f.count.toLocaleString()} · {ago(f.lastSuccess)}</span>
                  : <span style={{ color: f.servingStale ? '#FBBF24' : '#F87171' }}>
                      {f.servingStale ? `stale · serving ${f.count.toLocaleString()}` : 'failing'} · {ago(f.lastError)}
                    </span>}
              </div>
            ))}
          </div>

          </div>
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '6px 10px' }}>
            <a href="/api/backup" download className="gotham-btn" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, textDecoration: 'none' }}
               title="Consistent SQLite snapshot (rules, alerts, briefs, investigations)">
              <Download size={11} /> DOWNLOAD DATA BACKUP
            </a>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
