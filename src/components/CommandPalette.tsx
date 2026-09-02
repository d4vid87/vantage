'use client';

/**
 * VANTAGE — command palette (Ctrl+K)
 *
 * Fuzzy jump to countries and cities, layer toggles and panel opens, all from
 * the keyboard. Command data is entirely local — the same gazetteers the map
 * layers already ship.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search, Layers as LayersIcon, Globe2, MapPin, PanelRight } from 'lucide-react';
import { buildGeoCommands, searchCommands, type Command } from '@/lib/command-palette';
import { LAYER_GROUPS } from '@/components/LayerPanel';

export interface PaletteAction {
  layer?: string;
  panel?: string;
  lat?: number;
  lng?: number;
  zoom?: number;
}

interface Props {
  panels: { id: string; label: string }[];
  onAction: (a: PaletteAction) => void;
}

const KIND_ICON = {
  layer: LayersIcon,
  country: Globe2,
  city: MapPin,
  panel: PanelRight,
} as const;

export default function CommandPalette({ panels, onAction }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands = useMemo<Command[]>(() => [
    ...LAYER_GROUPS.flatMap(g => g.layers.map(l => ({
      id: `layer:${l.key}`,
      kind: 'layer' as const,
      label: l.label,
      hint: `${g.fullLabel} · toggle`,
      action: { layer: l.key },
    }))),
    ...panels.map(p => ({
      id: `panel:${p.id}`,
      kind: 'panel' as const,
      label: p.label,
      hint: 'open panel',
      action: { panel: p.id },
    })),
    ...buildGeoCommands(),
  ], [panels]);

  const results = useMemo(() => searchCommands(commands, query), [commands, query]);

  useEffect(() => { setCursor(0); }, [query]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(v => !v);
        setQuery('');
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 30); }, [open]);

  const run = useCallback((c: Command) => {
    onAction(c.action);
    setOpen(false);
    setQuery('');
  }, [onAction]);

  if (!open) return null;

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(0,0,0,0.45)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: '14vh' }}
      onMouseDown={e => { if (e.target === e.currentTarget) setOpen(false); }}
    >
      <div className="gotham-panel" style={{ width: 480, maxWidth: '92vw', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <Search size={14} style={{ opacity: 0.6, flexShrink: 0 }} />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(c + 1, results.length - 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)); }
              else if (e.key === 'Enter' && results[cursor]) run(results[cursor]);
            }}
            placeholder="Jump to a country or city, toggle a layer, open a panel…"
            style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: '#E2E8F0', fontSize: 13 }}
          />
          <kbd style={{ fontSize: 9, opacity: 0.4, border: '1px solid rgba(255,255,255,0.2)', borderRadius: 3, padding: '1px 4px' }}>ESC</kbd>
        </div>
        {query.trim() && (
          <div style={{ maxHeight: '46vh', overflowY: 'auto' }}>
            {results.length === 0 && <div style={{ padding: '10px 12px', fontSize: 11, opacity: 0.55 }}>No matches.</div>}
            {results.map((c, i) => {
              const Icon = KIND_ICON[c.kind];
              return (
                <button
                  key={c.id}
                  onClick={() => run(c)}
                  onMouseEnter={() => setCursor(i)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
                    padding: '7px 12px', fontSize: 12, border: 'none', cursor: 'pointer',
                    background: i === cursor ? 'rgba(125,211,252,0.12)' : 'none', color: '#E2E8F0',
                  }}
                >
                  <Icon size={13} style={{ opacity: 0.55, flexShrink: 0 }} />
                  <span style={{ flex: 1 }}>{c.label}</span>
                  <span style={{ fontSize: 9, opacity: 0.45, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{c.hint}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
