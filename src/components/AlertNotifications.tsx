'use client';

/**
 * VANTAGE — desktop notifications for fired alerts
 *
 * The zero-config channel: while a tab is open, new alerts pop as system
 * notifications — no Discord webhook or ntfy topic needed. Offers a small
 * one-time chip to request permission (browsers require a user gesture);
 * afterwards it polls silently.
 */

import { useEffect, useRef, useState } from 'react';
import { BellRing, X } from 'lucide-react';

const SEEN_KEY = 'vantage-notif-seen-v2';
const DISMISS_KEY = 'vantage-notif-dismissed';
const POLL_MS = 60_000;
const MAX_PER_POLL = 3;

interface AlertRow {
  id: string;
  title: string;
  body: string;
  severity: string;
  createdAt: string;
}

export default function AlertNotifications({ onOpen }: { onOpen?: () => void }) {
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('unsupported');
  const [dismissed, setDismissed] = useState(true);
  const lastSeen = useRef<string>('');
  const seenIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!('Notification' in window)) return;
    // Read native notification permission after hydration; it is unavailable on the server.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPermission(Notification.permission);
    lastSeen.current = new Date().toISOString();
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === '1');
      const saved = JSON.parse(localStorage.getItem(SEEN_KEY) || 'null');
      if (saved && typeof saved.at === 'string' && Array.isArray(saved.ids)) { lastSeen.current = saved.at; seenIds.current = new Set(saved.ids); }
    } catch { setDismissed(false); }
  }, []);

  useEffect(() => {
    if (permission !== 'granted') return;
    let stop = false;

    const poll = async () => {
      try {
        const res = await fetch('/api/alerts?limit=500');
        if (!res.ok || stop) return;
        const { alerts } = (await res.json()) as { alerts: AlertRow[] };
        const fresh = (alerts ?? [])
          .filter(a => a.createdAt >= lastSeen.current && !seenIds.current.has(a.id));
        if (fresh.length === 0) return;
        const newest = fresh.reduce((at, a) => a.createdAt > at ? a.createdAt : at, lastSeen.current);
        const previousIds = newest === lastSeen.current ? seenIds.current : new Set<string>();
        lastSeen.current = newest;
        seenIds.current = new Set([...previousIds, ...fresh.filter(a => a.createdAt === newest).map(a => a.id)]);
        try { localStorage.setItem(SEEN_KEY, JSON.stringify({ at: newest, ids: [...seenIds.current] })); } catch { /* session dedupe still works */ }
        const notifications = fresh.length <= MAX_PER_POLL ? fresh : [{
          id: 'vantage-alert-burst', title: `${fresh.length}${alerts.length === 500 ? '+' : ''} new Vantage alerts`,
          body: 'Open the stored alert inbox to review this burst.', severity: 'HIGH', createdAt: newest,
        }];
        for (const a of notifications) {
          const n = new Notification(a.title, { body: a.body.slice(0, 160), tag: a.id, silent: a.severity === 'INFO' });
          n.onclick = () => { window.focus(); onOpen?.(); n.close(); };
        }
      } catch { /* next poll retries */ }
    };

    poll();
    const t = setInterval(poll, POLL_MS);
    return () => { stop = true; clearInterval(t); };
  }, [permission, onOpen]);

  if (permission !== 'default' || dismissed) return null;

  return (
    <div className="gotham-panel" style={{ position: 'absolute', bottom: 96, right: 12, zIndex: 45, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', fontSize: 11 }}>
      <BellRing size={13} style={{ color: 'var(--gold-primary, #D4AF37)' }} />
      <span style={{ color: '#CBD5E1' }}>Desktop alerts?</span>
      <button
        className="gotham-btn"
        style={{ fontSize: 10 }}
        onClick={async () => {
          const p = await Notification.requestPermission();
          setPermission(p);
        }}
      >
        ENABLE
      </button>
      <button
        className="gotham-btn"
        style={{ padding: '2px 4px' }}
        aria-label="Dismiss"
        onClick={() => { try { localStorage.setItem(DISMISS_KEY, '1'); } catch {} setDismissed(true); }}
      >
        <X size={11} />
      </button>
    </div>
  );
}
