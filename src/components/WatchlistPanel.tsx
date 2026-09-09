'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, X } from 'lucide-react';
import { ALL_CHANNELS, type Channel, type WatchRule, type WatchKind, type AoiSpec, type ThresholdSpec, type EntitySpec, type MarketSpec, type WeatherSpec } from '@/lib/alerts/types';
import { validateRule, WATCH_FIELDS } from '@/lib/alerts/validation';
import { usePanel } from '@/hooks/usePanel';

interface Props { open: boolean; onClose: () => void; activeRing?: number[][] | null }

export default function WatchlistPanel({ open, onClose, activeRing }: Props) {
  const panel = usePanel<HTMLElement>(open, onClose);
  const [rules, setRules] = useState<WatchRule[]>([]);
  const [ready, setReady] = useState<Record<string, boolean>>({});
  const [capabilities, setCapabilities] = useState<Record<string, boolean>>({});
  const [now, setNow] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<WatchRule | null>(null);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<WatchKind>('threshold');
  const [entityType, setEntityType] = useState<'flight' | 'vessel'>('flight');
  const [identifier, setIdentifier] = useState('');
  const [layer, setLayer] = useState('earthquakes');
  const [field, setField] = useState('magnitude');
  const [min, setMin] = useState('5');
  const [channels, setChannels] = useState<Channel[]>([]);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [replaceRing, setReplaceRing] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch('/api/watchlist');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not load watches.');
    setNow(Date.now());
    setRules(data.rules); setReady(data.channels); setCapabilities(data.capabilities ?? {});
  }, []);
  useEffect(() => {
    if (!open) return;
    const refresh = () => load().catch(e => setError(e.message));
    const initial = setTimeout(refresh, 0);
    const timer = setInterval(refresh, 30000);
    return () => { clearTimeout(initial); clearInterval(timer); };
  }, [open, load]);

  const edit = (rule: WatchRule | null) => {
    setEditing(rule); setName(rule?.name ?? ''); setKind(rule?.kind ?? 'threshold');
    setChannels(rule?.channels ?? []); setWebhookUrl(rule?.webhookUrl ?? '');
    setReplaceRing(false); setError(''); setMessage('');
    if (rule?.kind === 'entity') {
      const spec = rule.spec as EntitySpec;
      setEntityType(spec.entityType === 'vessel' ? 'vessel' : 'flight'); setIdentifier(spec.identifier);
    } else if (rule?.kind === 'threshold') {
      const spec = rule.spec as ThresholdSpec;
      setLayer(spec.layer); setField(spec.field); setMin(String(spec.min));
    } else if (rule?.kind === 'aoi') setLayer((rule.spec as AoiSpec).layers[0]);
  };
  const changeLayer = (value: string) => { setLayer(value); setField(WATCH_FIELDS[value]?.[0] ?? ''); };
  const input = () => validateRule({ name, kind, channels, webhookUrl,
    spec: (kind === 'market' || kind === 'weather') && editing ? editing.spec : kind === 'entity' ? { entityType, identifier }
      : kind === 'aoi' ? { ring: editing?.kind === 'aoi' && !replaceRing ? (editing.spec as AoiSpec).ring : activeRing,
        layers: editing?.kind === 'aoi' && layer === (editing.spec as AoiSpec).layers[0] ? (editing.spec as AoiSpec).layers : [layer] }
      : { layer, field, min: min.trim() ? Number(min) : NaN, ...(editing?.kind === 'threshold' && (editing.spec as ThresholdSpec).bbox ? { bbox: (editing.spec as ThresholdSpec).bbox } : {}) },
  });
  const action = async (operation: 'save' | 'preview' | 'test') => {
    setBusy(true); setError(''); setMessage('');
    try {
      const url = operation !== 'save' ? `/api/watchlist?action=${operation}` : editing ? `/api/watchlist?id=${encodeURIComponent(editing.id)}` : '/api/watchlist';
      const res = await fetch(url, { method: operation === 'save' && editing ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input()) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed.');
      if (operation === 'preview') setMessage(`${data.count} current matches (available feeds only). ${data.matches.map((m: { label: string }) => m.label).join(', ')}. Available: ${data.availableLayers.join(', ')}`);
      else if (operation === 'test') setMessage(Object.entries(data.results).map(([c, result]) => `${c}: ${result}`).join(' · ') || 'Choose a channel to test.');
      else { edit(null); await load(); setMessage('Watch saved.'); }
    } catch (e) { setError(e instanceof Error ? e.message : 'Request failed.'); }
    finally { setBusy(false); }
  };
  const change = async (id: string, body?: object) => {
    setError(''); setBusy(true);
    try {
      const res = await fetch(`/api/watchlist?id=${encodeURIComponent(id)}`, { method: body ? 'PATCH' : 'DELETE', headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
      if (!res.ok) throw new Error((await res.json()).error || 'Update failed.');
      if (!body && editing?.id === id) edit(null);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Update failed.'); }
    finally { setBusy(false); }
  };

  return <AnimatePresence>{open && <motion.aside ref={panel} role="dialog" aria-label="Watchlists"
    initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
    className="gotham-panel fixed left-3 bottom-3 z-[900] flex max-h-[80vh] w-[min(440px,calc(100vw-1.5rem))] flex-col rounded-lg border text-[12px]">
    <header className="flex items-center gap-2 border-b p-3"><Bell size={14} /> WATCHLISTS
      <button onClick={onClose} className="ml-auto" aria-label="Close watchlists"><X size={16} /></button></header>
    <div className="overflow-y-auto p-3 space-y-3">
      <form className="space-y-2" onSubmit={e => { e.preventDefault(); void action('save'); }}>
        <label className="block">Watch name<input aria-label="Watch name" className="gotham-input w-full" maxLength={120} required value={name} onChange={e => setName(e.target.value)} /></label>
        <label className="block">Kind<select className="gotham-input w-full" value={kind} onChange={e => { setKind(e.target.value as WatchKind); if (!WATCH_FIELDS[layer]?.length) changeLayer('earthquakes'); }}>
          {editing?.kind === 'market' && <option value="market">Market</option>}{editing?.kind === 'weather' && <option value="weather">Weather</option>}<option value="threshold">Threshold</option><option value="aoi">Geofence</option><option value="entity">Entity</option>
        </select></label>
        {kind === 'market' && editing ? <>
          <label>Symbol<input className="gotham-input w-full" value={(editing.spec as MarketSpec).symbol} onChange={e=>setEditing({...editing,spec:{...editing.spec as MarketSpec,symbol:e.target.value}})}/></label>
          <label>Measure<select className="gotham-input w-full" value={(editing.spec as MarketSpec).field} onChange={e=>setEditing({...editing,spec:{...editing.spec as MarketSpec,field:e.target.value as MarketSpec['field']}})}><option value="price">Price (USD)</option><option value="changePercent">Daily move (%)</option></select></label>
          <label>Condition<select className="gotham-input w-full" value={(editing.spec as MarketSpec).comparator} onChange={e=>setEditing({...editing,spec:{...editing.spec as MarketSpec,comparator:e.target.value as MarketSpec['comparator']}})}><option value="above">Above</option><option value="below">Below</option></select></label>
          <label>Threshold<input className="gotham-input w-full" type="number" step="any" value={(editing.spec as MarketSpec).threshold} onChange={e=>setEditing({...editing,spec:{...editing.spec as MarketSpec,threshold:Number(e.target.value)}})}/></label>
          <p>One notification per arming. Enable the saved rule to rearm.</p>
        </> : kind === 'weather' && editing ? <>
          <p>Monitoring {(editing.spec as WeatherSpec).place?.name || 'the saved drawn area'}.</p>
          <label>Notifications<select className="gotham-input w-full" value={(editing.spec as WeatherSpec).events.join(',')} onChange={e=>setEditing({...editing,spec:{...editing.spec as WeatherSpec,events:e.target.value.split(',')}})}><option value="warnings,watches">Warnings and watches</option><option value="warnings">Warnings only</option><option value="all">All official alerts</option></select></label>
        </> : kind === 'entity' ? <>
          <label className="block">Entity type<select className="gotham-input w-full" value={entityType} onChange={e => setEntityType(e.target.value as 'flight' | 'vessel')}><option value="flight">Aircraft</option><option value="vessel">Vessel</option></select></label>
          <label className="block">{entityType === 'flight' ? 'ICAO24, callsign, or registration (exact match)' : 'MMSI or vessel name (exact match)'}<input className="gotham-input w-full" required value={identifier} onChange={e => setIdentifier(e.target.value)} /></label>
          <p className="opacity-70">Wallet, Telegram, and sanctions watches are not yet supported by the scheduler.</p>
        </> : <>
          <label className="block">Layer<select className="gotham-input w-full" value={layer} onChange={e => changeLayer(e.target.value)}>{Object.entries(WATCH_FIELDS).filter(([, fields]) => kind === 'aoi' || fields.length).map(([key]) => <option key={key} value={key}>{key.replaceAll('_', ' ')}</option>)}</select></label>
          {kind === 'threshold' ? <div className="flex gap-2">
            <label className="flex-1">Field<select className="gotham-input w-full" value={field} onChange={e => setField(e.target.value)}>{(WATCH_FIELDS[layer] ?? []).map(f => <option key={f}>{f}</option>)}</select></label>
            <label className="flex-1">At least<input className="gotham-input w-full" type="number" step="any" required value={min} onChange={e => setMin(e.target.value)} /></label>
          </div> : <p>{editing?.kind === 'aoi' && !replaceRing ? <>Keeping saved polygon. <button type="button" onClick={() => setReplaceRing(true)}>Use drawn polygon</button></> : activeRing ? `Using drawn polygon (${activeRing.length - 1} vertices).` : 'Draw a polygon on the map first.'}</p>}
        </>}
        {((kind === 'entity' && entityType === 'vessel') || (kind !== 'entity' && layer === 'maritime')) && !capabilities.maritime && <p className="text-amber-300">Live vessel coverage requires an AIS key on this server.</p>}
        {layer === 'acled' && kind !== 'entity' && !capabilities.acled && <p className="text-amber-300">ACLED credentials are not configured.</p>}
        <fieldset className="flex flex-wrap gap-3"><legend>Delivery (all alerts are saved to the inbox)</legend>{ALL_CHANNELS.map(c => <label key={c}><input type="checkbox" checked={channels.includes(c)} onChange={() => setChannels(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c])} /> {c}{!ready[c] && !(c === 'webhook' && webhookUrl) ? ' (unconfigured)' : ''}</label>)}</fieldset>
        {channels.includes('webhook') && <label className="block">Webhook override<input type="url" className="gotham-input w-full" value={webhookUrl} onChange={e => setWebhookUrl(e.target.value)} placeholder="Optional HTTPS endpoint" /></label>}
        <div className="flex flex-wrap gap-2"><button className="gotham-btn" disabled={busy}>{editing ? 'Save changes' : 'Create watch'}</button><button type="button" className="gotham-btn" disabled={busy} onClick={() => action('preview')}>Preview matches</button><button type="button" className="gotham-btn" disabled={busy || !channels.length} onClick={() => action('test')}>Send test notification</button>{editing && <button type="button" onClick={() => edit(null)}>Cancel edit</button>}</div>
      </form>
      {error && <p role="alert" className="text-red-300">{error}</p>}{message && <p role="status" className="break-words">{message}</p>}
      {!rules.length && <p>No watches yet.</p>}
      {rules.map(rule => <div key={rule.id} className="border-t py-2 space-y-1">
        <strong>{rule.name}</strong><p>{rule.kind} · {rule.channels.join(', ') || 'Inbox only'}{rule.lastFiredAt && ` · Last fired ${new Date(rule.lastFiredAt).toLocaleString()}`}</p>
        {rule.snoozedUntil && Date.parse(rule.snoozedUntil) > now && <p>Muted until {new Date(rule.snoozedUntil).toLocaleString()}</p>}
        <div className="flex gap-3"><button disabled={busy} onClick={() => edit(rule)}>Edit</button><button disabled={busy} onClick={() => change(rule.id, { enabled: !rule.enabled })}>{rule.enabled ? 'Disable' : 'Enable'}</button><button disabled={busy} onClick={() => change(rule.id, { snoozeMinutes: rule.snoozedUntil && Date.parse(rule.snoozedUntil) > now ? 0 : 60 })}>{rule.snoozedUntil && Date.parse(rule.snoozedUntil) > now ? 'Unmute' : 'Mute 1h'}</button><button disabled={busy} onClick={() => change(rule.id)}>Delete</button></div>
      </div>)}
    </div>
  </motion.aside>}</AnimatePresence>;
}
