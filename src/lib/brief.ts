/**
 * VANTAGE — scheduled intelligence brief.
 *
 * Ties three pieces that already exist into the differentiator: the alert
 * scheduler's snapshot collection, the briefing prompt in ai-engine, and the
 * alert dispatch channels. The result is a daily read-out generated locally by
 * Ollama and pushed to Discord/ntfy/email without the UI ever being open.
 */

import { db, newId } from './db';
import { collectSnapshot } from './alerts/run';
import { generateBriefing, type IntelligenceContext } from './ai-engine';
import { dispatchAlert, channelStatus } from './alerts/dispatch';
import type { Alert, Channel } from './alerts/types';

export interface Brief {
  id: string;
  markdown: string;
  provider: string | null;
  model: string | null;
  meta: Record<string, number> | null;
  createdAt: string;
}

/** Records per layer, capped so a huge feed cannot bloat the prompt. */
const MAX_PER_LAYER = 25;

export function getSetting(key: string): string | null {
  const row = db().prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  db().prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  ).run(key, value);
}

export function listBriefs(limit = 30): Brief[] {
  const rows = db().prepare(
    'SELECT id, markdown, provider, model, meta, created_at FROM briefs ORDER BY created_at DESC LIMIT ?',
  ).all(limit) as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    id: String(r.id),
    markdown: String(r.markdown),
    provider: (r.provider as string) ?? null,
    model: (r.model as string) ?? null,
    meta: r.meta ? (JSON.parse(String(r.meta)) as Record<string, number>) : null,
    createdAt: String(r.created_at),
  }));
}

function saveBrief(b: Omit<Brief, 'id' | 'createdAt'>): Brief {
  const id = newId('brief');
  const createdAt = new Date().toISOString();
  db().prepare(
    'INSERT INTO briefs (id, markdown, provider, model, meta, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(id, b.markdown, b.provider, b.model, b.meta ? JSON.stringify(b.meta) : null, createdAt);
  return { id, createdAt, ...b };
}

/**
 * Shape the scheduler's snapshot into the context the briefing prompt expects.
 *
 * The feed routes and the prompt serializer disagree on field names — feeds
 * emit lat/lng/place, the serializer reads latitude/longitude/location and
 * calls .toFixed on them — so the mapping is explicit rather than a cast.
 * Unmapped layers fold into `threats`, letting a new feed reach the model
 * without touching the prompt.
 */
export function toContext(snapshot: Record<string, unknown[]>): IntelligenceContext {
  const rows = (k: string) => (Array.isArray(snapshot[k]) ? snapshot[k].slice(0, MAX_PER_LAYER) : []);
  const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  const str = (v: unknown): string => (v == null ? '' : String(v));

  const earthquakes = rows('earthquakes').map((r) => {
    const q = r as Record<string, unknown>;
    return {
      id: str(q.id),
      magnitude: num(q.magnitude),
      location: str(q.place ?? q.location),
      latitude: num(q.lat ?? q.latitude),
      longitude: num(q.lng ?? q.longitude),
      depth: num(q.depth),
      timestamp: str(q.time ?? q.timestamp),
      tsunami: Boolean(q.tsunami),
      felt: typeof q.felt === 'number' ? q.felt : null,
      alert: q.alert ? str(q.alert) : null,
    };
  });

  const news = rows('news').map((r) => {
    const n = r as Record<string, unknown>;
    const c = n.coords;
    return {
      id: str(n.id),
      title: str(n.title),
      description: str(n.description),
      link: str(n.link),
      published: str(n.published),
      source: str(n.source),
      risk_score: num(n.risk_score),
      coords: Array.isArray(c) && c.length >= 2 ? ([num(c[0]), num(c[1])] as [number, number]) : null,
      machine_assessment: n.machine_assessment ? str(n.machine_assessment) : null,
    };
  });

  const cyberAlerts = rows('cyber').map((r) => {
    const c = r as Record<string, unknown>;
    return {
      id: str(c.id), name: str(c.name), vendor: str(c.vendor), product: str(c.product),
      severity: str(c.severity), date: str(c.date), due: str(c.due), source: str(c.source),
    };
  });

  const known = new Set(['earthquakes', 'news', 'cyber']);
  const threats = Object.entries(snapshot)
    .filter(([k]) => !known.has(k))
    .flatMap(([layer, records]) =>
      (Array.isArray(records) ? records.slice(0, MAX_PER_LAYER) : []).map((r) => {
        const t = r as Record<string, unknown>;
        return {
          id: str(t.id),
          type: layer,
          title: str(t.title ?? t.name ?? t.victim ?? t.utility ?? t.disease ?? t.description),
          description: str(t.description ?? t.summary ?? t.notes ?? ''),
          severity: (str(t.severity).toUpperCase() || 'LOW') as 'CRITICAL' | 'HIGH' | 'ELEVATED' | 'LOW',
          region: str(t.country ?? t.country_name ?? t.state ?? t.location ?? ''),
          latitude: num(t.lat ?? t.latitude),
          longitude: num(t.lng ?? t.longitude),
          timestamp: str(t.date ?? t.published ?? t.started ?? t.discovered ?? ''),
          source: str(t.source ?? layer),
        };
      }),
    );

  return { earthquakes, news, threats, cyberAlerts, timestamp: new Date().toISOString() };
}

export interface BriefResult {
  brief: Brief;
  delivered: Record<string, string>;
}

/**
 * Build, persist and deliver a brief. Persistence happens before dispatch so a
 * failing channel never costs the analysis.
 */
export async function generateDailyBrief(): Promise<BriefResult> {
  const snapshot = await collectSnapshot();
  const counts: Record<string, number> = {};
  for (const [k, v] of Object.entries(snapshot)) counts[k] = Array.isArray(v) ? v.length : 0;

  const markdown = await generateBriefing(toContext(snapshot as Record<string, unknown[]>));

  const brief = saveBrief({
    markdown,
    provider: process.env.VANTAGE_AI_PROVIDER || 'ollama',
    model: null,
    meta: counts,
  });

  const enabled = (Object.entries(channelStatus()) as Array<[Channel, boolean]>)
    .filter(([, on]) => on)
    .map(([c]) => c);

  let delivered: Record<string, string> = {};
  if (enabled.length > 0) {
    const alert: Alert = {
      id: brief.id,
      ruleId: null,
      title: `VANTAGE Daily Brief — ${brief.createdAt.slice(0, 10)}`,
      // Discord caps a message at 2000 characters, and a brief routinely runs
      // longer; the panel holds the full text.
      body: markdown.length > 1500 ? `${markdown.slice(0, 1500)}\n\n… full brief in the Vantage briefs panel.` : markdown,
      severity: 'INFO',
      lat: null,
      lng: null,
      payload: { kind: 'daily_brief', counts },
      createdAt: brief.createdAt,
      delivered: null,
    };
    delivered = (await dispatchAlert(alert, enabled)).results;
  }

  return { brief, delivered };
}

/**
 * Fire at most once per day, at the configured local HH:MM. The scheduler ticks
 * every minute, so the guard — not the tick — is what makes this idempotent.
 */
export function shouldRunBrief(now: Date, configured: string | null, lastRunDate: string | null): boolean {
  if (!configured) return false;
  const m = /^(\d{1,2}):(\d{2})$/.exec(configured.trim());
  if (!m) return false;

  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  if (lastRunDate === today) return false;

  const target = Number(m[1]) * 60 + Number(m[2]);
  const current = now.getHours() * 60 + now.getMinutes();
  // Fire at or after the target so a missed minute under load still delivers.
  return current >= target;
}

export const BRIEF_LAST_RUN_KEY = 'brief_last_run_date';
