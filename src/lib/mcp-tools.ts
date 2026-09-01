/**
 * VANTAGE — MCP tool surface.
 *
 * Every tool is a thin wrapper over something the app already does, so an agent
 * queries the same code paths the HUD does. Read tools are unrestricted; the one
 * tool that writes is annotated as such and validates its input through the same
 * SSRF guard as the HTTP route, because an agent-supplied webhook URL is exactly
 * the untrusted input that guard exists for.
 */

import { listAlerts, listRules, createRule } from './alerts/store';
import { listInvestigations } from './investigations';
import { listBriefs } from './brief';
import { validateHost } from './ssrf-guard';
import { ALLOWED_LAYERS } from './ai/actions';
import type { Channel, WatchKind } from './alerts/types';

export function selfOrigin(): string {
  return process.env.VANTAGE_SELF_ORIGIN || `http://127.0.0.1:${process.env.PORT || 3000}`;
}

/** Layer key → the route that serves it. */
export const LAYER_ROUTES: Record<string, string> = {
  earthquakes: '/api/earthquakes',
  flights: '/api/flights',
  fires: '/api/fires',
  weather: '/api/weather',
  maritime: '/api/maritime',
  satellites: '/api/satellites',
  cctv: '/api/cctv',
  infrastructure: '/api/infrastructure',
  radiation: '/api/radiation',
  balloons: '/api/balloons',
  air_quality: '/api/air-quality',
  disease: '/api/disease',
  volcanoes: '/api/volcanoes',
  power_outages: '/api/power-outages',
  travel_advisories: '/api/travel-advisories',
  gps_jamming: '/api/gps-jamming',
  acled: '/api/acled',
  ransomware: '/api/ransomware',
  tor_exits: '/api/tor-exits',
  frontlines: '/api/frontlines',
  internet_outages: '/api/radar',
  cyber_threats: '/api/cyber-threats',
  malware: '/api/malware',
  gdelt_events: '/api/gdelt-events',
  country_risk: '/api/country-risk',
  news: '/api/news',
};

export function listLayers(): { layer: string; route: string; copilot: boolean }[] {
  return Object.entries(LAYER_ROUTES).map(([layer, route]) => ({
    layer,
    route,
    copilot: (ALLOWED_LAYERS as readonly string[]).includes(layer),
  }));
}

async function local<T>(path: string): Promise<T> {
  const res = await fetch(`${selfOrigin()}${path}`, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`${path} returned ${res.status}`);
  return (await res.json()) as T;
}

/** Cap what a tool returns; an agent context is not a bulk export channel. */
export const MAX_RECORDS = 50;

export async function getLayerData(layer: string, limit = MAX_RECORDS): Promise<unknown> {
  const route = LAYER_ROUTES[layer];
  if (!route) {
    throw new Error(`Unknown layer "${layer}". Known layers: ${Object.keys(LAYER_ROUTES).join(', ')}`);
  }
  const data = await local<Record<string, unknown>>(route);
  const capped: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    capped[k] = Array.isArray(v) ? v.slice(0, Math.min(limit, MAX_RECORDS)) : v;
  }
  return capped;
}

export async function searchNews(query: string, limit = 20): Promise<unknown[]> {
  const data = await local<{ news?: Record<string, unknown>[] }>('/api/news');
  const q = query.trim().toLowerCase();
  const items = data.news ?? [];
  const matched = q
    ? items.filter((n) => `${n.title ?? ''} ${n.description ?? ''}`.toLowerCase().includes(q))
    : items;
  return matched.slice(0, Math.min(limit, MAX_RECORDS));
}

export async function getCountryRisk(code?: string): Promise<unknown> {
  const data = await local<{ countries?: { code: string }[] }>('/api/country-risk');
  const countries = data.countries ?? [];
  if (!code) return countries.slice(0, MAX_RECORDS);
  const hit = countries.find((c) => c.code.toUpperCase() === code.toUpperCase());
  return hit ?? { error: `No risk entry for "${code}"` };
}

export interface CreateRuleInput {
  name: string;
  kind: WatchKind;
  spec: Record<string, unknown>;
  channels: Channel[];
  webhookUrl?: string;
}

/**
 * The only writing tool. The webhook target is validated before the rule is
 * stored, so an agent cannot persist a rule that makes the server call an
 * internal address.
 */
export async function createWatchRule(input: CreateRuleInput): Promise<unknown> {
  if (input.webhookUrl) {
    let parsed: URL;
    try {
      parsed = new URL(input.webhookUrl);
    } catch {
      throw new Error('webhookUrl is not a valid URL');
    }
    const guard = await validateHost(parsed.hostname);
    if (!guard.ok) throw new Error(`webhookUrl rejected: ${guard.reason}`);
  }

  return createRule({
    name: input.name,
    kind: input.kind,
    spec: input.spec as never,
    channels: input.channels,
    webhookUrl: input.webhookUrl,
  });
}

export const readTools = { listAlerts, listRules, listInvestigations, listBriefs };
