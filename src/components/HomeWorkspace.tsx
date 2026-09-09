"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePanel } from "@/hooks/usePanel";
import { useDashboardFeed } from "@/hooks/useDashboardFeed";
import {
  asRecord,
  finite,
  type DashboardSettings,
  type Feed,
  type QuoteFeed,
  type GlobePreset,
  type Place,
} from "@/lib/dashboard/types";
import { MAP_FEEDS, type MapFeedStatus } from "@/lib/map-feeds";
import {
  searchReceived,
  incidentSnapshot,
  visitChanges,
  situationReport,
  type VisitSnapshot,
} from "@/lib/dashboard/workspace";
import { DEFAULT_NOTIFICATION_POLICY } from "@/lib/alerts/notification-policy";
import type { Alert } from "@/lib/alerts/types";
const VISIT = "vantage-visit-v1",
  OFFLINE = "vantage-offline-enabled";
const date = (value: unknown) =>
  typeof value === "string" || typeof value === "number"
    ? new Date(value).toLocaleString()
    : "Unknown";
const array = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];
function PlaceSummary({
  place,
  onOpen,
  enabled,
}: {
  place: Place;
  onOpen: () => void;
  enabled: boolean;
}) {
  const forecast = useDashboardFeed<Feed<Record<string, unknown>>>(
    enabled
      ? "/api/weather/details?action=forecast&place=" +
          encodeURIComponent(place.id)
      : null,
    1800000,
  );
  const alerts = useDashboardFeed<Feed<unknown[]>>(
    enabled
      ? "/api/weather/details?action=alerts&place=" +
          encodeURIComponent(place.id)
      : null,
  );
  const model = asRecord(forecast.data?.data?.modeled),
    current = asRecord(model.current),
    units = asRecord(model.current_units);
  return (
    <button className="home-card" onClick={onOpen}>
      <strong>{place.name}</strong>
      <span>
        {finite(current.temperature_2m)
          ? `${current.temperature_2m}${units.temperature_2m || "°"} · modeled conditions`
          : "Open conditions and forecast"}
      </span>
      <small>
        {alerts.data?.status === "ready"
          ? `${alerts.data.data?.length || 0} official alerts returned`
          : "Official coverage unknown or unavailable"}{" "}
        · {forecast.error || forecast.data?.status || "loading"}
      </small>
    </button>
  );
}
interface Props {
  data: Record<string, unknown>;
  feeds: MapFeedStatus[];
  active: Record<string, boolean>;
  camera: {
    lat: number;
    lng: number;
    zoom: number;
    mode?: string;
    projection?: string;
  };
  onOpen: () => void;
  onLocate: (point: { lat: number; lng: number }) => void;
  onPreset: (preset: GlobePreset) => void;
  onRecord: (hit: import("@/lib/dashboard/workspace").SearchHit) => void;
  tools: { label: string; run: () => void }[];
}
export default function HomeWorkspace({
  data,
  feeds,
  active,
  camera,
  onOpen,
  onLocate,
  onPreset,
  onRecord,
  tools,
}: Props) {
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(""),
    [notes, setNotes] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [offline, setOffline] = useState(false),
    [network, setNetwork] = useState(true),
    [baseline, setBaseline] = useState<VisitSnapshot | null>(null),
    [now, setNow] = useState(() => Date.now());
  const offlinePermitted = useRef(false);
  const panel = usePanel<HTMLElement>(open, () => setOpen(false));
  const settings = useDashboardFeed<DashboardSettings>(
    "/api/dashboard/settings",
    30000,
  );
  const alerts = useDashboardFeed<{ alerts: Alert[] }>("/api/alerts?limit=500");
  const quotes = useDashboardFeed<QuoteFeed[]>(
    settings.data?.symbols.length
      ? "/api/finance?home=" + settings.data.symbols.join(",")
      : null,
  );
  const status = useDashboardFeed<{ financeConfigured: boolean }>(
    "/api/dashboard/status",
    300000,
  );
  const [symbol, setSymbol] = useState("");
  const earnings = useDashboardFeed<Record<string, Feed<unknown>>>(
    open && symbol
      ? "/api/finance?action=company&symbol=" + encodeURIComponent(symbol)
      : null,
    86400000,
  );
  const [placeQuery, setPlaceQuery] = useState(""),
    [companyQuery, setCompanyQuery] = useState("");
  const companies = useDashboardFeed<Feed<unknown>>(
    open && companyQuery
      ? "/api/finance?action=search&q=" + encodeURIComponent(companyQuery)
      : null,
    86400000,
  );
  const locations = useDashboardFeed<Feed<unknown>>(
    open && placeQuery
      ? "/api/weather/details?action=search&q=" + encodeURIComponent(placeQuery)
      : null,
    86400000,
  );
  const current = useMemo<VisitSnapshot>(
    () => ({
      at: new Date(now).toISOString(),
      incidents: incidentSnapshot(data),
      alertIds: (alerts.data?.alerts || []).map((a) => a.id),
      quotes: Object.fromEntries(
        (quotes.data || [])
          .filter((q) => q.status === "ready" && q.data)
          .map((q) => [q.symbol, q.data!.price]),
      ),
      feeds: Object.fromEntries(
        feeds.map((f) => [
          f.key,
          f.error
            ? "unavailable"
            : !f.lastSuccess
              ? "awaiting"
              : now - f.lastSuccess > (f.interval || 60000)
                ? "overdue"
                : "received",
        ]),
      ),
    }),
    [alerts.data, quotes.data, feeds, now, data],
  );
  const latest = useRef(current);
  useEffect(() => {
    latest.current = current;
  }, [current]);
  useEffect(() => {
    const setup = setTimeout(() => {
      try {
        const saved = JSON.parse(localStorage.getItem(VISIT) || "null");
        if (
          saved &&
          typeof saved.at === "string" &&
          Array.isArray(saved.alertIds) &&
          saved.quotes &&
          saved.feeds
        )
          setBaseline(saved);
        offlinePermitted.current = localStorage.getItem(OFFLINE) === "1";
        setOffline(offlinePermitted.current);
      } catch {
        /* browser storage is optional */
      }
      setNetwork(navigator.onLine);
    }, 0);
    const save = () => {
      if (
        !latest.current.alertIds.length &&
        !Object.keys(latest.current.feeds).length
      )
        return;
      try {
        localStorage.setItem(VISIT, JSON.stringify(latest.current));
      } catch {
        /* storage may be disabled */
      }
    };
    const online = () => setNetwork(navigator.onLine);
    window.addEventListener("online", online);
    window.addEventListener("offline", online);
    window.addEventListener("pagehide", save);
    const timer = setInterval(() => {
      setNow(Date.now());
      save();
    }, 60000);
    return () => {
      clearTimeout(setup);
      clearInterval(timer);
      save();
      window.removeEventListener("online", online);
      window.removeEventListener("offline", online);
      window.removeEventListener("pagehide", save);
    };
  }, []);
  useEffect(() => {
    const close = () => setOpen(false);
    window.addEventListener("vantage-close-home", close);
    return () => window.removeEventListener("vantage-close-home", close);
  }, []);
  useEffect(() => {
    const show = () => {
      setOpen((v) => !v);
      onOpen();
      window.dispatchEvent(new Event("vantage-close-dashboard"));
      window.dispatchEvent(new Event("vantage-close-layers"));
    };
    window.addEventListener("vantage-open-home", show);
    return () => window.removeEventListener("vantage-open-home", show);
  }, [onOpen]);
  const changes = visitChanges(baseline, current);
  const hits = useMemo(() => searchReceived(data, query), [data, query]);
  const matches = (text: string) =>
    !!query.trim() && text.toLowerCase().includes(query.trim().toLowerCase());
  const selectPlace = (p: Place) => {
    setOpen(false);
    onLocate(p);
    window.dispatchEvent(
      new CustomEvent("vantage-open-weather", { detail: p.id }),
    );
  };
  const selectCompany = (s: string) => {
    setOpen(false);
    window.dispatchEvent(
      new CustomEvent("vantage-open-company", { detail: s }),
    );
  };
  const capture = useCallback(async () => {
    const image = await new Promise<string | undefined>((resolve) => {
      const id = crypto.randomUUID();
      const done = (event: Event) => {
        const detail = (event as CustomEvent).detail;
        if (detail.id !== id) return;
        clearTimeout(timer);
        window.removeEventListener("vantage-snapshot-ready", done);
        resolve(detail.image);
      };
      window.addEventListener("vantage-snapshot-ready", done);
      const timer = setTimeout(() => {
        window.removeEventListener("vantage-snapshot-ready", done);
        resolve(undefined);
      }, 4000);
      window.dispatchEvent(
        new CustomEvent("vantage-capture-snapshot", { detail: id }),
      );
    });
    return situationReport({
      at: new Date().toISOString(),
      image,
      notes,
      layers: Object.entries(active)
        .filter(([, v]) => v)
        .map(([k]) => k),
      camera,
      feeds: feeds.map((f) => ({
        ...f,
        source: new URL(
          MAP_FEEDS.find((m) => m.key === f.key)?.url || "/",
          location.origin,
        ).href,
        state: current.feeds[f.key],
      })),
      alerts: (alerts.data?.alerts || []).slice(0, 30),
      quotes: quotes.data || [],
      places: settings.data?.places || [],
    });
  }, [
    notes,
    active,
    camera,
    feeds,
    current.feeds,
    alerts.data,
    quotes.data,
    settings.data,
  ]);
  const captureRef = useRef(capture);
  useEffect(() => {
    captureRef.current = capture;
  }, [capture]);
  useEffect(() => {
    if (!offline) return;
    let cancelled = false,
      running = false;
    const save = async () => {
      if (running || document.hidden || !navigator.onLine) return;
      running = true;
      try {
        const access = await fetch("/api/dashboard/status", {
          cache: "no-store",
        });
        if (!access.ok) {
          await caches.delete("vantage-offline-v1");
          return;
        }
        await navigator.serviceWorker.register("/vantage-offline.js");
        await navigator.serviceWorker.ready;
        const html = await captureRef.current();
        if (!cancelled && offlinePermitted.current) {
          const cache = await caches.open("vantage-offline-v1");
          if (cancelled || !offlinePermitted.current) return;
          await cache.put(
            "/__vantage_offline_snapshot",
            new Response(html, {
              headers: { "Content-Type": "text/html; charset=utf-8" },
            }),
          );
          if (cancelled || !offlinePermitted.current)
            await cache.delete("/__vantage_offline_snapshot");
        }
      } catch {
        if (!cancelled)
          setMessage(
            "Offline snapshot could not be saved. Check browser storage availability.",
          );
      } finally {
        running = false;
      }
    };
    const initial = setTimeout(save, 6000),
      timer = setInterval(save, 60000);
    return () => {
      cancelled = true;
      clearTimeout(initial);
      clearInterval(timer);
    };
  }, [offline]);
  useEffect(() => {
    const message = (event: MessageEvent) => {
      if (event.data?.type !== "vantage-offline-clear") return;
      offlinePermitted.current = false;
      setOffline(false);
      try {
        localStorage.removeItem(OFFLINE);
      } catch {
        /* optional storage */
      }
    };
    navigator.serviceWorker?.addEventListener("message", message);
    return () =>
      navigator.serviceWorker?.removeEventListener("message", message);
  }, []);
  const setOfflineMode = async (value: boolean) => {
    try {
      localStorage.setItem(OFFLINE, value ? "1" : "0");
      offlinePermitted.current = value;
      setOffline(value);
      if (!value) {
        await caches.delete("vantage-offline-v1");
        setMessage("Saved offline snapshot deleted.");
      } else
        setMessage(
          "A dated, read-only snapshot will be saved on this browser every minute.",
        );
    } catch {
      setMessage("Browser storage is unavailable.");
    }
  };
  async function exportReport() {
    setBusy(true);
    try {
      const html = await capture();
      const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
      const link = document.createElement("a");
      link.href = url;
      link.download =
        "vantage-situation-" + new Date().toISOString().slice(0, 10) + ".html";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage("Snapshot exported. Open it offline or print to PDF.");
    } catch {
      setMessage("Could not export snapshot.");
    } finally {
      setBusy(false);
    }
  }
  async function savePolicy(form: HTMLFormElement) {
    if (!settings.data) return;
    const f = new FormData(form);
    setBusy(true);
    try {
      const response = await fetch("/api/dashboard/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...settings.data,
          notifications: {
            enabled: f.has("enabled"),
            start: f.get("start"),
            end: f.get("end"),
            timezone: f.get("timezone"),
            severeWeatherBypass: f.has("severe"),
            grouped: f.has("grouped"),
          },
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      settings.retry();
      setMessage("Notification preferences saved across devices.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }
  const policy = settings.data?.notifications || DEFAULT_NOTIFICATION_POLICY;
  return (
    <div className="home-workspace">
      {!network && (
        <span className="home-offline">Offline · retained data</span>
      )}
      {open && (
        <section
          ref={panel}
          role="dialog"
          aria-label="Home workspace"
          className="home-panel"
        >
          <header>
            <div>
              <h2>Your workspace</h2>
              <p>Changes, places, markets, and the tools you use.</p>
            </div>
            <button aria-label="Close home" onClick={() => setOpen(false)}>
              ×
            </button>
          </header>
          <label>
            Search everything
            <input
              data-panel-autofocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Aircraft, vessels, places, stocks, views, tools…"
            />
          </label>
          {query && (
            <section className="home-results" aria-label="Search results">
              {tools
                .filter((t) => matches(t.label))
                .map((t) => (
                  <button
                    key={t.label}
                    onClick={() => {
                      setOpen(false);
                      t.run();
                    }}
                  >
                    {t.label}
                    <small>Workspace tool</small>
                  </button>
                ))}
              {settings.data?.places
                .filter((p) => matches(p.name))
                .map((p) => (
                  <button key={p.id} onClick={() => selectPlace(p)}>
                    {p.name}
                    <small>Saved place</small>
                  </button>
                ))}
              {settings.data?.symbols.filter(matches).map((s) => (
                <button key={s} onClick={() => selectCompany(s)}>
                  {s}
                  <small>Followed stock</small>
                </button>
              ))}
              {settings.data?.presets
                .filter((p) => matches(p.name))
                .map((p) => (
                  <button
                    key={p.name}
                    onClick={() => {
                      setOpen(false);
                      onPreset(p);
                      window.dispatchEvent(
                        new CustomEvent("vantage-apply-globe-preset", {
                          detail: p,
                        }),
                      );
                    }}
                  >
                    {p.name}
                    <small>Saved view</small>
                  </button>
                ))}
              {hits.map((h) => (
                <button
                  key={h.id}
                  disabled={h.lat == null || h.lng == null}
                  onClick={() => {
                    onRecord(h);
                    setOpen(false);
                  }}
                >
                  {h.label}
                  <small>
                    {h.category.replaceAll("_", " ")} ·{" "}
                    {h.lat == null
                      ? "No location supplied"
                      : "Locate received record"}
                  </small>
                </button>
              ))}
              <button onClick={() => setCompanyQuery(query)}>
                Search companies for “{query}”
              </button>
              {companies.error && <p role="alert">{companies.error}</p>}
              {companyQuery && companies.data?.status !== "ready" && (
                <p>{companies.data?.error || "Loading company search…"}</p>
              )}
              {array(asRecord(companies.data?.data).result)
                .map(asRecord)
                .map((c) => (
                  <button
                    key={String(c.symbol)}
                    onClick={() => selectCompany(String(c.symbol))}
                  >
                    {String(c.description)} · {String(c.symbol)}
                    <small>Finnhub company result</small>
                  </button>
                ))}
              {locations.error && <p role="alert">{locations.error}</p>}
              <button onClick={() => setPlaceQuery(query)}>
                Search worldwide places for “{query}”
              </button>
              {array(asRecord(locations.data?.data).results).map((raw) => {
                const p = asRecord(raw);
                return (
                  <button
                    key={String(p.id)}
                    onClick={() => {
                      if (finite(p.latitude) && finite(p.longitude))
                        onLocate({ lat: p.latitude, lng: p.longitude });
                      setOpen(false);
                    }}
                  >
                    {String(p.name)} · {String(p.country || "")}
                    <small>Open-Meteo / GeoNames</small>
                  </button>
                );
              })}
              <p>
                Search covers received records, including inactive layers
                already loaded. Up to 30 map results. No matches do not
                establish absence.
              </p>
            </section>
          )}
          {(settings.error || alerts.error || quotes.error) && (
            <p role="alert">
              Connection issue:{" "}
              {[settings.error, alerts.error, quotes.error]
                .filter(Boolean)
                .join(" · ")}
              . Retained data may be stale.
            </p>
          )}
          {message && <p role="status">{message}</p>}
          <h3>Since your last visit</h3>
          <p>
            {baseline
              ? "Compared with " + date(baseline.at)
              : "First visit on this browser. A baseline is saved as data arrives."}
          </p>
          {changes.length ? (
            <ul>
              {changes.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : (
            <p>
              No changes detected in received incidents, alerts, feed states, or
              stock moves of at least 1%. Missing feeds are not a no-change
              guarantee.
            </p>
          )}
          <button
            onClick={() => {
              setBaseline(current);
              try {
                localStorage.setItem(VISIT, JSON.stringify(current));
                setMessage("Current snapshot marked reviewed.");
              } catch {
                setMessage("Review saved for this session only.");
              }
            }}
          >
            Mark reviewed
          </button>
          {baseline?.incidents &&
            Object.entries(current.incidents || {})
              .filter(
                ([id, r]) =>
                  baseline.incidents?.[id]?.fingerprint !== r.fingerprint,
              )
              .slice(0, 10)
              .map(([id, r]) => (
                <article className="home-card" key={id}>
                  <strong>{r.label}</strong>
                  <small>
                    {baseline.incidents?.[id]
                      ? "Updated incident"
                      : "New received incident"}
                  </small>
                  {r.lat != null && r.lng != null && (
                    <button
                      onClick={() =>
                        onRecord({
                          id,
                          label: r.label,
                          category: id.split(":")[0],
                          lat: r.lat,
                          lng: r.lng,
                        })
                      }
                    >
                      Locate incident
                    </button>
                  )}
                  {r.source && (
                    <a
                      href={r.source}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Original source
                    </a>
                  )}
                </article>
              ))}
          <h3>
            Unread alerts ·{" "}
            {
              (alerts.data?.alerts || []).filter((a) => !a.acknowledgedAt)
                .length
            }
          </h3>
          {(alerts.data?.alerts || [])
            .filter((a) => !a.acknowledgedAt)
            .slice(0, 8)
            .map((a) => (
              <article key={a.id} className="home-card">
                <strong>{a.title}</strong>
                <small>
                  {a.severity} · {date(a.createdAt)}
                </small>
                <p>{a.body.slice(0, 220)}</p>
                {typeof asRecord(a.payload).url === "string" &&
                  /^https?:\/\//.test(String(asRecord(a.payload).url)) && (
                    <a
                      href={String(asRecord(a.payload).url)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Original source
                    </a>
                  )}
                {a.lat != null && a.lng != null && (
                  <button
                    onClick={() => onLocate({ lat: a.lat!, lng: a.lng! })}
                  >
                    Locate
                  </button>
                )}
                <button
                  onClick={async () => {
                    try {
                      const r = await fetch("/api/alerts", {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ id: a.id, acknowledged: true }),
                      });
                      if (r.ok) alerts.retry();
                      else setMessage("Acknowledgement failed; retry.");
                    } catch {
                      setMessage("Acknowledgement failed; retry.");
                    }
                  }}
                >
                  Acknowledge
                </button>
              </article>
            ))}
          <h3>Saved places</h3>
          <div className="home-grid">
            {settings.data?.places.map((p) => (
              <PlaceSummary
                key={p.id}
                place={p}
                enabled={open}
                onOpen={() => selectPlace(p)}
              />
            ))}
          </div>
          {!settings.data?.places.length && (
            <button
              onClick={() => {
                setOpen(false);
                window.dispatchEvent(new Event("vantage-open-setup"));
              }}
            >
              Add your places and watchlist
            </button>
          )}
          <h3>Your markets</h3>
          {status.data?.financeConfigured === false && (
            <p>
              Stock data is unconfigured. Add FINNHUB_API_KEY to the server’s
              .env and restart Vantage. The key stays on the server. No quotes
              or financials are fabricated.
            </p>
          )}
          <div className="home-grid">
            {settings.data?.symbols.map((s) => {
              const q = quotes.data?.find((q) => q.symbol === s);
              return (
                <button
                  className="home-card"
                  key={s}
                  onClick={() => selectCompany(s)}
                >
                  <strong>
                    {s} ·{" "}
                    {q?.data ? "$" + q.data.price.toFixed(2) : "Unavailable"}
                  </strong>
                  <small>
                    {q?.status || "loading"} · {date(q?.sourceTime)}
                  </small>
                </button>
              );
            })}
          </div>
          <label>
            Upcoming earnings
            <select value={symbol} onChange={(e) => setSymbol(e.target.value)}>
              <option value="">Choose a followed symbol</option>
              {settings.data?.symbols.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          {symbol && (
            <p>
              {array(asRecord(earnings.data?.earnings?.data).earningsCalendar)
                .map(asRecord)
                .map((e) => String(e.date))
                .join(", ") ||
                "No earnings date supplied; ETF or provider coverage may be unavailable."}
            </p>
          )}
          <details>
            <summary>Coverage & freshness</summary>
            <p>
              “Received” describes the last successful fetch, not geographic
              completeness. NWS is US coverage; NHC covers its published basins.
              Radar has gaps; sampled model grids are not observations.
            </p>
            {feeds.map((f) => (
              <div className="home-feed" key={f.key}>
                <strong>{f.key.replaceAll("_", " ")}</strong>
                <span>
                  {current.feeds[f.key]} · {date(f.lastSuccess)}
                </span>
                {f.error && <small>{f.error}</small>}
                <a
                  href={MAP_FEEDS.find((m) => m.key === f.key)?.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Source data
                </a>
              </div>
            ))}
          </details>
          <details>
            <summary>Notification controls</summary>
            <form
              key={settings.data?.revision}
              onSubmit={(e) => {
                e.preventDefault();
                void savePolicy(e.currentTarget);
              }}
            >
              <label>
                <input
                  name="enabled"
                  type="checkbox"
                  defaultChecked={policy.enabled}
                />
                Enable quiet hours
              </label>
              <div className="home-grid">
                <label>
                  From
                  <input
                    name="start"
                    type="time"
                    required
                    defaultValue={policy.start}
                  />
                </label>
                <label>
                  Until
                  <input
                    name="end"
                    type="time"
                    required
                    defaultValue={policy.end}
                  />
                </label>
              </div>
              <label>
                Timezone
                <input
                  name="timezone"
                  required
                  defaultValue={policy.timezone}
                />
              </label>
              <label>
                <input
                  name="severe"
                  type="checkbox"
                  defaultChecked={policy.severeWeatherBypass}
                />
                Allow high/critical weather alerts during quiet hours
              </label>
              <label>
                <input
                  name="grouped"
                  type="checkbox"
                  defaultChecked={policy.grouped}
                />
                Group each rule’s matches per evaluation; group browser alerts
                per poll
              </label>
              <p>
                Muted delivery stays in the inbox and is not replayed later.
                Explicit channel tests bypass quiet hours.
              </p>
              <button disabled={busy}>Save notification preferences</button>
            </form>
          </details>
          <details>
            <summary>Situation snapshot & offline access</summary>
            <label>
              Report notes
              <textarea
                rows={3}
                maxLength={10000}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>
            <button disabled={busy} onClick={() => void exportReport()}>
              Export map & situation report
            </button>
            <label>
              <input
                type="checkbox"
                checked={offline}
                onChange={(e) => void setOfflineMode(e.target.checked)}
              />
              Save a read-only offline snapshot on this browser
            </label>
            <p>
              The snapshot includes the map, up to 30 recent alerts, stock
              quotes, places, and source receipts. It is stored locally, may
              contain personal information, and is clearly dated. Disabling
              deletes it; signing out clears it. On connection loss an already
              open dashboard keeps its data; reloading opens the snapshot. Use
              the exported HTML file for portable offline access.
            </p>
          </details>
        </section>
      )}
    </div>
  );
}
