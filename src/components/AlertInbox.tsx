'use client';
import { useCallback, useEffect, useState } from 'react';
import type { Alert } from '@/lib/alerts/types';

export default function AlertInbox({ onLocate }: { onLocate: (lat: number, lng: number) => void }) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [error, setError] = useState('');
  const [severity, setSeverity] = useState('all');
  const [unread, setUnread] = useState(false);
  const [limit, setLimit] = useState(100);
  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/alerts?limit=${limit}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Unable to load alerts.');
      setAlerts(body.alerts); setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load alerts.'); }
  }, [limit]);
  useEffect(() => {
    const initial = setTimeout(() => { void load(); }, 0);
    const timer = setInterval(() => { if (!document.hidden) void load(); }, 30000);
    return () => { clearTimeout(initial); clearInterval(timer); };
  }, [load]);
  const acknowledge = async (alert: Alert) => {
    try {
      const res = await fetch('/api/alerts', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: alert.id, acknowledged: !alert.acknowledgedAt }) });
      if (!res.ok) throw new Error('Could not update alert.');
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not update alert.'); }
  };
  const visible = alerts.filter(a => (severity === 'all' || a.severity === severity) && (!unread || !a.acknowledgedAt));
  return <section className="flex-1 overflow-y-auto p-3 text-[12px] space-y-3" aria-label="Stored alert inbox">
    <div className="flex flex-wrap gap-2 items-center"><label>Severity <select className="gotham-input" value={severity} onChange={e => setSeverity(e.target.value)}>{['all', 'CRITICAL', 'HIGH', 'ELEVATED', 'INFO'].map(s => <option key={s}>{s}</option>)}</select></label><label><input type="checkbox" checked={unread} onChange={e => setUnread(e.target.checked)} /> Unacknowledged</label><button className="gotham-btn" onClick={load}>Refresh</button></div>
    {error && <p role="alert" className="text-red-300">{error}</p>}
    {!visible.length && <p>No stored alerts match this filter.</p>}
    {visible.map(a => <article key={a.id} className="border rounded p-2 space-y-1" style={{ opacity: a.acknowledgedAt ? 0.65 : 1 }}>
      <div>{a.severity} · <time>{new Date(a.createdAt).toLocaleString()}</time></div>
      <strong>{a.title}</strong><p>{a.body}</p>
      <p className="break-words">Delivery: {a.delivered && Object.keys(a.delivered).length ? Object.entries(a.delivered).map(([c, result]) => `${c}: ${result}`).join(' · ') : a.delivered ? 'Inbox only' : 'Not yet recorded'}</p>
      <div className="flex gap-3"><button onClick={() => acknowledge(a)}>{a.acknowledgedAt ? 'Mark unacknowledged' : 'Acknowledge'}</button>{a.lat != null && a.lng != null && <button onClick={() => onLocate(a.lat!, a.lng!)}>Locate on map</button>}</div>
    </article>)}
    <p className="opacity-70">Showing the latest {alerts.length} stored alerts.</p>
    {alerts.length === limit && limit < 500 && <button className="gotham-btn" onClick={() => setLimit(500)}>Load up to 500 recent alerts</button>}
  </section>;
}
