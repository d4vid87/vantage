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

const SEEN_KEY = 'vantage-notif-last-seen';
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

export default function AlertNotifications() {
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('unsupported');
  const [dismissed, setDismissed] = useState(true);
  const lastSeen = useRef<string>('');

  useEffect(() => {
    if (!('Notification' in window)) return;
    setPermission(Notification.permission);
    setDismissed(localStorage.getItem(DISMISS_KEY) === '1');
    lastSeen.current = localStorage.getItem(SEEN_KEY) ?? new Date().toISOString();
  }, []);

  useEffect(() => {
    if (permission !== 'granted') return;
    let stop = false;

    const poll = async () => {
      try {
        const res = await fetch('/api/alerts?limit=20');
        if (!res.ok || stop) return;
        const { alerts } = (await res.json()) as { alerts: AlertRow[] };
        const fresh = (alerts ?? [])
          .filter(a => a.createdAt > lastSeen.current)
          .slice(0, MAX_PER_POLL);
        if (fresh.length === 0) return;
        // Newest first from the API; remember the newest before notifying so a
        // throwing Notification constructor can't cause repeats next poll.
        lastSeen.current = fresh[0].createdAt;
        localStorage.setItem(SEEN_KEY, lastSeen.current);
        for (const a of fresh) {
          const n = new Notification(a.title, { body: a.body.slice(0, 160), tag: a.id, silent: a.severity === 'INFO' });
          n.onclick = () => { window.focus(); n.close(); };
        }
      } catch { /* next poll retries */ }
    };

    poll();
    const t = setInterval(poll, POLL_MS);
    return () => { stop = true; clearInterval(t); };
  }, [permission]);

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
        onClick={() => { localStorage.setItem(DISMISS_KEY, '1'); setDismissed(true); }}
      >
        <X size={11} />
      </button>
    </div>
  );
}
