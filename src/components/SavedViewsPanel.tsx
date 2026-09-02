'use client';

/**
 * VANTAGE — saved views
 *
 * Named bookmarks of the working picture: active layers + camera. Stored in
 * localStorage like the drawn shapes; applying one swaps the layer set and
 * flies the camera.
 */

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bookmark, X, Trash2, Plus } from 'lucide-react';
import { VIEWS_KEY, parseViews, upsertView, removeView, type SavedView } from '@/lib/saved-views';

interface Props {
  open: boolean;
  onClose: () => void;
  currentLayers: string[];
  currentCamera: { lat: number; lng: number; zoom: number };
  onApply: (view: SavedView) => void;
}

export default function SavedViewsPanel({ open, onClose, currentLayers, currentCamera, onApply }: Props) {
  const [views, setViews] = useState<SavedView[]>([]);
  const [name, setName] = useState('');

  useEffect(() => {
    if (open) setViews(parseViews(localStorage.getItem(VIEWS_KEY)));
  }, [open]);

  const persist = (next: SavedView[]) => {
    setViews(next);
    try { localStorage.setItem(VIEWS_KEY, JSON.stringify(next)); } catch { /* quota or private mode */ }
  };

  const saveCurrent = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    persist(upsertView(views, {
      name: trimmed,
      layers: currentLayers,
      lat: currentCamera.lat,
      lng: currentCamera.lng,
      zoom: currentCamera.zoom,
      savedAt: Date.now(),
    }));
    setName('');
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 40 }}
          className="gotham-panel"
          style={{ position: 'absolute', top: 60, right: 12, width: 'min(320px, calc(100vw - 24px))', maxHeight: '60vh', zIndex: 40, display: 'flex', flexDirection: 'column' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, letterSpacing: '0.08em' }}>
              <Bookmark size={13} /> SAVED VIEWS
            </span>
            <button onClick={onClose} className="gotham-btn" style={{ padding: '2px 5px' }}><X size={12} /></button>
          </div>

          <div style={{ display: 'flex', gap: 6, padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveCurrent(); }}
              placeholder="Name this view…"
              className="gotham-input"
              style={{ flex: 1, fontSize: 11, padding: '4px 8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, color: '#E2E8F0', outline: 'none' }}
            />
            <button onClick={saveCurrent} disabled={!name.trim()} className="gotham-btn" title="Save current layers + camera"
              style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, opacity: name.trim() ? 1 : 0.4 }}>
              <Plus size={11} /> SAVE
            </button>
          </div>

          <div style={{ overflowY: 'auto', padding: '4px 10px 8px', fontSize: 11, color: '#CBD5E1' }}>
            {views.length === 0 && (
              <div style={{ opacity: 0.6, padding: '8px 0' }}>
                No views yet. Set up layers and camera, then save the picture under a name.
              </div>
            )}
            {views.map(v => (
              <div key={v.name} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <button onClick={() => { onApply(v); onClose(); }} style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none', color: '#E2E8F0', cursor: 'pointer', fontSize: 11, padding: 0 }}>
                  <div style={{ fontWeight: 600 }}>{v.name}</div>
                  <div style={{ fontSize: 9, opacity: 0.55 }}>{v.layers.length} layers · z{v.zoom.toFixed(1)}</div>
                </button>
                <button onClick={() => persist(removeView(views, v.name))} className="gotham-btn" style={{ padding: '2px 4px' }} title="Delete">
                  <Trash2 size={11} />
                </button>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
