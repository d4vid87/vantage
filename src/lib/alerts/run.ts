import {dashboardSettings} from '../dashboard/settings';
import {notificationAllowed, DEFAULT_NOTIFICATION_POLICY, isSevereWeather} from './notification-policy';
import { createHash } from 'node:crypto';
import { quotes } from '../dashboard/finance';
import { weatherAlerts, resolveGeometry, type WeatherAlert } from '../dashboard/weather';
import type { MarketSpec, WeatherSpec } from './types';
/**
 * ═══════════════════════════════════════════════════════════════
 *  VANTAGE — Evaluator core
 *
 *  Shared by the HTTP tick route and the in-process scheduler, so alerts fire
 *  on the same code path whether they are driven by a cron, a client, or the
 *  server's own timer.
 * ═══════════════════════════════════════════════════════════════
 */

import { db } from '../db';
import { validateRule } from './validation';
import { evaluateRule, severityFor, type FeedSnapshot } from './evaluate';
import { claimNewKeys, listRules, markFired, recordAlert, recordDelivery, reconcileWeatherHistory } from './store';
import { channelStatus, dispatchAlert } from './dispatch';
import { detectAnomaly } from '../anomaly';
import { historyFor, inCooldown, markAlerted, pruneCounts, recordCount } from '../anomaly-store';
import type { Alert, Channel } from './types';

/** Cap per rule per run so one wide geofence can't spam every channel. */
export const MAX_ALERTS_PER_RULE = 10;

export interface FiredAlert {
  ruleId: string;
  alertId: string;
  delivered: Record<string, string>;
}

/**
 * Evaluate every enabled rule against `snapshot`, persist new matches, and
 * dispatch them. Alerts are written before dispatch, so a delivery outage
 * loses a notification but never the alert.
 */
export async function runEvaluation(snapshot: FeedSnapshot): Promise<FiredAlert[]> {
  const fired: FiredAlert[] = [];
  const policy = dashboardSettings().notifications ?? DEFAULT_NOTIFICATION_POLICY;

  for (const rule of listRules()) {
    if (!rule.enabled) continue;
    let alerts;
    try {
      validateRule(rule);
      const matches = [...new Map(evaluateRule(rule, snapshot).map(m => [m.key, m])).values()];
      // Claim and persist ALL matches atomically, before making any network call.
      alerts = db().transaction(() => {
        if (!(db().prepare('SELECT enabled FROM watch_rules WHERE id = ?').get(rule.id) as {enabled:number} | undefined)?.enabled) return [];
        const fresh = new Set(claimNewKeys(rule.id, matches.map(m => m.key)));
        const saved = matches.filter(m => fresh.has(m.key)).map(match => recordAlert({
          ruleId: rule.id, title: `${rule.name} — ${match.label}`,
          body: rule.kind === 'market' || rule.kind === 'weather' ? `${match.label}\n${String(match.record.instruction || '')}` : `Watch "${rule.name}" matched a new ${match.layer} entity: ${match.label}.`,
          severity: severityFor(match), lat: match.lat, lng: match.lng, payload: match.record,
        }));
        if (saved.length && rule.kind === 'market') db().prepare('UPDATE watch_rules SET enabled = 0 WHERE id = ?').run(rule.id);
        return saved;
      })();
    } catch (error) {
      console.error(`[VANTAGE] skipping invalid/failed watch ${rule.id}:`, error);
      continue;
    }
    if (!alerts.length) continue;
    const batches = policy.grouped ? [alerts] : alerts.length > MAX_ALERTS_PER_RULE
      ? [...alerts.slice(0, MAX_ALERTS_PER_RULE - 1).map(a => [a]), alerts.slice(MAX_ALERTS_PER_RULE - 1)]
      : alerts.map(a => [a]);
    for (const batch of batches) {
      const notification = batch.length === 1 ? batch[0] : {
        ...batch[0], title: `${rule.name} — ${batch.length} additional matches`,
        body: `${batch.length} new matches were saved. Open the Vantage alert inbox to review all of them.`,
        severity: (['CRITICAL', 'HIGH', 'ELEVATED', 'INFO'] as Alert['severity'][]).find(severity => batch.some(a => a.severity === severity))!,
        payload: { count: batch.length, severeWeather: batch.some(isSevereWeather) },
      };
      const { results } = notificationAllowed(policy, notification) ? await dispatchAlert(notification, rule.channels, { webhookUrl: rule.webhookUrl }) : {results:Object.fromEntries(rule.channels.map(c=>[c,"muted: quiet hours; stored in inbox"]))};
      for (const alert of batch) {
        recordDelivery(alert.id, results);
        fired.push({ ruleId: rule.id, alertId: alert.id, delivered: results });
      }
    }
    markFired(rule.id);
  }

  return fired;
}

/** Layers the scheduler pulls, mapped to the route that serves them. */
const ALERT_FEEDS: Array<{ layer: string; path: string; pick: (data: Record<string, unknown>) => unknown[] }> = [
  {
    layer: 'earthquakes',
    path: '/api/earthquakes',
    pick: (d) => (Array.isArray(d.earthquakes) ? d.earthquakes : []),
  },
  {
    layer: 'flights',
    path: '/api/flights',
    // The route buckets aircraft by class; alerting wants one flat layer.
    pick: (d) =>
      ['commercial_flights', 'private_flights', 'private_jets', 'military_flights'].flatMap((k) =>
        Array.isArray(d[k]) ? (d[k] as unknown[]) : []
      ),
  },
  { layer: 'maritime', path: '/api/maritime', pick: d => Array.isArray(d.ships) ? d.ships : [] },
  {
    layer: 'fires',
    path: '/api/fires',
    pick: (d) => (Array.isArray(d.fires) ? d.fires : []),
  },
  {
    layer: 'conflicts',
    path: '/api/conflicts',
    pick: (d) => {
      const zones = Array.isArray(d.zones) ? d.zones : [];
      const live = Array.isArray(d.liveEvents) ? d.liveEvents : [];
      return [...zones, ...live];
    },
  },
  {
    layer: 'disease',
    path: '/api/disease',
    pick: (d) => (Array.isArray(d.outbreaks) ? d.outbreaks : []),
  },
  {
    layer: 'volcanoes',
    path: '/api/volcanoes',
    pick: (d) => (Array.isArray(d.volcanoes) ? d.volcanoes : []),
  },
  {
    layer: 'power_outages',
    path: '/api/power-outages',
    pick: (d) => (Array.isArray(d.outages) ? d.outages : []),
  },
  {
    layer: 'radiation',
    path: '/api/radiation',
    pick: (d) => (Array.isArray(d.stations) ? d.stations : []),
  },
  {
    layer: 'air_quality',
    path: '/api/air-quality',
    pick: (d) => (Array.isArray(d.stations) ? d.stations : []),
  },
  {
    layer: 'internet_outages',
    path: '/api/radar',
    pick: (d) => (Array.isArray(d.outages) ? d.outages : []),
  },
  {
    layer: 'ransomware',
    path: '/api/ransomware',
    pick: (d) => (Array.isArray(d.victims) ? d.victims : []),
  },
  {
    // Credential-gated: the route 503s when unconfigured, which collectSnapshot
    // treats as an absent layer rather than an error.
    layer: 'acled',
    path: '/api/acled',
    pick: (d) => (Array.isArray(d.events) ? d.events : []),
  },
];

/** Complete counts from the last snapshot; never truncate watch coverage. */
let layerCounts: Record<string, number> = {};

export function lastLayerCounts(): Record<string, number> {
  return { ...layerCounts };
}

function selfOrigin(): string {
  return process.env.VANTAGE_SELF_ORIGIN || `http://127.0.0.1:${process.env.PORT || 3000}`;
}

/**
 * Fetch the alert-eligible layers from the app's own feed routes over
 * loopback. Each feed fails independently — one dead upstream must not stop
 * the rest of the evaluation.
 */
export async function collectSnapshot(extraRules: import('./types').WatchRule[] = [], coreOnly = false): Promise<FeedSnapshot> {
  const origin = selfOrigin();
  const snapshot: FeedSnapshot = {};
  const counts: Record<string, number> = {};

  await Promise.all(
    ALERT_FEEDS.map(async ({ layer, path, pick }) => {
      try {
        const res = await fetch(`${origin}${path}`, {
          signal: AbortSignal.timeout(20_000),
          headers: { 'User-Agent': 'Vantage-Scheduler' },
        });
        if (!res.ok) return;
        const data = (await res.json()) as Record<string, unknown>;
        const all = pick(data);
        counts[layer] = all.length;
        const records = all.filter(r => r && typeof r === 'object' && !Array.isArray(r));
        snapshot[layer] = records as FeedSnapshot[string];
      } catch {
        /* feed unavailable this cycle — try again next tick */
      }
    })
  );

  if (!coreOnly) {
    const personal = await Promise.all([collectMarketSnapshot(extraRules), collectWeatherSnapshot(extraRules)]);
    Object.assign(snapshot, ...personal);
  }
  layerCounts = counts;
  return snapshot;
}

/**
 * Compare each layer's current count against its trailing 24h baseline and
 * alert on spikes. The alert is persisted first, so it shows in the alerts
 * panel even with no delivery channel configured. Returns alerts fired.
 */
export async function runAnomalyCheck(counts: Record<string, number>, now = Date.now()): Promise<number> {
  let firedCount = 0;
  const enabled = (Object.entries(channelStatus()) as Array<[Channel, boolean]>)
    .filter(([, on]) => on)
    .map(([c]) => c);

  for (const [layer, count] of Object.entries(counts)) {
    const history = historyFor(layer, now);
    recordCount(layer, count, now);

    const verdict = detectAnomaly(history, count);
    if (!verdict.anomalous || inCooldown(layer, now)) continue;
    markAlerted(layer, now);

    const alert = recordAlert({
      ruleId: null,
      title: `Anomaly — ${layer} at ${verdict.ratio.toFixed(1)}x baseline`,
      body: `The ${layer} layer jumped to ${count} items against a trailing 24h mean of ${Math.round(verdict.mean)}. Sustained spikes alert once per 6h.`,
      severity: 'ELEVATED',
      lat: null,
      lng: null,
      payload: { kind: 'anomaly', layer, count, mean: verdict.mean, ratio: verdict.ratio },
    });
    if (enabled.length > 0) {
      const { results } = notificationAllowed(dashboardSettings().notifications ?? DEFAULT_NOTIFICATION_POLICY, alert) ? await dispatchAlert(alert, enabled) : {results:Object.fromEntries(enabled.map(c=>[c,"muted: quiet hours; stored in inbox"]))};
      recordDelivery(alert.id, results);
    }
    firedCount++;
  }

  pruneCounts(now);
  return firedCount;
}

export async function collectMarketSnapshot(extraRules: import('./types').WatchRule[] = []): Promise<FeedSnapshot> {
  const snapshot: FeedSnapshot = {};
  const active = [...listRules(), ...extraRules].filter(r => r.enabled);
  const symbols = [...new Set(active.filter(r => r.kind === 'market').map(r => (r.spec as MarketSpec).symbol))];
  if (symbols.length) {
    const results = await quotes(symbols);
    snapshot.personal_quotes = results.filter(r => r.status === 'ready' && r.data).map(r => ({ ...r.data!, receivedAt: r.receivedAt }));
  }
  return snapshot;
}

export async function collectWeatherSnapshot(extraRules: import('./types').WatchRule[] = []): Promise<FeedSnapshot> {
  const snapshot: FeedSnapshot = {};
  const active = [...listRules(), ...extraRules].filter(r => r.enabled);
  const weatherRules = active.filter(r => r.kind === 'weather');
  if (weatherRules.length && !extraRules.length) {
    const national = await weatherAlerts();
    if (national.status === 'ready' && national.data) reconcileWeatherHistory(new Set(national.data.map(a => a.id)));
  }
  const alerts = new Map<string, WeatherAlert>();
  for (const rule of weatherRules) {
    const spec = rule.spec as WeatherSpec;
    const result = await weatherAlerts(spec.place);
    if (result.status !== 'ready') continue;
    for (let alert of result.data ?? []) {
      if (!spec.place) alert = await resolveGeometry(alert);
      const previous = alerts.get(alert.id);
      alerts.set(alert.id, { ...alert, geometry: alert.geometry || previous?.geometry || null, placeIds: [...new Set([...(previous?.placeIds ?? []), ...(spec.place ? [spec.place.id] : [])])] });
    }
  }
  if (weatherRules.length) snapshot.weather_alerts = [...alerts.values()].map(a => ({ ...a, revisionKey: 'weather:' + a.id + ':' + createHash('sha256').update(JSON.stringify([a.event,a.severity,a.expires,a.instruction,a.geometry])).digest('hex') }));
  return snapshot;
}
