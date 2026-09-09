/**
 * VANTAGE — scheduled intelligence brief.
 *
 * Ties three pieces that already exist into the differentiator: the alert
 * scheduler's snapshot collection, the briefing prompt in ai-engine, and the
 * alert dispatch channels. The result is a daily read-out generated locally by
 * Ollama and pushed to Discord/ntfy/email without the UI ever being open.
 */

import { toContext } from './ai/context';
import { db, newId } from './db';
import { collectSnapshot } from './alerts/run';
import { generateBriefing } from './ai-engine';
import { dispatchAlert, channelStatus } from './alerts/dispatch';
import { summarizeSnapshot, diffSnapshots, changesSection } from './brief-diff';
import type { Alert, Channel } from './alerts/types';

export interface Brief {
  id: string;
  markdown: string;
  provider: string | null;
  model: string | null;
  meta: Record<string, number> | null;
  createdAt: string;
}

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

export { toContext } from './ai/context';

export interface BriefResult {
  brief: Brief;
  delivered: Record<string, string>;
}

/**
 * Build, persist and deliver a brief. Persistence happens before dispatch so a
 * failing channel never costs the analysis.
 */
async function topRisks(): Promise<unknown[]> {
  try {
    const origin = process.env.VANTAGE_SELF_ORIGIN || `http://127.0.0.1:${process.env.PORT || 3000}`;
    const res = await fetch(`${origin}/api/country-risk`, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.countries ?? []).slice(0, 10);
  } catch {
    return []; // a missing index must not cost the brief
  }
}

const PREV_SNAPSHOT_KEY = 'brief_prev_snapshot';

let generating: Promise<BriefResult> | null = null;
export function generateDailyBrief(): Promise<BriefResult> {
  if (!generating) generating = generate().finally(() => { generating = null; });
  return generating;
}

async function generate(): Promise<BriefResult> {
  const snapshot = await collectSnapshot();
  const origin = process.env.VANTAGE_SELF_ORIGIN || `http://127.0.0.1:${process.env.PORT || 3000}`;
  await Promise.all([['news', '/api/news', 'news'], ['cyber', '/api/cyber-threats', 'threats']].map(async ([key, path, field]) => {
    try {
      const response = await fetch(`${origin}${path}`, { signal: AbortSignal.timeout(20_000) });
      if (!response.ok) return;
      const data = await response.json();
      if (Array.isArray(data[field])) snapshot[key] = data[field];
    } catch { /* other feeds can still support a brief */ }
  }));
  if (!Object.values(snapshot).some(rows => rows.length)) throw new Error('No feed data available for a brief.');
  const risks = await topRisks();
  if (risks.length) (snapshot as Record<string, unknown[]>).country_risk = risks;
  const counts: Record<string, number> = {};
  for (const [k, v] of Object.entries(snapshot)) counts[k] = Array.isArray(v) ? v.length : 0;

  // What changed since the last run — appended deterministically, because the
  // model paraphrasing away a new outbreak is the failure this must prevent.
  let prev = null;
  try { prev = JSON.parse(getSetting(PREV_SNAPSHOT_KEY) ?? 'null'); } catch { /* corrupt = no diff */ }
  const summary = summarizeSnapshot(snapshot as Record<string, unknown[]>);
  const changes = changesSection(diffSnapshots(prev, summary));

  const markdown = (await generateBriefing(toContext(snapshot as Record<string, unknown[]>))) + changes;

  const brief = db().transaction(() => {
    const saved = saveBrief({
    markdown,
    provider: process.env.VANTAGE_AI_PROVIDER || 'ollama',
    model: null,
    meta: counts,
    });
    setSetting(PREV_SNAPSHOT_KEY, JSON.stringify(summary));
    return saved;
  })();

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
export function briefClock(now: Date, timeZone = process.env.VANTAGE_BRIEF_TIMEZONE || Intl.DateTimeFormat().resolvedOptions().timeZone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now).map(p => [p.type, p.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, minute: Number(parts.hour) * 60 + Number(parts.minute), timeZone };
}

export function shouldRunBrief(now: Date, configured: string | null, lastRunDate: string | null): boolean {
  if (!configured || !/^(?:[01]?\d|2[0-3]):[0-5]\d$/.test(configured.trim())) return false;
  const [hour, minute] = configured.trim().split(':').map(Number);
  const clock = briefClock(now);
  return clock.day !== lastRunDate && clock.minute >= hour * 60 + minute;
}

export function briefSchedule() {
  const at = process.env.VANTAGE_DAILY_BRIEF?.trim() || null;
  const timeZone = process.env.VANTAGE_BRIEF_TIMEZONE || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const lastRun = getSetting(BRIEF_LAST_RUN_KEY);
  const enabled = (process.env.VANTAGE_SCHEDULER || '').toLowerCase() !== 'off';
  let error: string | null = null;
  try { briefClock(new Date(), timeZone); } catch { error = 'Invalid VANTAGE_BRIEF_TIMEZONE. Use an IANA timezone such as America/Chicago.'; }
  if (at && !/^(?:[01]?\d|2[0-3]):[0-5]\d$/.test(at)) error = 'Invalid VANTAGE_DAILY_BRIEF. Use HH:MM (00:00–23:59).';
  if (error) return { at, timeZone, lastRun, nextRun: null, enabled: false, error };
  let nextRun: string | null = null;
  if (enabled && at && /^(?:[01]?\d|2[0-3]):[0-5]\d$/.test(at)) {
    const now = Date.now();
    for (let i = 0; i <= 48 * 60; i++) {
      const candidate = new Date(now + i * 60_000);
      if (shouldRunBrief(candidate, at, lastRun)) { nextRun = candidate.toISOString(); break; }
    }
  }
  return { at, timeZone, lastRun, nextRun, enabled, error };
}

export const BRIEF_LAST_RUN_KEY = 'brief_last_run_date';
