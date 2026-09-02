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
import { HeartPulse, X, Loader2, RefreshCw } from 'lucide-react';

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

export default function FeedHealthPanel({ open, onClose }: Props) {
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/feed-health');
      const data = await res.json();
      setFeeds(data.feeds ?? []);
    } catch { /* row list simply stays as it was */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [open, load]);

  const failing = feeds.filter(f => !f.ok);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 40 }}
          className="gotham-panel"
          style={{ position: 'absolute', top: 60, right: 12, width: 380, maxHeight: '70vh', zIndex: 40, display: 'flex', flexDirection: 'column' }}
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
              <button onClick={onClose} className="gotham-btn" style={{ padding: '2px 5px' }}><X size={12} /></button>
            </div>
          </div>

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
        </motion.div>
      )}
    </AnimatePresence>
  );
}
