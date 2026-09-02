'use client';

/**
 * VANTAGE — Country instability index
 *
 * Shows the score and the components behind it. A single opaque number is not
 * an assessment, so every contribution is visible and the sources that were
 * unreachable this run are named.
 */

import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Crosshair, X, Loader2 } from 'lucide-react';

interface Country {
  code: string;
  score: number;
  level: string;
  components: Record<string, number>;
  tags: string[];
  color: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect?: (code: string) => void;
}

const COMPONENT_LABEL: Record<string, string> = {
  base: 'Baseline', advisory: 'Travel advisory', outages: 'Internet disruption',
  ransomware: 'Ransomware', conflict: 'Conflict reporting', seismic: 'Seismic',
};

export default function RiskPanel({ open, onClose, onSelect }: Props) {
  const [countries, setCountries] = useState<Country[]>([]);
  const [available, setAvailable] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/country-risk');
      const data = await res.json();
      setCountries(data.countries ?? []);
      setAvailable(data.inputs_available ?? {});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (open) load(); }, [open, load]);

  const missing = Object.entries(available).filter(([, ok]) => !ok).map(([k]) => k);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 40 }}
          className="gotham-panel"
          style={{ position: 'absolute', top: 60, right: 12, width: 'min(380px, calc(100vw - 24px))', maxHeight: '76vh', zIndex: 40, display: 'flex', flexDirection: 'column' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, letterSpacing: '0.08em' }}>
              <Crosshair size={13} /> INSTABILITY INDEX
            </span>
            <button onClick={onClose} className="gotham-btn" style={{ padding: '2px 5px' }}><X size={12} /></button>
          </div>

          {missing.length > 0 && (
            <div style={{ padding: '5px 10px', fontSize: 9, color: '#FCD34D' }}>
              Unavailable this run: {missing.join(', ')} — those components read zero.
            </div>
          )}

          <div style={{ overflowY: 'auto', padding: '6px 8px' }}>
            {loading && <div style={{ display: 'flex', gap: 6, alignItems: 'center', opacity: 0.7, fontSize: 11, padding: 8 }}><Loader2 size={12} className="animate-spin" /> Scoring…</div>}
            {countries.slice(0, 40).map(c => (
              <div key={c.code} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', padding: '5px 4px' }}>
                <button
                  onClick={() => { setExpanded(expanded === c.code ? null : c.code); onSelect?.(c.code); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' }}
                >
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#E2E8F0', width: 26 }}>{c.code}</span>
                  <span style={{ flex: 1, height: 5, background: 'rgba(255,255,255,0.07)', borderRadius: 3, overflow: 'hidden' }}>
                    <span style={{ display: 'block', width: `${c.score}%`, height: '100%', background: c.color }} />
                  </span>
                  <span style={{ fontSize: 11, color: c.color, width: 26, textAlign: 'right' }}>{c.score}</span>
                </button>
                {expanded === c.code && (
                  <div style={{ paddingLeft: 34, paddingTop: 4, fontSize: 9, color: '#94A3B8' }}>
                    {Object.entries(c.components).filter(([, v]) => v > 0).map(([k, v]) => (
                      <div key={k} style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>{COMPONENT_LABEL[k] ?? k}</span><span>+{v}</span>
                      </div>
                    ))}
                    {c.tags.length > 0 && <div style={{ marginTop: 3, opacity: 0.7 }}>{c.tags.join(' · ')}</div>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
