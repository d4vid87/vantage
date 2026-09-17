"use client";

import { useEffect, useMemo, useState } from "react";
import { usePanel } from "@/hooks/usePanel";
import { useDashboardFeed } from "@/hooks/useDashboardFeed";
import MarketChart from "./MarketChart";
import {
  asRecord,
  finite,
  type DashboardSettings,
  type Feed,
  type QuoteFeed,
  type JsonRecord,
  type GlobePreset,
  type LayerStyle,
} from "@/lib/dashboard/types";
import {
  EXTRA_LAYERS,
  PRESETS,
  SOURCE_GROUPS,
  type GlobeEnhancements,
} from "@/lib/dashboard/globe";
import type { WeatherAlert } from "@/lib/dashboard/weather";
import type { WatchRule } from "@/lib/alerts/types";
import { inGeometry } from "@/lib/dashboard/geometry";
const array = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const number = (v: unknown) =>
  finite(v)
    ? v.toLocaleString(undefined, {
        maximumFractionDigits: 2,
      })
    : "Unavailable";
const time = (v: unknown) =>
  typeof v === "string" && Number.isFinite(Date.parse(v))
    ? new Date(v).toLocaleString()
    : "Unavailable";
const safeLink = (v: unknown) =>
  typeof v === "string" && /^https?:\/\//.test(v) ? v : undefined;
const collection = (
  features: GeoJSON.Feature[],
): GeoJSON.FeatureCollection => ({
  type: "FeatureCollection",
  features,
});
interface Props {
  onPanelOpen: () => void;
  onOverview: () => void;
  lowPower?: boolean;
  active: Record<string, boolean>;
  camera: {
    lat: number;
    lng: number;
    zoom: number;
  };
  projection: "globe" | "mercator";
  areas: Array<{
    id: string;
    name: string;
    geojson: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.LineString>;
  }>;
  onGlobe: (s: GlobeEnhancements) => void;
  onPreset: (v: GlobePreset) => void;
  onLocate: (p: { lat: number; lng: number }) => void;
}
function FeedStatus({ feed }: { feed: Feed<unknown> | null }) {
  return (
    <p className="enh-muted">
      {feed
        ? `${feed.provider} · ${feed.status} · received ${time(feed.receivedAt)}${feed.error ? " · " + feed.error : ""}`
        : "Loading…"}
    </p>
  );
}
export default function DashboardEnhancements({
  onPanelOpen,
  onOverview,
  lowPower = false,
  active,
  camera,
  projection,
  areas,
  onGlobe,
  onPreset,
  onLocate,
}: Props) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(timer);
  }, []);
  const settingsFeed = useDashboardFeed<DashboardSettings>(
    "/api/dashboard/settings",
    30000,
  );
  const settings = settingsFeed.data;
  const [panel, setPanel] = useState<
      "finance" | "weather" | "globe" | "setup" | null
    >(null),
    [selected, setSelected] = useState(""),
    [placeId, setPlaceId] = useState(""),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false),
    [notice, setNotice] = useState("");
  useEffect(() => {
    if (panel) { onPanelOpen(); window.dispatchEvent(new Event("vantage-close-home")); }
  }, [panel, onPanelOpen]);
  useEffect(() => {
    const close = () => setPanel(null);
    window.addEventListener("vantage-close-dashboard", close);
    return () => window.removeEventListener("vantage-close-dashboard", close);
  }, []);
  useEffect(() => {
    const weather = (event: Event) => { setPlaceId(String((event as CustomEvent).detail)); setPanel("weather"); };
    const setup = () => setPanel("setup");
    window.addEventListener("vantage-open-weather", weather);
    window.addEventListener("vantage-open-setup", setup);
    return () => { window.removeEventListener("vantage-open-weather", weather); window.removeEventListener("vantage-open-setup", setup); };
  }, []);
  const panelRef = usePanel<HTMLDivElement>(!!panel, () => setPanel(null));
  const [visible, setVisible] = useState<string[]>([]),
    [clusters, setClusters] = useState(true),
    [mode, setMode] = useState<GlobeEnhancements["mode"]>("live"),
    [frame, setFrame] = useState(-1),
    [forecastHour, setForecastHour] = useState(0),
    [playing, setPlaying] = useState(false);
  const [presetStyles, setPresetStyles] = useState<Record<
    string,
    LayerStyle
  > | null>(null);
  const retrySettings = settingsFeed.retry;
  useEffect(() => {
    const apply = (event: Event) => {
      const p = (event as CustomEvent<GlobePreset>).detail;
      setVisible(p.layers.filter((k) => EXTRA_LAYERS.includes(k)));
      setMode("live");
      setPresetStyles(p.styles || {});
      retrySettings();
    };
    window.addEventListener("vantage-apply-globe-preset", apply);
    return () =>
      window.removeEventListener("vantage-apply-globe-preset", apply);
  }, [retrySettings]);
  useEffect(() => {
    const open = (event: Event) => {
      setSelected(String((event as CustomEvent).detail));
      setPanel("finance");
    };
    window.addEventListener("vantage-open-company", open);
    return () => window.removeEventListener("vantage-open-company", open);
  }, []);

  const [radarError, setRadarError] = useState("");
  useEffect(() => {
    const error = (event: Event) => {
      setRadarError(String((event as CustomEvent).detail));
      setPlaying(false);
    };
    window.addEventListener("vantage-radar-error", error);
    return () => window.removeEventListener("vantage-radar-error", error);
  }, []);
  const [search, setSearch] = useState(""),
    [searchKind, setSearchKind] = useState<"stock" | "place">("stock"),
    [searchQuery, setSearchQuery] = useState("");
  const [gridRegion, setGridRegion] = useState<{
      lat: number;
      lng: number;
    } | null>(null),
    [styleKey, setStyleKey] = useState("earthquakes");
  const searchFeed = useDashboardFeed<Feed<unknown>>(
    searchQuery
      ? (searchKind === "stock"
          ? "/api/finance?action=search&q="
          : "/api/weather/details?action=search&q=") +
          encodeURIComponent(searchQuery)
      : null,
    3600000,
  );
  const quoteFeed = useDashboardFeed<QuoteFeed[]>(
    settings?.symbols.length
      ? "/api/finance?symbols=" + encodeURIComponent(settings.symbols.join(","))
      : null,
  );
  const companyFeed = useDashboardFeed<Record<string, Feed<unknown>>>(
    panel === "finance" && selected
      ? "/api/finance?action=company&symbol=" + encodeURIComponent(selected)
      : null,
    86400000,
  );
  const companyNews = useDashboardFeed<Feed<unknown>>(
    panel === "finance" && selected
      ? "/api/finance?action=news&symbol=" + encodeURIComponent(selected)
      : null,
    900000,
  );
  const marketNews = useDashboardFeed<Feed<unknown>>(
    panel === "finance" ? "/api/finance?action=news" : null,
    900000,
  );
  const place =
    settings?.places.find((p) => p.id === placeId) || settings?.places[0];
  const forecastFeed = useDashboardFeed<Feed<JsonRecord>>(
    panel === "weather" && place
      ? "/api/weather/details?action=forecast&place=" +
          encodeURIComponent(place.id) +
          (settings?.units === "metric" ? "&units=metric" : "")
      : null,
    1800000,
  );
  const warnings = useDashboardFeed<Feed<WeatherAlert[]>>(
    panel === "weather" ||
      visible.includes("warnings") ||
      visible.includes("financial")
      ? "/api/weather/details?action=alerts"
      : null,
  );
  const placeWarnings = useDashboardFeed<Feed<WeatherAlert[]>>(
    panel === "weather" && place
      ? "/api/weather/details?action=alerts&place=" +
          encodeURIComponent(place.id) +
          "&geometry=1"
      : null,
  );
  const radarFeed = useDashboardFeed<Feed<JsonRecord>>(
    visible.includes("radar") ? "/api/weather/details?action=radar" : null,
    300000,
  );
  const hurricaneFeed = useDashboardFeed<Feed<GeoJSON.FeatureCollection>>(
    visible.includes("hurricanes")
      ? "/api/weather/details?action=hurricanes"
      : null,
    900000,
  );
  const gridFeed = useDashboardFeed<Feed<JsonRecord>>(
    gridRegion
      ? `/api/weather/details?action=grid&lat=${gridRegion.lat}&lng=${gridRegion.lng}`
      : null,
    3600000,
  );
  const rulesFeed = useDashboardFeed<{
    rules: WatchRule[];
  }>(panel === "finance" || panel === "weather" ? "/api/watchlist" : null);
  const frames = array(radarFeed.data?.data?.frames).map(asRecord);
  const radarIndex =
    frame < 0 ? frames.length - 1 : Math.min(frame, frames.length - 1);
  const radarFrame = frames[radarIndex];
  useEffect(() => {
    if (!playing || lowPower) return;
    const timer = setInterval(() => {
      if (
        !document.hidden &&
        !matchMedia("(prefers-reduced-motion: reduce)").matches
      )
        setFrame((n) => (n + 1) % Math.max(1, frames.length));
    }, 6000);
    return () => clearInterval(timer);
  }, [playing, frames.length, lowPower]);
  const overlays = useMemo(() => {
    const out: Record<string, GeoJSON.FeatureCollection> = {};
    out.warnings = collection(
      [
        ...new Map(
          [
            ...(warnings.data?.data || []),
            ...(placeWarnings.data?.data || []),
          ].map((a) => [a.id, a]),
        ).values(),
      ]
        .filter((a) => a.geometry && Date.parse(a.expires) > now)
        .map((a) => ({
          type: "Feature",
          geometry: a.geometry!,
          properties: {
            ...a,
            geometry: undefined,
          },
        })),
    );
    out.financial = collection(
      (settings?.facilities || []).map((p) => {
        const nearby = (warnings.data?.data || [])
          .filter((a) => a.geometry && inGeometry(p.lng, p.lat, a.geometry))
          .map((a) => a.event);
        return {
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [p.lng, p.lat],
          },
          properties: {
            ...p,
            nearby: nearby.length
              ? nearby.join(", ")
              : "No matching loaded warning geometry; not a complete impact assessment.",
          },
        };
      }),
    );
    out.hurricanes = hurricaneFeed.data?.data || collection([]);
    const points = array(gridFeed.data?.data?.points).map(asRecord);
    for (const [name, field] of [
      ["wind", "wind_speed_10m"],
      ["temperature", "temperature_2m"],
      ["rainfall", "precipitation"],
    ]) {
      out[name] = collection(
        points.flatMap((p) => {
          const h = asRecord(p.hourly),
            times = array(h.time);
          const found = times.findIndex(
            (t) => Date.parse(String(t) + "Z") >= now,
          );
          const current = found < 0 ? times.length - 1 : found;
          const i = Math.min(times.length - 1, current + forecastHour),
            value = array(h[field])[i];
          if (!finite(value) || !finite(p.lat) || !finite(p.lng)) return [];
          const properties = {
            name: name === "wind" ? "" : number(value),
            value,
            units:
              name === "wind"
                ? "km/h"
                : name === "temperature"
                  ? "°C"
                  : "mm/hour",
            direction: (Number(array(h.wind_direction_10m)[i]) + 180) % 360,
            validTime: times[i] + "Z",
            source: "https://open-meteo.com/en/docs",
            title: "Coarse forecast · 2° grid",
            receivedAt: gridFeed.data?.receivedAt,
          };
          const x = p.lng,
            y = p.lat;
          return [
            {
              type: "Feature",
              geometry:
                name === "wind"
                  ? {
                      type: "Point",
                      coordinates: [x, y],
                    }
                  : {
                      type: "Polygon",
                      coordinates: [
                        [
                          [Math.max(-180, x - 1), y - 1],
                          [Math.min(180, x + 1), y - 1],
                          [Math.min(180, x + 1), y + 1],
                          [Math.max(-180, x - 1), y + 1],
                          [Math.max(-180, x - 1), y - 1],
                        ],
                      ],
                    },
              properties,
            } as GeoJSON.Feature,
          ];
        }),
      );
    }
    return out;
  }, [
    warnings.data,
    placeWarnings.data,
    settings?.facilities,
    hurricaneFeed.data,
    gridFeed.data,
    forecastHour,
    now,
  ]);
  useEffect(() => {
    const allowed = visible.filter(
      (k) =>
        mode === "live" ||
        k === "financial" ||
        (mode === "recorded"
          ? k === "radar"
          : ["wind", "temperature", "rainfall", "hurricanes"].includes(k)),
    );
    const host = radarFeed.data?.data?.host;
    onGlobe({
      styles: presetStyles || settings?.styles || {},
      clusters,
      mode,
      visible: allowed,
      overlays,
      radarUrl:
        typeof host === "string" && radarFrame?.path
          ? `/api/weather/radar/${radarFrame.time}/{z}/{x}/{y}`
          : null,
    });
  }, [
    visible,
    mode,
    settings?.styles,
    presetStyles,
    clusters,
    overlays,
    radarFeed.data,
    radarFrame,
    onGlobe,
  ]);
  async function save(next: DashboardSettings) {
    if (saving) return;
    setPresetStyles(null);
    setSaving(true);
    setError("");
    try {
      const r = await fetch("/api/dashboard/settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(next),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      settingsFeed.retry();
      setNotice("Saved across your devices.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }
  async function watch(
    kind: "market" | "weather",
    spec: unknown,
    name: string,
  ) {
    setError("");
    try {
      const r = await fetch("/api/watchlist", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          kind,
          spec,
          name,
          channels: [],
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setNotice(
        "Watch saved to the inbox. Configure delivery channels in Watchlist.",
      );
      rulesFeed.retry();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Watch failed");
    }
  }
  const choose = (symbol: string) => {
    setSelected(symbol);
    setPanel("finance");
  };
  const applyPreset = (p: GlobePreset) => {
    setVisible(p.layers.filter((k) => EXTRA_LAYERS.includes(k)));
    setMode("live");
    onPreset(p);
    if (settings)
      void save({
        ...settings,
        styles: p.styles,
      });
  };
  const renderNews = (feed: Feed<unknown> | null) => (
    <>
      <FeedStatus feed={feed} />
      {array(feed?.data)
        .slice(0, 12)
        .map((raw, i) => {
          const n = asRecord(raw);
          return (
            <article className="enh-row" key={String(n.id || i)}>
              <a
                href={safeLink(n.url)}
                target="_blank"
                rel="noopener noreferrer"
              >
                {String(n.headline || "Untitled")}
              </a>
              <p className="enh-muted">
                {String(n.source || "Unknown source")} ·{" "}
                {finite(n.datetime)
                  ? new Date(n.datetime * 1000).toLocaleString()
                  : "Time unavailable"}
              </p>
            </article>
          );
        })}
    </>
  );
  const metric = asRecord(asRecord(companyFeed.data?.metrics?.data).metric),
    profile = asRecord(companyFeed.data?.profile?.data),
    modeled = asRecord(forecastFeed.data?.data?.modeled),
    current = asRecord(modeled.current),
    nws = asRecord(forecastFeed.data?.data?.nws),
    observation = asRecord(nws.observation),
    hourly = asRecord(modeled.hourly),
    daily = asRecord(modeled.daily);
  const selectedQuote = quoteFeed.data?.find((q) => q.symbol === selected);
  const isFund = !profile.name;
  const temp = (v: unknown) => {
    const n = asRecord(v).value;
    return finite(n)
      ? number(settings?.units === "us" ? (n * 9) / 5 + 32 : n)
      : "Unavailable";
  };
  return (
    <div className="enh-root">
      <div className="enh-bar">
        <div className="enh-brand" aria-label="Vantage intelligence workspace">
          <strong>VANTAGE</strong><span>Intelligence workspace</span>
        </div>
        <button onClick={() => window.dispatchEvent(new Event("vantage-open-home"))}>Home</button>
        <button className="overview-button" onClick={onOverview} title="Show the whole Earth without changing your layers">Globe</button>
        <button
          className="enh-secondary"
          aria-expanded={panel === "finance"}
          onClick={() => setPanel(panel === "finance" ? null : "finance")}
        >
          Finance
        </button>
        <button className="enh-search" onClick={() => window.dispatchEvent(new Event("vantage-open-search"))}>Search</button>
        <button
          className="enh-secondary"
          aria-expanded={panel === "weather"}
          onClick={() => setPanel(panel === "weather" ? null : "weather")}
        >
          Weather
        </button>
        <button onClick={() => window.dispatchEvent(new Event("vantage-feed-health"))}>Feed health</button>
      </div>
      {panel && (
        <section
          className="enh-panel"
          ref={panelRef}
          role="dialog"
          aria-label={`${panel} dashboard`}
        >
          <header className="enh-heading">
            <h2>
              {panel === "globe"
                ? "Globe overlays"
                : panel === "setup"
                  ? "Personal dashboard setup"
                  : panel === "finance"
                    ? "Finance"
                    : "Weather"}
            </h2>
            <button
              onClick={() => {
                for (const source of [
                  quoteFeed,
                  companyFeed,
                  companyNews,
                  marketNews,
                  forecastFeed,
                  warnings,
                  placeWarnings,
                  radarFeed,
                  hurricaneFeed,
                  gridFeed,
                  rulesFeed,
                ])
                  source.retry();
                setRadarError("");
              }}
            >
              Refresh
            </button>
            <button
              onClick={() => setPanel(null)}
              aria-label="Close dashboard panel"
            >
              ×
            </button>
          </header>
          <nav className="enh-tabs">
            {(["finance", "weather", "globe", "setup"] as const).map((k) => (
              <button
                key={k}
                aria-pressed={panel === k}
                onClick={() => setPanel(k)}
              >
                {
                  {
                    finance: "Stocks",
                    weather: "Weather",
                    globe: "Globe",
                    setup: "Settings",
                  }[k]
                }
              </button>
            ))}
          </nav>
          {[
            ...new Set(
              [
                quoteFeed.error,
                companyFeed.error,
                companyNews.error,
                marketNews.error,
                forecastFeed.error,
                warnings.error,
                placeWarnings.error,
                radarFeed.error,
                hurricaneFeed.error,
                gridFeed.error,
                rulesFeed.error,
              ].filter(Boolean),
            ),
          ].map((message) => (
            <p key={message} role="alert" className="dashboard-error">
              {message} · Retained data may be outdated. Use Refresh to retry.
            </p>
          ))}
          {(error || settingsFeed.error) && (
            <p role="alert">
              {error || settingsFeed.error}{" "}
              <button onClick={settingsFeed.retry}>Reload settings</button>
            </p>
          )}
          {notice && (
            <p role="status" className="enh-muted">
              {notice}
            </p>
          )}
          {!settings && <p>Loading shared settings…</p>}
          {panel === "finance" && (
            <>
              <h3>Watchlist</h3>
              <div className="enh-tabs">
                {settings?.symbols.map((s) => (
                  <button
                    key={s}
                    aria-pressed={selected === s}
                    onClick={() => choose(s)}
                  >
                    {s}
                  </button>
                ))}
                <button onClick={() => setPanel("setup")}>Edit</button>
              </div>
              {quoteFeed.error && <p role="alert">{quoteFeed.error}</p>}
              {!settings?.symbols.length && (
                <p>
                  Add US stock or ETF symbols in Setup. Quotes, news, and
                  company data require a free FINNHUB_API_KEY on the server.
                </p>
              )}
              {selected && (
                <>
                  <h3>{String(profile.name || selected)}</h3>
                  <p className="enh-price">
                    {selectedQuote?.data
                      ? "$" + number(selectedQuote.data.price)
                      : "Quote unavailable"}
                  </p>
                  <FeedStatus feed={selectedQuote || null} />
                  <p className="enh-muted">
                    Source time: {time(selectedQuote?.sourceTime)} ·{" "}
                    {selectedQuote?.data?.marketOpen
                      ? "Regular session open"
                      : "Session closed or unavailable"}{" "}
                    · Quote delay unknown
                  </p>
                  <MarketChart
                    symbol={selected}
                    name={String(profile.name || selected)}
                    onClose={() => setSelected("")}
                  />
                  <h3>Company snapshot</h3>
                  <FeedStatus feed={companyFeed.data?.metrics || null} />
                  <div className="enh-metrics">
                    {Object.entries({
                      "Market cap (USD millions)": profile.marketCapitalization,
                      "P/E (TTM)": metric.peTTM,
                      "Revenue (TTM, USD)": metric.revenueTTM,
                      "Revenue/share (TTM)": metric.revenuePerShareTTM,
                      "EPS (TTM)": metric.epsTTM,
                      "Revenue growth YoY (%)":
                        metric.revenueGrowthQuarterlyYoy,
                      "Dividend yield (%)": metric.dividendYieldIndicatedAnnual,
                    }).map(([k, v]) => (
                      <div key={k}>
                        <span>{k}</span>
                        <strong>{number(v)}</strong>
                      </div>
                    ))}
                  </div>
                  {isFund && (
                    <p className="enh-muted">
                      Company profile unavailable. ETFs do not have company
                      earnings; unsupported fields remain unavailable.
                    </p>
                  )}
                  <p>
                    Next reported earnings:{" "}
                    {String(
                      asRecord(
                        array(
                          asRecord(companyFeed.data?.earnings?.data)
                            .earningsCalendar,
                        )[0],
                      ).date || "Unavailable",
                    )}
                  </p>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      void watch(
                        "market",
                        {
                          symbol: selected,
                          field: f.get("field"),
                          comparator: f.get("comparator"),
                          threshold: Number(f.get("threshold")),
                        },
                        selected + " market alert",
                      );
                    }}
                  >
                    <h3>Create one-shot alert</h3>
                    <label>
                      Measure
                      <select name="field">
                        <option value="price">Price (USD)</option>
                        <option value="changePercent">Daily move (%)</option>
                      </select>
                    </label>
                    <label>
                      Condition
                      <select name="comparator">
                        <option value="above">Above</option>
                        <option value="below">Below</option>
                      </select>
                    </label>
                    <label>
                      Threshold
                      <input
                        name="threshold"
                        type="number"
                        step="any"
                        required
                      />
                    </label>
                    <p className="enh-muted">
                      Fires once on a qualifying regular-session quote, even if
                      already past the threshold. Rearm manually.
                    </p>
                    <button>Save alert</button>
                  </form>
                  <h3>{selected} news</h3>
                  {renderNews(companyNews.data)}
                </>
              )}
              <h3>Market headlines</h3>
              {renderNews(marketNews.data)}
              <h3>Market watches</h3>
              {rulesFeed.data?.rules
                .filter((r) => r.kind === "market")
                .map((r) => (
                  <div className="enh-row" key={r.id}>
                    {r.name} · {r.enabled ? "Armed" : "Paused"}{" "}
                    <button
                      onClick={async () => {
                        const res = await fetch(
                          "/api/watchlist?id=" + encodeURIComponent(r.id),
                          {
                            method: "PATCH",
                            headers: {
                              "Content-Type": "application/json",
                            },
                            body: JSON.stringify({
                              enabled: !r.enabled,
                            }),
                          },
                        );
                        if (!res.ok) setError("Could not change watch.");
                        rulesFeed.retry();
                      }}
                    >
                      {r.enabled ? "Pause" : "Rearm"}
                    </button>
                  </div>
                ))}
            </>
          )}
          {panel === "weather" && (
            <>
              <label>
                Saved place
                <select
                  value={place?.id || ""}
                  onChange={(e) => {
                    setPlaceId(e.target.value);
                    const p = settings?.places.find(
                      (p) => p.id === e.target.value,
                    );
                    if (p) onLocate(p);
                  }}
                >
                  <option value="" disabled>
                    Choose a place
                  </option>
                  {settings?.places.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <button onClick={() => setPanel("setup")}>
                Add or edit places
              </button>
              {place && (
                <>
                  <h3>{place.name}</h3>
                  <FeedStatus feed={forecastFeed.data} />
                  {forecastFeed.error && (
                    <p role="alert">{forecastFeed.error}</p>
                  )}
                  <p className="enh-price">
                    {nws.observation
                      ? temp(observation.temperature)
                      : number(current.temperature_2m)}
                    °{settings?.units === "us" ? "F" : "C"}
                  </p>
                  <p className="enh-muted">
                    {String(
                      forecastFeed.data?.data?.conditionsSource ||
                        "Waiting for conditions",
                    )}{" "}
                    ·{" "}
                    {observation.timestamp
                      ? new Date(String(observation.timestamp)).toLocaleString(
                          undefined,
                          { timeZone: place.timezone },
                        )
                      : String(current.time || "Unavailable")}
                  </p>
                  <p>
                    Feels like {number(current.apparent_temperature)}° · Wind{" "}
                    {number(current.wind_speed_10m)}{" "}
                    {settings?.units === "us" ? "mph" : "km/h"} · Humidity{" "}
                    {number(current.relative_humidity_2m)}%
                  </p>
                  <p className="enh-muted">
                    Supporting conditions: Open-Meteo model. Times use{" "}
                    {place.timezone}.
                  </p>
                  <button onClick={() => onLocate(place)}>
                    Locate on globe
                  </button>
                  <button
                    onClick={() =>
                      void watch(
                        "weather",
                        {
                          place,
                          events: ["warnings", "watches"],
                        },
                        place.name + " warnings and watches",
                      )
                    }
                  >
                    Watch warnings & watches
                  </button>
                  <h3>Official alerts for this place</h3>
                  <FeedStatus feed={placeWarnings.data} />
                  {placeWarnings.data?.data?.map((a) => (
                    <details key={a.id} className="enh-warning">
                      <summary>
                        {a.event} · {a.severity}
                      </summary>
                      <p>{a.title}</p>
                      <p>Expires {time(a.expires)}</p>
                      <p>{a.description}</p>
                      <p>{a.instruction}</p>
                      <a
                        href={a.source}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        NWS source ↗
                      </a>
                    </details>
                  ))}
                  {placeWarnings.data?.status === "ready" &&
                    !placeWarnings.data.data?.length && (
                      <p>No current official alerts returned for this place.</p>
                    )}
                  <h3>Hourly forecast</h3>
                  <p className="enh-muted">
                    {String(forecastFeed.data?.data?.forecastSource || "")}
                  </p>
                  <div className="enh-forecast">
                    {array(asRecord(nws.hourly).periods).length
                      ? array(asRecord(nws.hourly).periods)
                          .slice(0, 12)
                          .map((v, i) => {
                            const p = asRecord(v);
                            return (
                              <div key={i}>
                                {String(p.startTime).slice(11, 16)}
                                <strong>
                                  {number(p.temperature)}°
                                  {String(p.temperatureUnit)}
                                </strong>
                                <span>{String(p.shortForecast)}</span>
                              </div>
                            );
                          })
                      : array(hourly.time)
                          .map((t, i) => ({
                            t,
                            i,
                          }))
                          .filter((x) => String(x.t) >= String(current.time))
                          .slice(0, 12)
                          .map(({ t, i }) => (
                            <div key={String(t)}>
                              {String(t).slice(11, 16)}
                              <strong>
                                {number(array(hourly.temperature_2m)[i])}°
                              </strong>
                              {number(
                                array(hourly.precipitation_probability)[i],
                              )}
                              % rain
                            </div>
                          ))}
                  </div>
                  <h3>Seven-day forecast</h3>
                  {array(asRecord(nws.periods).periods).length
                    ? array(asRecord(nws.periods).periods)
                        .slice(0, 14)
                        .map((v, i) => {
                          const p = asRecord(v);
                          return (
                            <details className="enh-row" key={i}>
                              <summary>
                                {String(p.name)} · {number(p.temperature)}°
                                {String(p.temperatureUnit)} ·{" "}
                                {String(p.shortForecast)}
                              </summary>
                              <p>{String(p.detailedForecast)}</p>
                            </details>
                          );
                        })
                    : array(daily.time)
                        .slice(0, 7)
                        .map((t, i) => (
                          <div className="enh-row" key={String(t)}>
                            {String(t)} ·{" "}
                            {number(array(daily.temperature_2m_max)[i])}° /{" "}
                            {number(array(daily.temperature_2m_min)[i])}° ·{" "}
                            {number(
                              array(daily.precipitation_probability_max)[i],
                            )}
                            % rain
                          </div>
                        ))}
                </>
              )}
              <p className="enh-muted">
                <a
                  href="https://www.weather.gov/documentation/services-web-api"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  NOAA/NWS
                </a>{" "}
                ·{" "}
                <a
                  href="https://open-meteo.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open-Meteo
                </a>
              </p>
              <h3>Weather on the globe</h3>
              <p className="enh-muted">
                {(warnings.data?.data || []).filter((a) => !a.geometry).length}{" "}
                national alerts lack published polygons; selected-place zone
                geometry is resolved when available. Missing shapes are unknown
                coverage.
              </p>
              {[
                "warnings",
                "radar",
                "hurricanes",
                "wind",
                "temperature",
                "rainfall",
              ].map((k) => (
                <label key={k}>
                  <input
                    type="checkbox"
                    checked={visible.includes(k)}
                    onChange={(e) =>
                      setVisible((old) =>
                        e.target.checked
                          ? [...old, k]
                          : old.filter((x) => x !== k),
                      )
                    }
                  />
                  {k}
                </label>
              ))}
              {visible.some((k) =>
                ["wind", "temperature", "rainfall"].includes(k),
              ) && (
                <>
                  <button
                    onClick={() =>
                      setGridRegion({
                        lat: camera.lat,
                        lng: camera.lng,
                      })
                    }
                  >
                    Load forecast grid around globe center
                  </button>
                  <p className="enh-muted">
                    Coarse 2° sample grid; one region per hour. °C, km/h,
                    mm/hour.
                  </p>
                  <FeedStatus feed={gridFeed.data} />
                  {gridFeed.data?.data && (
                    <p>
                      Loaded center:{" "}
                      {String(asRecord(gridFeed.data.data.anchor).lat)},{" "}
                      {String(asRecord(gridFeed.data.data.anchor).lng)}
                    </p>
                  )}
                </>
              )}
              <FeedStatus
                feed={
                  visible.includes("hurricanes")
                    ? hurricaneFeed.data
                    : visible.includes("radar")
                      ? radarFeed.data
                      : warnings.data
                }
              />
              <p className="enh-muted">
                NHC Atlantic/Eastern & Central Pacific coverage. The cone
                indicates track uncertainty, not the extent of impacts. Global
                major events remain in the existing Severe Weather layer.
              </p>
              <h3>Area watches</h3>
              {areas
                .filter((a) => a.geojson.geometry.type === "Polygon")
                .map((a) => (
                  <button
                    key={a.id}
                    onClick={() =>
                      void watch(
                        "weather",
                        {
                          ring: (a.geojson.geometry as GeoJSON.Polygon)
                            .coordinates[0],
                          events: ["warnings", "watches"],
                        },
                        a.name + " weather",
                      )
                    }
                  >
                    Watch {a.name}
                  </button>
                ))}
              {!areas.length && (
                <p>Use the existing draw tool to create a monitored area.</p>
              )}
            </>
          )}
          {panel === "globe" && settings && (
            <>
              <h3>Layer presets</h3>
              <div className="enh-tabs">
                {Object.entries(PRESETS).map(([name, layers]) => (
                  <button
                    key={name}
                    onClick={() =>
                      applyPreset({
                        name,
                        layers: layers.length
                          ? layers
                          : [...Object.keys(active), ...EXTRA_LAYERS],
                        styles: settings.styles,
                        projection,
                        ...camera,
                      })
                    }
                  >
                    {name}
                  </button>
                ))}
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget),
                    name = String(f.get("name")).trim();
                  if (name)
                    void save({
                      ...settings,
                      presets: [
                        ...settings.presets.filter((p) => p.name !== name),
                        {
                          name,
                          layers: [
                            ...Object.keys(active).filter((k) => active[k]),
                            ...visible,
                          ],
                          styles: presetStyles ?? settings.styles,
                          projection,
                          ...camera,
                        },
                      ].slice(-24),
                    });
                }}
              >
                <label>
                  Save current globe view
                  <input name="name" maxLength={120} required />
                </label>
                <button disabled={saving}>Save preset</button>
              </form>
              {settings.presets.map((p) => (
                <div className="enh-row" key={p.name}>
                  <button onClick={() => applyPreset(p)}>{p.name}</button>
                  <button
                    onClick={() =>
                      void save({
                        ...settings,
                        presets: settings.presets.filter((x) => x !== p),
                      })
                    }
                  >
                    Delete
                  </button>
                </div>
              ))}
              <label>
                <input
                  type="checkbox"
                  checked={clusters}
                  onChange={(e) => setClusters(e.target.checked)}
                />
                Cluster earthquakes, cameras, and infrastructure at wide zoom
              </label>
              <p className="enh-muted">
                Click a cluster to expand. Moving aircraft and satellites stay
                individually tracked.
              </p>
              <h3>Layer appearance</h3>
              <label>
                Layer
                <select
                  aria-label="Layer"
                  value={styleKey}
                  onChange={(e) => setStyleKey(e.target.value)}
                >
                  {Object.keys(SOURCE_GROUPS).map((k) => (
                    <option key={k}>{k}</option>
                  ))}
                </select>
              </label>
              <form
                key={styleKey + ":" + settings.revision}
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void save({
                    ...settings,
                    styles: {
                      ...settings.styles,
                      [styleKey]: {
                        opacity: Number(f.get("opacity")),
                        labels: f.get("labels") as "off" | "key" | "all",
                        order: Number(f.get("order")),
                      },
                    },
                  });
                }}
              >
                <label>
                  Opacity
                  <input
                    name="opacity"
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    defaultValue={settings.styles[styleKey]?.opacity ?? 1}
                  />
                </label>
                <label>
                  Labels
                  <select
                    name="labels"
                    defaultValue={settings.styles[styleKey]?.labels || "key"}
                  >
                    <option value="off">Off</option>
                    <option value="key">Key labels</option>
                    <option value="all">All eligible labels</option>
                  </select>
                </label>
                <label>
                  Stack order (higher above lower)
                  <input
                    name="order"
                    type="number"
                    min="0"
                    max="150"
                    defaultValue={settings.styles[styleKey]?.order ?? 0}
                  />
                </label>
                <button disabled={saving}>Apply layer style</button>
              </form>
              <p className="enh-muted">
                Custom satellite rendering and base-map layers retain their
                native controls.
              </p>
              <label>
                <input
                  type="checkbox"
                  checked={visible.includes("financial")}
                  onChange={(e) =>
                    setVisible((v) =>
                      e.target.checked
                        ? [...v, "financial"]
                        : v.filter((k) => k !== "financial"),
                    )
                  }
                />
                Financial geography
              </label>
            </>
          )}
          {(panel === "globe" || panel === "weather") && (
            <section>
              <h3>Overlay time</h3>
              <div className="enh-tabs">
                {(["live", "recorded", "forecast"] as const).map((m) => (
                  <button
                    key={m}
                    aria-pressed={mode === m}
                    onClick={() => {
                      setMode(m);
                      setPlaying(false);
                    }}
                  >
                    {m === "live" ? "Return to live" : m}
                  </button>
                ))}
              </div>
              <p className="enh-muted">
                {mode === "live"
                  ? "Live feeds with source timestamps."
                  : mode === "recorded"
                    ? "Recent radar only. Live-only feeds are hidden; server alerts still monitor live data."
                    : "Forecast overlays only. Live-only feeds are hidden; server alerts still monitor live data."}
              </p>
              {visible.includes("radar") && mode !== "forecast" && (
                <>
                  <label>
                    Radar frame
                    <input
                      type="range"
                      min="0"
                      max={Math.max(0, frames.length - 1)}
                      value={Math.max(0, radarIndex)}
                      onChange={(e) => {
                        setMode("recorded");
                        setFrame(Number(e.target.value));
                      }}
                    />
                  </label>
                  <p>
                    {finite(radarFrame?.time)
                      ? new Date(radarFrame.time * 1000).toLocaleString()
                      : "No frame available"}
                  </p>
                  <button
                    disabled={!frames.length}
                    onClick={() => {
                      setMode("recorded");
                      setPlaying((p) => !p);
                    }}
                  >
                    {playing ? "Pause" : "Play recent radar"}
                  </button>
                  {radarError && (
                    <p role="alert">
                      {radarError}{" "}
                      <button
                        onClick={() => {
                          setRadarError("");
                          radarFeed.retry();
                        }}
                      >
                        Retry radar
                      </button>
                    </p>
                  )}
                  <p className="enh-muted">
                    Radar by{" "}
                    <a
                      href="https://www.rainviewer.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      RainViewer
                    </a>{" "}
                    · Native zoom ≤7 · Past observations only · Blank tiles can
                    mean missing coverage.
                  </p>
                </>
              )}
              {mode === "forecast" && (
                <label>
                  Forecast grid hours ahead: {forecastHour}
                  <input
                    type="range"
                    min="0"
                    max="24"
                    value={forecastHour}
                    onChange={(e) => setForecastHour(Number(e.target.value))}
                  />
                </label>
              )}
            </section>
          )}
          {panel === "setup" && settings && (
            <>
              <p>
                One private dashboard, shared across your devices. Start with up
                to 20 US symbols and 10 places.
              </p>
              <p className="enh-muted">
                Set FINNHUB_API_KEY in the server environment for
                quotes/news/financials. Weather works without a key. Keys are
                never stored in these settings.
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setSearchQuery(search.trim());
                }}
              >
                <label>
                  Find
                  <select
                    value={searchKind}
                    onChange={(e) => {
                      setSearchKind(e.target.value as "stock" | "place");
                      setSearchQuery("");
                    }}
                  >
                    <option value="stock">US stock / ETF</option>
                    <option value="place">Weather city</option>
                  </select>
                </label>
                <label>
                  Search
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    maxLength={100}
                    required
                  />
                </label>
                <button>Search</button>
              </form>
              {searchFeed.data && <FeedStatus feed={searchFeed.data} />}
              <div>
                {array(
                  asRecord(searchFeed.data?.data)[
                    searchKind === "stock" ? "result" : "results"
                  ],
                )
                  .slice(0, 8)
                  .map((v, i) => {
                    const r = asRecord(v);
                    return (
                      <button
                        className="enh-row"
                        key={i}
                        disabled={saving}
                        onClick={() => {
                          if (searchKind === "stock")
                            void save({
                              ...settings,
                              symbols: [
                                ...new Set([
                                  ...settings.symbols,
                                  String(r.symbol),
                                ]),
                              ],
                            });
                          else {
                            const p = {
                              id: crypto.randomUUID(),
                              name: [r.name, r.admin1, r.country]
                                .filter(Boolean)
                                .join(", ")
                                .slice(0, 120),
                              lat: Number(r.latitude),
                              lng: Number(r.longitude),
                              timezone: String(r.timezone || "UTC"),
                            };
                            void save({
                              ...settings,
                              places: [...settings.places, p],
                            });
                            setPlaceId(p.id);
                          }
                        }}
                      >
                        {searchKind === "stock"
                          ? `${r.symbol} · ${r.description}`
                          : `${r.name}, ${r.admin1 || r.country}`}
                      </button>
                    );
                  })}
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void save({
                    ...settings,
                    symbols: [
                      ...new Set([
                        ...settings.symbols,
                        String(f.get("symbol")).toUpperCase().trim(),
                      ]),
                    ],
                  });
                }}
              >
                <label>
                  Add symbol directly
                  <input
                    name="symbol"
                    maxLength={12}
                    required
                    placeholder="AAPL"
                  />
                </label>
                <button disabled={saving}>Add symbol</button>
              </form>
              <div className="enh-tabs">
                {settings.symbols.map((s) => (
                  <button
                    key={s}
                    disabled={saving}
                    onClick={() =>
                      void save({
                        ...settings,
                        symbols: settings.symbols.filter((x) => x !== s),
                      })
                    }
                  >
                    Remove {s}
                  </button>
                ))}
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void save({
                    ...settings,
                    places: [
                      ...settings.places,
                      {
                        id: crypto.randomUUID(),
                        name: String(f.get("name")),
                        lat: camera.lat,
                        lng: ((camera.lng + 540) % 360) - 180,
                        timezone: String(f.get("timezone")),
                      },
                    ],
                  });
                }}
              >
                <h3>Save globe center</h3>
                <p>
                  {camera.lat.toFixed(3)}, {camera.lng.toFixed(3)}
                </p>
                <label>
                  Place name
                  <input name="name" maxLength={120} required />
                </label>
                <label>
                  IANA timezone
                  <input
                    name="timezone"
                    defaultValue="America/Chicago"
                    required
                  />
                </label>
                <button disabled={saving}>Save location</button>
              </form>
              {settings.places.map((p) => (
                <div className="enh-row" key={p.id}>
                  <button
                    onClick={() => {
                      setPlaceId(p.id);
                      setPanel("weather");
                      onLocate(p);
                    }}
                  >
                    {p.name}
                  </button>
                  <button
                    disabled={saving}
                    onClick={() =>
                      void save({
                        ...settings,
                        places: settings.places.filter((x) => x.id !== p.id),
                      })
                    }
                  >
                    Remove
                  </button>
                </div>
              ))}
              <label>
                Weather units
                <select
                  value={settings.units}
                  disabled={saving}
                  onChange={(e) =>
                    void save({
                      ...settings,
                      units: e.target.value as "us" | "metric",
                    })
                  }
                >
                  <option value="us">Fahrenheit / mph / inches</option>
                  <option value="metric">Celsius / km/h / mm</option>
                </select>
              </label>
              <h3>Company facilities / exchanges</h3>
              <p className="enh-muted">
                Pin the globe center to a documented location. Nearby warnings
                do not establish business impact.
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void save({
                    ...settings,
                    facilities: [
                      ...settings.facilities,
                      {
                        id: crypto.randomUUID(),
                        name: String(f.get("name")),
                        lat: camera.lat,
                        lng: ((camera.lng + 540) % 360) - 180,
                        timezone: "UTC",
                        symbol: String(f.get("symbol")),
                        source: String(f.get("source")),
                        verifiedAt: new Date().toISOString(),
                        kind: f.get("kind") as "exchange" | "facility",
                      },
                    ],
                  });
                }}
              >
                <label>
                  Name
                  <input name="name" required maxLength={120} />
                </label>
                <label>
                  Symbol (optional for an exchange)
                  <input name="symbol" maxLength={12} />
                </label>
                <label>
                  Relationship
                  <select name="kind">
                    <option value="facility">Company facility</option>
                    <option value="exchange">Exchange</option>
                  </select>
                </label>
                <label>
                  Source URL
                  <input name="source" type="url" required />
                </label>
                <button disabled={saving}>
                  Add verified location at globe center
                </button>
              </form>
              {settings.facilities.map((p) => (
                <div className="enh-row" key={p.id}>
                  <button onClick={() => onLocate(p)}>{p.name}</button>
                  <a href={p.source} target="_blank" rel="noopener noreferrer">
                    Source
                  </a>
                  <details>
                    <summary>Edit</summary>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const f = new FormData(e.currentTarget);
                        void save({
                          ...settings,
                          facilities: settings.facilities.map((x) =>
                            x.id === p.id
                              ? {
                                  ...x,
                                  name: String(f.get("name")),
                                  symbol: String(f.get("symbol")),
                                  source: String(f.get("source")),
                                  lat: Number(f.get("lat")),
                                  lng: Number(f.get("lng")),
                                  verifiedAt: new Date().toISOString(),
                                }
                              : x,
                          ),
                        });
                      }}
                    >
                      <label>
                        Name
                        <input
                          name="name"
                          required
                          maxLength={120}
                          defaultValue={p.name}
                        />
                      </label>
                      <label>
                        Symbol
                        <input
                          name="symbol"
                          maxLength={12}
                          defaultValue={p.symbol}
                        />
                      </label>
                      <label>
                        Source URL
                        <input
                          name="source"
                          type="url"
                          required
                          defaultValue={p.source}
                        />
                      </label>
                      <label>
                        Latitude
                        <input
                          name="lat"
                          type="number"
                          min={-90}
                          max={90}
                          step="any"
                          required
                          defaultValue={p.lat}
                        />
                      </label>
                      <label>
                        Longitude
                        <input
                          name="lng"
                          type="number"
                          min={-180}
                          max={180}
                          step="any"
                          required
                          defaultValue={p.lng}
                        />
                      </label>
                      <button disabled={saving}>Save location</button>
                    </form>
                  </details>
                  <button
                    disabled={saving}
                    onClick={() =>
                      void save({
                        ...settings,
                        facilities: settings.facilities.filter(
                          (x) => x.id !== p.id,
                        ),
                      })
                    }
                  >
                    Remove
                  </button>
                </div>
              ))}
              <h3>Import / export preferences</h3>
              <button
                onClick={() => {
                  const url = URL.createObjectURL(
                    new Blob([JSON.stringify(settings, null, 2)], {
                      type: "application/json",
                    }),
                  );
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "vantage-dashboard.json";
                  a.click();
                  setTimeout(() => URL.revokeObjectURL(url), 1000);
                }}
              >
                Export
              </button>
              <label>
                Import (replaces dashboard preferences)
                <input
                  type="file"
                  accept="application/json"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      if (file.size > 200000) throw new Error("File too large");
                      const parsed = JSON.parse(await file.text());
                      await save({
                        ...parsed,
                        revision: settings.revision,
                      });
                    } catch (err) {
                      setError(
                        err instanceof Error ? err.message : "Import failed",
                      );
                    }
                    e.target.value = "";
                  }}
                />
              </label>
            </>
          )}
        </section>
      )}
    </div>
  );
}
