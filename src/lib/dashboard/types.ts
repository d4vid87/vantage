import {validateNotificationPolicy, DEFAULT_NOTIFICATION_POLICY, type NotificationPolicy} from '../alerts/notification-policy';
export type LayerStyle = {
  opacity: number;
  labels: "off" | "key" | "all";
  order: number;
};
export type Place = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  timezone: string;
};
export type Facility = Place & {
  symbol: string;
  source: string;
  verifiedAt: string;
  kind: "exchange" | "facility";
};
export type GlobePreset = {
  name: string;
  layers: string[];
  styles: Record<string, LayerStyle>;
  projection: "globe" | "mercator";
  lat: number;
  lng: number;
  zoom: number;
};
export interface DashboardSettings {
  version: 1;
  revision: number;
  notifications?: NotificationPolicy;
  symbols: string[];
  places: Place[];
  units: "us" | "metric";
  styles: Record<string, LayerStyle>;
  presets: GlobePreset[];
  facilities: Facility[];
}
export interface Feed<T> {
  data: T | null;
  provider: string;
  sourceTime: string | null;
  receivedAt: string | null;
  status: "ready" | "stale" | "unavailable" | "unconfigured";
  error?: string;
}
export interface PersonalQuote {
  symbol: string;
  price: number;
  changePercent: number;
  sourceTime: string;
  marketOpen: boolean;
  delay: "unknown";
  currency: "USD";
}
export type QuoteFeed = Feed<PersonalQuote> & { symbol: string };
export type JsonRecord = Record<string, unknown>;
export const asRecord = (v: unknown): JsonRecord =>
  v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as JsonRecord)
    : {};
export const finite = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
export const symbolOf = (v: unknown): string => {
  if (
    typeof v !== "string" ||
    !/^[A-Z][A-Z0-9.-]{0,11}$/.test(v.trim().toUpperCase())
  )
    throw new Error("Enter a US stock or ETF symbol.");
  return v.trim().toUpperCase();
};
export function validatePlace(v: unknown): Place {
  const p = asRecord(v);
  if (
    typeof p.id !== "string" ||
    !p.id ||
    p.id.length > 100 ||
    typeof p.name !== "string" ||
    !p.name.trim() ||
    p.name.length > 120 ||
    !finite(p.lat) ||
    Math.abs(p.lat) > 90 ||
    !finite(p.lng) ||
    Math.abs(p.lng) > 180 ||
    typeof p.timezone !== "string"
  )
    throw new Error("Invalid saved place.");
  new Intl.DateTimeFormat("en", {
    timeZone: p.timezone,
  }).format();
  return {
    id: p.id,
    name: p.name.trim(),
    lat: p.lat,
    lng: p.lng,
    timezone: p.timezone,
  };
}
export function validateStyles(v: unknown): Record<string, LayerStyle> {
  const r = asRecord(v),
    out: Record<string, LayerStyle> = {};
  if (Object.keys(r).length > 150) throw new Error("Too many styles.");
  for (const [k, raw] of Object.entries(r)) {
    const s = asRecord(raw);
    if (
      !/^[a-z][a-z0-9_-]{0,60}$/.test(k) ||
      !finite(s.opacity) ||
      s.opacity < 0 ||
      s.opacity > 1 ||
      !["off", "key", "all"].includes(String(s.labels)) ||
      !finite(s.order) ||
      s.order < 0 ||
      s.order > 150
    )
      throw new Error("Invalid layer style.");
    out[k] = {
      opacity: s.opacity,
      labels: s.labels as LayerStyle["labels"],
      order: s.order,
    };
  }
  return out;
}
export function validateSettings(v: unknown): DashboardSettings {
  const s = asRecord(v);
  if (
    s.version !== 1 ||
    !Number.isSafeInteger(s.revision) ||
    Number(s.revision) < 0 ||
    !Array.isArray(s.symbols) ||
    s.symbols.length > 20 ||
    !Array.isArray(s.places) ||
    s.places.length > 10 ||
    !["us", "metric"].includes(String(s.units)) ||
    !Array.isArray(s.presets) ||
    s.presets.length > 24 ||
    !Array.isArray(s.facilities) ||
    s.facilities.length > 100
  )
    throw new Error(
      "Invalid settings (20 symbols, 10 places, 24 presets, 100 facilities maximum).",
    );
  const places = s.places.map(validatePlace);
  if (new Set(places.map((p) => p.id)).size !== places.length)
    throw new Error("Duplicate place IDs.");
  return {
    version: 1,
    revision: Number(s.revision),
    notifications: validateNotificationPolicy(s.notifications),
    symbols: [...new Set(s.symbols.map(symbolOf))],
    places,
    units: s.units as "us" | "metric",
    styles: validateStyles(s.styles),
    presets: s.presets.map((raw) => {
      const p = asRecord(raw);
      const place = validatePlace({
        ...p,
        id: "preset",
        timezone: "UTC",
      });
      if (
        !Array.isArray(p.layers) ||
        p.layers.length > 150 ||
        !p.layers.every(
          (x) => typeof x === "string" && /^[a-z][a-z0-9_-]{0,60}$/.test(x),
        ) ||
        !["globe", "mercator"].includes(String(p.projection)) ||
        !finite(p.zoom) ||
        p.zoom < 0 ||
        p.zoom > 24
      )
        throw new Error("Invalid globe preset.");
      return {
        name: place.name,
        lat: place.lat,
        lng: place.lng,
        zoom: p.zoom,
        layers: p.layers,
        styles: validateStyles(p.styles),
        projection: p.projection as GlobePreset["projection"],
      };
    }),
    facilities: s.facilities.map((raw) => {
      const p = asRecord(raw),
        place = validatePlace(raw);
      const url = new URL(String(p.source));
      if (
        !["https:", "http:"].includes(url.protocol) ||
        url.username ||
        url.password ||
        !["exchange", "facility"].includes(String(p.kind)) ||
        typeof p.verifiedAt !== "string" ||
        !Number.isFinite(Date.parse(p.verifiedAt))
      )
        throw new Error(
          "Facilities require source, type, and verification date.",
        );
      return {
        ...place,
        symbol: p.symbol ? symbolOf(p.symbol) : "",
        source: url.href,
        verifiedAt: p.verifiedAt,
        kind: p.kind as Facility["kind"],
      };
    }),
  };
}
export const DEFAULT_SETTINGS: DashboardSettings = {
  version: 1,
  revision: 0,
  notifications: {...DEFAULT_NOTIFICATION_POLICY},
  symbols: [],
  places: [],
  units: "us",
  styles: {},
  presets: [],
  facilities: [
    {
      id: "nyse",
      name: "NYSE · 11 Wall Street (approximate pin)",
      lat: 40.7069,
      lng: -74.0113,
      timezone: "America/New_York",
      symbol: "ICE",
      kind: "exchange",
      source: "https://www.nyse.com/nyse-events",
      verifiedAt: "2026-09-08T00:00:00Z",
    },
    {
      id: "cme",
      name: "CME · 20 S Wacker (approximate pin)",
      lat: 41.8819,
      lng: -87.6373,
      timezone: "America/Chicago",
      symbol: "CME",
      kind: "exchange",
      source: "https://www.cmegroup.com/company/history/global-offices.html",
      verifiedAt: "2026-09-08T00:00:00Z",
    },
  ],
};
export function freshTime(
  value: unknown,
  maxAge: number,
  now = Date.now(),
): boolean {
  const t = typeof value === "string" ? Date.parse(value) : NaN;
  return Number.isFinite(t) && t <= now + 60000 && t >= now - maxAge;
}
