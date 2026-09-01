'use client';

/**
 * VANTAGE — Watchlists
 *
 * Create geofence / entity / threshold watches and pick which channels they
 * notify. Rules live server-side in SQLite, so they keep firing whether or not
 * this browser tab is open.
 */

import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, X, Trash2, Plus, Loader2, AlertTriangle, Check } from 'lucide-react';

type Channel = 'discord' | 'ntfy' | 'email' | 'webhook';
type Kind = 'aoi' | 'entity' | 'threshold';

interface Rule {
  id: string;
  name: string;
  kind: Kind;
  channels: Channel[];
  enabled: boolean;
  lastFiredAt: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Ring of the polygon currently drawn on the map, if any. */
  activeRing?: number[][] | null;
}

const CHANNELS: Channel[] = ['discord', 'ntfy', 'email', 'webhook'];

const KIND_LABEL: Record<Kind, string> = {
  aoi: 'GEOFENCE',
  entity: 'ENTITY',
  threshold: 'THRESHOLD',
};

export default function WatchlistPanel({ open, onClose, activeRing }: Props) {
  const [rules, setRules] = useState<Rule[]>([]);
  const [ready, setReady] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [kind, setKind] = useState<Kind>('threshold');
  const [identifier, setIdentifier] = useState('');
  const [layer, setLayer] = useState('earthquakes');
  const [field, setField] = useState('magnitude');
  const [min, setMin] = useState('5');
  const [channels, setChannels] = useState<Channel[]>([]);
  const [webhookUrl, setWebhookUrl] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/watchlist');
      const data = await res.json();
      setRules(data.rules ?? []);
      setReady(data.channels ?? {});
    } catch {
      setError('Could not load watchlists.');
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const toggleChannel = (c: Channel) =>
    setChannels((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));

  const create = async () => {
    setError(null);
    if (!name.trim()) return setError('Give the watch a name.');

    let spec: unknown;
    if (kind === 'aoi') {
      if (!activeRing || activeRing.length < 4) {
        return setError('Draw a polygon on the map first, then create the geofence.');
      }
      spec = { ring: activeRing, layers: [layer] };
    } else if (kind === 'entity') {
      if (!identifier.trim()) return setError('Enter the identifier to watch.');
      spec = { entityType: 'flight', identifier: identifier.trim() };
    } else {
      const parsed = Number(min);
      if (!Number.isFinite(parsed)) return setError('Threshold must be a number.');
      spec = { layer, field, min: parsed };
    }

    setBusy(true);
    try {
      const res = await fetch('/api/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          kind,
          spec,
          channels,
          ...(webhookUrl.trim() ? { webhookUrl: webhookUrl.trim() } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Could not create the watch.');
        return;
      }
      setName('');
      setIdentifier('');
      await load();
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    await fetch(`/api/watchlist?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    await load();
  };

  const setEnabled = async (id: string, enabled: boolean) => {
    await fetch(`/api/watchlist?id=${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    await load();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className="fixed left-3 bottom-3 z-[900] flex max-h-[75vh] w-[min(400px,calc(100vw-1.5rem))] flex-col rounded-lg border"
          style={{
            background: 'var(--bg-panel-solid)',
            borderColor: 'var(--border-cyan)',
            color: 'var(--text-primary)',
          }}
          aria-label="Watchlists"
        >
          <header
            className="flex items-center gap-2 border-b px-3 py-2 text-[11px] font-bold tracking-wider"
            style={{ borderColor: 'var(--border-primary)' }}
          >
            <Bell size={14} style={{ color: 'var(--cyan-primary)' }} />
            WATCHLISTS
            <button onClick={onClose} className="ml-auto opacity-70 hover:opacity-100" aria-label="Close">
              <X size={14} />
            </button>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto p-3 text-[11px]">
            <section className="space-y-2 rounded border p-2" style={{ borderColor: 'var(--border-primary)' }}>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Watch name"
                className="w-full rounded bg-transparent px-2 py-1 outline-none"
                style={{ border: '1px solid var(--border-primary)' }}
              />

              <div className="flex gap-1">
                {(['threshold', 'aoi', 'entity'] as Kind[]).map((k) => (
                  <button
                    key={k}
                    onClick={() => setKind(k)}
                    className="flex-1 rounded px-1 py-1 text-[9px] font-bold"
                    style={{
                      background: kind === k ? 'var(--cyan-primary)' : 'var(--bg-tertiary)',
                      color: kind === k ? '#000' : 'inherit',
                    }}
                  >
                    {KIND_LABEL[k]}
                  </button>
                ))}
              </div>

              {kind === 'threshold' && (
                <div className="flex gap-1">
                  <input value={layer} onChange={(e) => setLayer(e.target.value)} placeholder="layer"
                    className="w-1/3 rounded bg-transparent px-2 py-1 outline-none" style={{ border: '1px solid var(--border-primary)' }} />
                  <input value={field} onChange={(e) => setField(e.target.value)} placeholder="field"
                    className="w-1/3 rounded bg-transparent px-2 py-1 outline-none" style={{ border: '1px solid var(--border-primary)' }} />
                  <input value={min} onChange={(e) => setMin(e.target.value)} placeholder="min"
                    className="w-1/3 rounded bg-transparent px-2 py-1 outline-none" style={{ border: '1px solid var(--border-primary)' }} />
                </div>
              )}

              {kind === 'aoi' && (
                <div className="space-y-1">
                  <input value={layer} onChange={(e) => setLayer(e.target.value)} placeholder="layer to watch"
                    className="w-full rounded bg-transparent px-2 py-1 outline-none" style={{ border: '1px solid var(--border-primary)' }} />
                  <p className="opacity-60">
                    {activeRing && activeRing.length >= 4
                      ? `Using the polygon drawn on the map (${activeRing.length - 1} vertices).`
                      : 'Draw a polygon on the map to define the geofence.'}
                  </p>
                </div>
              )}

              {kind === 'entity' && (
                <input value={identifier} onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="ICAO24 / MMSI / wallet / @channel"
                  className="w-full rounded bg-transparent px-2 py-1 outline-none" style={{ border: '1px solid var(--border-primary)' }} />
              )}

              <div className="flex flex-wrap gap-1">
                {CHANNELS.map((c) => (
                  <button
                    key={c}
                    onClick={() => toggleChannel(c)}
                    title={ready[c] ? `${c} is configured` : `${c} is not configured on this instance`}
                    className="rounded px-1.5 py-1 text-[9px] font-bold uppercase"
                    style={{
                      background: channels.includes(c) ? 'var(--gold-primary)' : 'var(--bg-tertiary)',
                      color: channels.includes(c) ? '#000' : 'inherit',
                      opacity: ready[c] ? 1 : 0.5,
                    }}
                  >
                    {channels.includes(c) && <Check size={8} className="mr-0.5 inline" />}
                    {c}
                  </button>
                ))}
              </div>

              {channels.includes('webhook') && (
                <input value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)}
                  placeholder="https://your-endpoint (optional override)"
                  className="w-full rounded bg-transparent px-2 py-1 outline-none" style={{ border: '1px solid var(--border-primary)' }} />
              )}

              <button
                onClick={create}
                disabled={busy}
                className="flex w-full items-center justify-center gap-1 rounded py-1.5 text-[10px] font-bold disabled:opacity-50"
                style={{ background: 'var(--cyan-primary)', color: '#000' }}
              >
                {busy ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />} CREATE WATCH
              </button>

              {error && (
                <p className="flex items-start gap-1 text-[10px]" style={{ color: '#ff6b6b' }}>
                  <AlertTriangle size={10} className="mt-0.5 shrink-0" /> {error}
                </p>
              )}
            </section>

            <section className="space-y-1">
              {rules.length === 0 && <p className="opacity-60">No watches yet.</p>}
              {rules.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center gap-2 rounded border px-2 py-1.5"
                  style={{ borderColor: 'var(--border-primary)', opacity: r.enabled ? 1 : 0.5 }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-bold">{r.name}</div>
                    <div className="text-[9px] opacity-60">
                      {KIND_LABEL[r.kind]} · {r.channels.join(', ') || 'no channels'}
                      {r.lastFiredAt ? ` · last fired ${new Date(r.lastFiredAt).toLocaleString()}` : ''}
                    </div>
                  </div>
                  <button
                    onClick={() => setEnabled(r.id, !r.enabled)}
                    className="text-[9px] font-bold"
                    style={{ color: r.enabled ? 'var(--cyan-primary)' : 'inherit' }}
                  >
                    {r.enabled ? 'ON' : 'OFF'}
                  </button>
                  <button onClick={() => remove(r.id)} aria-label={`Delete ${r.name}`} className="opacity-60 hover:opacity-100">
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </section>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
