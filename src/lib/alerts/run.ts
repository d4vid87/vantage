/**
 * ═══════════════════════════════════════════════════════════════
 *  VANTAGE — Evaluator core
 *
 *  Shared by the HTTP tick route and the in-process scheduler, so alerts fire
 *  on the same code path whether they are driven by a cron, a client, or the
 *  server's own timer.
 * ═══════════════════════════════════════════════════════════════
 */

import { evaluateRule, severityFor, type FeedSnapshot } from './evaluate';
import { claimNewKeys, listRules, markFired, recordAlert, recordDelivery } from './store';
import { dispatchAlert } from './dispatch';

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

  for (const rule of listRules()) {
    const matches = evaluateRule(rule, snapshot);
    if (matches.length === 0) continue;

    const freshKeys = new Set(claimNewKeys(rule.id, matches.map((m) => m.key)));
    const fresh = matches.filter((m) => freshKeys.has(m.key)).slice(0, MAX_ALERTS_PER_RULE);
    if (fresh.length === 0) continue;

    for (const match of fresh) {
      const alert = recordAlert({
        ruleId: rule.id,
        title: `${rule.name} — ${match.label}`,
        body: `Watch "${rule.name}" matched a new ${match.layer} entity: ${match.label}.`,
        severity: severityFor(match),
        lat: match.lat,
        lng: match.lng,
        payload: match.record,
      });

      const { results } = await dispatchAlert(alert, rule.channels, {
        webhookUrl: rule.webhookUrl,
      });
      recordDelivery(alert.id, results);
      fired.push({ ruleId: rule.id, alertId: alert.id, delivered: results });
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

/** Cap per layer so a huge feed cannot blow up memory or the match loop. */
const MAX_RECORDS_PER_LAYER = 500;

function selfOrigin(): string {
  return process.env.VANTAGE_SELF_ORIGIN || `http://127.0.0.1:${process.env.PORT || 3000}`;
}

/**
 * Fetch the alert-eligible layers from the app's own feed routes over
 * loopback. Each feed fails independently — one dead upstream must not stop
 * the rest of the evaluation.
 */
export async function collectSnapshot(): Promise<FeedSnapshot> {
  const origin = selfOrigin();
  const snapshot: FeedSnapshot = {};

  await Promise.all(
    ALERT_FEEDS.map(async ({ layer, path, pick }) => {
      try {
        const res = await fetch(`${origin}${path}`, {
          signal: AbortSignal.timeout(20_000),
          headers: { 'User-Agent': 'Vantage-Scheduler' },
        });
        if (!res.ok) return;
        const data = (await res.json()) as Record<string, unknown>;
        const records = pick(data).slice(0, MAX_RECORDS_PER_LAYER);
        if (records.length) snapshot[layer] = records as FeedSnapshot[string];
      } catch {
        /* feed unavailable this cycle — try again next tick */
      }
    })
  );

  return snapshot;
}
