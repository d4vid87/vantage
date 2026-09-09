'use client';

/**
 * VANTAGE — Intelligence briefs
 *
 * Reads briefs the scheduler has already written, and can trigger one on
 * demand. Generation happens server-side, so a brief exists whether or not this
 * tab was ever open.
 */

import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePanel } from '@/hooks/usePanel';
import { FileText, X, Loader2, Play, AlertTriangle } from 'lucide-react';

interface Brief {
  id: string;
  markdown: string;
  provider: string | null;
  meta: Record<string, number> | null;
  createdAt: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

/** Minimal markdown rendering — headings, bold and bullets, no new dependency. */
function renderMarkdown(md: string): string {
  return md
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^### (.*)$/gm, '<div style="color:#7DD3FC;font-weight:700;margin-top:10px">$1</div>')
    .replace(/^## (.*)$/gm, '<div style="color:#38BDF8;font-weight:700;margin-top:12px">$1</div>')
    .replace(/^# (.*)$/gm, '<div style="color:#38BDF8;font-weight:700;font-size:13px;margin-top:12px">$1</div>')
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:#E2E8F0">$1</strong>')
    .replace(/^[-*] (.*)$/gm, '<div style="padding-left:10px">• $1</div>')
    .replace(/\n/g, '<br/>');
}

export default function BriefPanel({ open, onClose }: Props) {
  const panel = usePanel<HTMLDivElement>(open, onClose);
  const [schedule, setSchedule] = useState<{ at: string | null; timeZone: string; nextRun: string | null; enabled: boolean; error?: string | null } | null>(null);
  const [briefs, setBriefs] = useState<Brief[]>([]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/briefs');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to load briefs');
      setBriefs(data.briefs ?? []);
      setSchedule(data.schedule ?? null);
      setError(null);
    } catch {
      setError('Unable to load briefs');
    } finally {
      setLoading(false);
    }
  }, []);

  // Opening the panel starts a request and exposes its loading state.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (open) load(); }, [open, load]);

  const runNow = async () => {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch('/api/briefs/run', { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(res.status === 503
          ? (body.error || 'No AI provider configured')
          : 'Brief generation failed');
        return;
      }
      await load();
    } catch {
      setError('Brief generation failed');
    } finally {
      setRunning(false);
    }
  };

  const current = briefs.find(b => b.id === selected) ?? briefs[0];

  return (
    <AnimatePresence>
      {open && (
        <motion.div ref={panel} role="dialog" aria-label="Intelligence briefs"
          initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 40 }}
          className="gotham-panel"
          style={{ position: 'absolute', top: 60, right: 12, width: 'min(460px, calc(100vw - 24px))', maxHeight: '76vh', zIndex: 900, display: 'flex', flexDirection: 'column' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, letterSpacing: '0.08em' }}>
              <FileText size={13} /> INTELLIGENCE BRIEFS
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={runNow} disabled={running} className="gotham-btn" style={{ fontSize: 10, display: 'flex', alignItems: 'center', gap: 4 }}>
                {running ? <Loader2 size={11} className="animate-spin" /> : <Play size={11} />}
                {running ? 'GENERATING' : 'RUN NOW'}
              </button>
              <button onClick={onClose} aria-label="Close briefs" className="gotham-btn" style={{ padding: '2px 5px' }}><X size={12} /></button>
            </div>
          </div>

          {schedule && <p className="px-3 py-2 text-[11px]">{schedule.error ? schedule.error : schedule.at && schedule.enabled ? `Daily at ${schedule.at} (${schedule.timeZone}). Next due: ${schedule.nextRun ? new Date(schedule.nextRun).toLocaleString() : 'not scheduled'}.` : `Automatic brief disabled. Timezone: ${schedule.timeZone}.`}</p>}
          {error && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '6px 10px', color: '#FCA5A5', fontSize: 10 }}>
              <AlertTriangle size={12} /> {error}
            </div>
          )}

          {briefs.length > 1 && (
            <div style={{ display: 'flex', gap: 4, padding: '6px 10px', overflowX: 'auto', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              {briefs.slice(0, 10).map(b => (
                <button key={b.id} onClick={() => setSelected(b.id)} className="gotham-btn"
                  style={{ fontSize: 9, whiteSpace: 'nowrap', opacity: current?.id === b.id ? 1 : 0.55 }}>
                  {b.createdAt.slice(5, 10)}
                </button>
              ))}
            </div>
          )}

          <div style={{ overflowY: 'auto', padding: '10px 12px', fontSize: 11, lineHeight: 1.55, color: '#CBD5E1' }}>
            {loading && <div style={{ display: 'flex', gap: 6, alignItems: 'center', opacity: 0.7 }}><Loader2 size={12} className="animate-spin" /> Loading…</div>}
            {!loading && !current && (
              <div style={{ opacity: 0.6 }}>
                No briefs yet. Set <code>VANTAGE_DAILY_BRIEF=07:00</code> to schedule one, or press RUN NOW.
              </div>
            )}
            {current && (
              <>
                <div style={{ fontSize: 9, opacity: 0.55, marginBottom: 8 }}>
                  {new Date(current.createdAt).toLocaleString()} · {current.provider ?? 'local'}
                  {current.meta && ` · ${Object.values(current.meta).reduce((a, b) => a + b, 0)} records`}
                </div>
                <div dangerouslySetInnerHTML={{ __html: renderMarkdown(current.markdown) }} />
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
