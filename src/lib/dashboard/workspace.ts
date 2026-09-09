import { asRecord, finite } from "./types";
export type SearchHit = {
  id: string;
  label: string;
  category: string;
  lat?: number;
  lng?: number;
  source?: string;
};
/** Search only received records. Hidden/unconfigured feeds are never invented. */
export function searchReceived(
  data: Record<string, unknown>,
  query: string,
  limit = 30,
): SearchHit[] {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  const hits: SearchHit[] = [];
  const seen = new Set<string>();
  for (const [category, records] of Object.entries(data)) {
    if (!Array.isArray(records) || category === "sdk_entities") continue;
    for (const raw of records) {
      const row = asRecord(raw),
        props = asRecord(row.properties),
        r = { ...row, ...props };
      const label = String(
        r.callsign ||
          r.name ||
          r.title ||
          r.place ||
          r.location ||
          r.label ||
          r.symbol ||
          r.mmsi ||
          r.icao24 ||
          r.id ||
          "",
      ).trim();
      const identity = String(r.icao24 || r.mmsi || r.id || label);
      if (
        !label ||
        !tokens.every((t) =>
          `${category} ${label} ${identity}`.toLowerCase().includes(t),
        )
      )
        continue;
      const coordinates = asRecord(row.geometry).coordinates;
      const lat =
        r.lat ??
        r.latitude ??
        (Array.isArray(coordinates) ? coordinates[1] : undefined);
      const lng =
        r.lng ??
        r.lon ??
        r.longitude ??
        (Array.isArray(coordinates) ? coordinates[0] : undefined);
      const id = category + ":" + identity;
      if (seen.has(id)) continue;
      seen.add(id);
      hits.push({
        id,
        label,
        category,
        ...(finite(lat) &&
        finite(lng) &&
        Math.abs(lat) <= 90 &&
        Math.abs(lng) <= 180
          ? { lat, lng }
          : {}),
        ...(typeof r.url === "string" && /^https?:\/\//.test(r.url)
          ? { source: r.url }
          : {}),
      });
      if (hits.length >= limit) return hits;
    }
  }
  return hits;
}
export interface VisitSnapshot {
  at: string;
  alertIds: string[];
  quotes: Record<string, number>;
  feeds: Record<string, string>;
  incidents?: Record<
    string,
    {
      label: string;
      fingerprint: string;
      lat?: number;
      lng?: number;
      source?: string;
    }
  >;
}
/** ponytail: compare up to 3,000 received incident records; server history needed for exhaustive replay. */
export function incidentSnapshot(data: Record<string, unknown>) {
  const records: NonNullable<VisitSnapshot["incidents"]> = {};
  let count = 0;
  for (const key of [
    "earthquakes",
    "gdelt",
    "gdelt_events",
    "weather_events",
    "fires",
    "volcanoes",
    "power_outages",
  ]) {
    const rows = data[key];
    if (!Array.isArray(rows)) continue;
    for (const raw of rows.slice(0, 3000 - count)) {
      const r = asRecord(raw),
        label = String(
          r.title || r.name || r.location || r.place || r.event || r.id || "",
        );
      const id = r.id || r.url;
      if (!id) continue;
      count++;
      records[key + ":" + String(id)] = {
        label,
        ...(finite(r.lat ?? r.latitude) && finite(r.lng ?? r.longitude)
          ? {
              lat: (r.lat ?? r.latitude) as number,
              lng: (r.lng ?? r.longitude) as number,
            }
          : {}),
        ...(typeof r.url === "string" && /^https?:\/\//.test(r.url)
          ? { source: r.url }
          : {}),
        fingerprint: JSON.stringify([
          r.title,
          r.name,
          r.magnitude,
          r.severity,
          r.status,
          r.alert,
          r.event,
          r.updated,
          r.updatedAt,
        ]),
      };
    }
  }
  return records;
}
export function visitChanges(
  previous: VisitSnapshot | null,
  current: VisitSnapshot,
) {
  if (!previous) return [];
  const lines: string[] = [];
  const count = current.alertIds.filter(
    (id) => !previous.alertIds.includes(id),
  ).length;
  if (count) lines.push(`${count} new stored alerts (within the latest 500).`);
  for (const [symbol, price] of Object.entries(current.quotes))
    if (previous.quotes[symbol] > 0) {
      const change = (price / previous.quotes[symbol] - 1) * 100;
      if (Math.abs(change) >= 1)
        lines.push(
          `${symbol}: ${change >= 0 ? "+" : ""}${change.toFixed(2)}% since your previous snapshot.`,
        );
    }
  for (const [key, state] of Object.entries(current.feeds))
    if (previous.feeds[key] && previous.feeds[key] !== state)
      lines.push(`${key}: ${previous.feeds[key]} → ${state}.`);
  if (previous.incidents) {
    const entries = Object.entries(current.incidents || {});
    const added = entries.filter(([id]) => !previous.incidents![id]).length;
    const changed = entries.filter(
      ([id, r]) =>
        previous.incidents![id] &&
        previous.incidents![id].fingerprint !== r.fingerprint,
    );
    if (added) lines.push(`${added} new received incidents.`);
    for (const [, r] of changed.slice(0, 20))
      lines.push(`Updated incident: ${r.label}.`);
    if (changed.length > 20)
      lines.push(`${changed.length - 20} more incidents changed.`);
  }
  return lines;
}
const escape = (s: unknown) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function situationReport(input: {
  at: string;
  image?: string;
  notes: string;
  layers: string[];
  camera: unknown;
  feeds: unknown;
  alerts: unknown;
  quotes: unknown;
  places: unknown;
}) {
  const image = input.image?.startsWith("data:image/png;base64,")
    ? `<img alt="Captured map" src="${escape(input.image)}">`
    : "";
  const sources = (Array.isArray(input.feeds) ? input.feeds : [])
    .map(asRecord)
    .filter(
      (f) => typeof f.source === "string" && /^https?:\/\//.test(f.source),
    );
  const links = sources
    .map(
      (f) =>
        `<li><a href="${escape(f.source)}">${escape(f.key)} source data</a></li>`,
    )
    .join("");
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Vantage situation snapshot</title><style>body{font:16px system-ui;max-width:1100px;margin:32px auto;padding:20px;background:#101824;color:#e5ecf6}img{max-width:100%;border-radius:12px}pre{white-space:pre-wrap;overflow-wrap:anywhere;padding:16px;background:#1a293c}h2{margin-top:32px}a{color:#acd6ff}@media print{body{background:white;color:black}pre{background:#eee}}</style><h1>Vantage situation snapshot</h1><p>Captured ${escape(input.at)} · Static snapshot, not live data. Coverage may be incomplete.</p>${image || "<p>Map image unavailable at capture time.</p>"}<h2>Sources</h2><ul>${links}</ul><h2>Notes</h2><p>${escape(input.notes).replace(/\n/g, "<br>")}</p>${Object.entries(
    {
      Layers: input.layers,
      Camera: input.camera,
      "Feed receipts and sources": input.feeds,
      Alerts: input.alerts,
      Quotes: input.quotes,
      Places: input.places,
    },
  )
    .map(
      ([key, value]) =>
        `<h2>${key}</h2><pre>${escape(JSON.stringify(value, null, 2))}</pre>`,
    )
    .join(
      "",
    )}<p>Open this file without a network connection, or use your browser’s Print → Save as PDF.</p></html>`;
}
