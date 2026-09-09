/** Shared alert / watchlist shapes. */

export type WatchKind = 'aoi' | 'entity' | 'threshold' | 'market' | 'weather';

export interface MarketSpec { symbol: string; field: 'price' | 'changePercent'; comparator: 'above' | 'below'; threshold: number }
export interface WeatherSpec { place?: import('../dashboard/types').Place; ring?: number[][]; events: string[] }

export type Channel = 'discord' | 'ntfy' | 'email' | 'webhook';

export const ALL_CHANNELS: Channel[] = ['discord', 'ntfy', 'email', 'webhook'];

/** Geofence: fire when a new entity of `layers` appears inside `ring`. */
export interface AoiSpec {
  ring: number[][];              // [[lng, lat], ...]
  layers: string[];              // e.g. ['flights', 'earthquakes']
}

/** Entity watch: fire when a named entity changes / appears. */
export interface EntitySpec {
  entityType: 'flight' | 'vessel' | 'wallet' | 'channel' | 'sanctions';
  identifier: string;            // ICAO24 / MMSI / address / @channel / name
}

/** Threshold: fire when a numeric field on a layer crosses `min`. */
export interface ThresholdSpec {
  layer: string;                 // e.g. 'earthquakes'
  field: string;                 // e.g. 'magnitude'
  min: number;
  bbox?: { west: number; south: number; east: number; north: number };
}

export type WatchSpec = AoiSpec | EntitySpec | ThresholdSpec | MarketSpec | WeatherSpec;

export interface WatchRule {
  id: string;
  name: string;
  kind: WatchKind;
  spec: WatchSpec;
  channels: Channel[];
  /** Per-rule override for the generic webhook channel. */
  webhookUrl?: string;
  enabled: boolean;
  createdAt: string;
  lastFiredAt: string | null;
  snoozedUntil?: string | null;
}

export interface Alert {
  id: string;
  ruleId: string | null;
  title: string;
  body: string;
  severity: 'CRITICAL' | 'HIGH' | 'ELEVATED' | 'INFO';
  lat: number | null;
  lng: number | null;
  payload: unknown;
  createdAt: string;
  delivered: Record<string, string> | null;
  acknowledgedAt?: string | null;
}
