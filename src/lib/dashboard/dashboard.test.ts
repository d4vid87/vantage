import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { db, resetDbForTests } from "../db";
import { clearSourceCache } from "../sourceCache";
import { validateSettings, DEFAULT_SETTINGS } from "./types";
import { dashboardSettings, saveDashboardSettings } from "./settings";
import { polygonGeometry, inGeometry, intersectsGeometry } from "./geometry";
import { normalizeQuote, quotes } from "./finance";
import { feed } from "./remote";
import { weatherAlerts, resolveGeometry } from "./weather";
import {
  createRule,
  getRule,
  listAlerts,
  setRuleEnabled,
} from "../alerts/store";
import { runEvaluation } from "../alerts/run";
import { evaluateRule } from "../alerts/evaluate";
import { validateRule } from "../alerts/validation";
let dir: string;
beforeEach(() => {
  resetDbForTests();
  dir = mkdtempSync(join(tmpdir(), "vantage-dashboard-"));
  vi.stubEnv("VANTAGE_DATA_DIR", dir);
  clearSourceCache();
});
afterEach(() => {
  resetDbForTests();
  rmSync(dir, {
    recursive: true,
    force: true,
  });
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it("settings revisions prevent lost updates and preserve unrelated SQLite records", () => {
  db().prepare("INSERT INTO settings VALUES (?,?)").run("keep", "untouched");
  const a = dashboardSettings();
  const saved = saveDashboardSettings({
    ...a,
    symbols: ["aapl", "AAPL"],
  });
  expect(saved.symbols).toEqual(["AAPL"]);
  expect(saved.revision).toBe(1);
  expect(() => saveDashboardSettings(a)).toThrow("another device");
  resetDbForTests();
  expect(dashboardSettings().symbols).toEqual(["AAPL"]);
  expect(
    db().prepare("SELECT value FROM settings WHERE key=?").get("keep"),
  ).toEqual({
    value: "untouched",
  });
});
it("rejects malformed imports, invalid coordinates, timezones and non-http provenance", () => {
  for (const change of [
    {
      symbols: ["$BAD"],
    },
    {
      places: [
        {
          id: "x",
          name: "x",
          lat: 91,
          lng: 0,
          timezone: "UTC",
        },
      ],
    },
    {
      styles: {
        weather: {
          opacity: 2,
          labels: "all",
          order: 0,
        },
      },
    },
    {
      facilities: [
        {
          id: "x",
          name: "x",
          lat: 0,
          lng: 0,
          timezone: "UTC",
          symbol: "AAPL",
          source: "javascript:alert(1)",
          verifiedAt: "2026-09-08",
          kind: "facility",
        },
      ],
    },
  ])
    expect(() =>
      validateSettings({
        ...DEFAULT_SETTINGS,
        ...change,
      }),
    ).toThrow();
});
it("geometry handles holes, boundary points and antimeridian intersection", () => {
  const g = polygonGeometry({
    type: "Polygon",
    coordinates: [
      [
        [170, -10],
        [-170, -10],
        [-170, 10],
        [170, 10],
        [170, -10],
      ],
    ],
  })!;
  expect(inGeometry(179, 0, g)).toBe(true);
  expect(inGeometry(-179, 0, g)).toBe(true);
  expect(inGeometry(0, 0, g)).toBe(false);
  expect(
    intersectsGeometry(
      [
        [178, -15],
        [179, -15],
        [179, 15],
        [178, 15],
        [178, -15],
      ],
      g,
    ),
  ).toBe(true);
  const hole = polygonGeometry({
    type: "Polygon",
    coordinates: [
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
        [0, 0],
      ],
      [
        [2, 2],
        [8, 2],
        [8, 8],
        [2, 8],
        [2, 2],
      ],
    ],
  })!;
  expect(inGeometry(5, 5, hole)).toBe(false);
  expect(inGeometry(0, 4, hole)).toBe(true);
  expect(
    intersectsGeometry(
      [
        [4, 4],
        [6, 4],
        [6, 6],
        [4, 6],
        [4, 4],
      ],
      hole,
    ),
  ).toBe(false);
  expect(
    polygonGeometry({
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [1, 1],
        ],
      ],
    }),
  ).toBe(null);
});
it("normalizes actual daily change against previous close and rejects invalid quotes", () => {
  const q = normalizeQuote(
    {
      c: 110,
      pc: 100,
      t: 1700000000,
    },
    "AAPL",
    true,
  );
  expect(q.changePercent).toBe(10);
  expect(q.delay).toBe("unknown");
  for (const raw of [
    {
      c: 0,
      pc: 1,
      t: 1,
    },
    {
      c: 1,
      pc: 0,
      t: 1,
    },
    {
      c: 1,
      pc: 1,
      t: NaN,
    },
  ])
    expect(() => normalizeQuote(raw, "AAPL", true)).toThrow();
});
it("unconfigured finance never invents zero quotes or sends requests", async () => {
  vi.stubEnv("FINNHUB_API_KEY", "");
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  expect((await quotes(["AAPL"]))[0]).toMatchObject({symbol:"AAPL",status:"unconfigured",data:null});
  expect(fetcher).not.toHaveBeenCalled();
});
it("shared cache distinguishes successful empty datasets and stale failure fallback", async () => {
  const clock = vi.spyOn(Date, "now");
  clock.mockReturnValue(100000);
  const read = vi.fn(async () => [] as unknown[]);
  expect((await feed("test", "source", 1000, read)).data).toEqual([]);
  clock.mockReturnValue(102000);
  read.mockRejectedValue(new Error("offline"));
  const old = await feed("test", "source", 1000, read);
  expect(old.status).toBe("stale");
  expect(old.error).toBe("offline");
});
it("market rule persists once and disables atomically, survives restart, and rearms", async () => {
  const rule = createRule({
    name: "AAPL high",
    kind: "market",
    spec: {
      symbol: "AAPL",
      field: "price",
      comparator: "above",
      threshold: 100,
    },
    channels: [],
  });
  const now = new Date().toISOString();
  const snapshot = {
    personal_quotes: [
      {
        symbol: "AAPL",
        price: 110,
        changePercent: 2,
        marketOpen: true,
        sourceTime: now,
        receivedAt: now,
      },
    ],
  };
  await Promise.all([runEvaluation(snapshot), runEvaluation(snapshot)]);
  expect(listAlerts()).toHaveLength(1);
  expect(getRule(rule.id)?.enabled).toBe(false);
  resetDbForTests();
  expect(await runEvaluation(snapshot)).toHaveLength(0);
  setRuleEnabled(rule.id, true);
  expect(await runEvaluation(snapshot)).toHaveLength(1);
  expect(listAlerts()).toHaveLength(2);
});
it("market rules reject stale, closed, missing and opposite-threshold readings", () => {
  const r = createRule({
    name: "fall",
    kind: "market",
    spec: {
      symbol: "SPY",
      field: "changePercent",
      comparator: "below",
      threshold: -3,
    },
    channels: [],
  });
  const now = new Date().toISOString();
  const rec = {
    symbol: "SPY",
    changePercent: -4,
    sourceTime: now,
    receivedAt: now,
    marketOpen: true,
  };
  expect(
    evaluateRule(r, {
      personal_quotes: [rec],
    }),
  ).toHaveLength(1);
  for (const change of [
    {
      marketOpen: false,
    },
    {
      changePercent: 4,
    },
    {
      receivedAt: "invalid",
    },
    {
      sourceTime: "2000-01-01",
    },
  ])
    expect(
      evaluateRule(r, {
        personal_quotes: [
          {
            ...rec,
            ...change,
          },
        ],
      }),
    ).toHaveLength(0);
});
it("weather uses official point matches even when polygon is absent, but rejects expired or unmatched records", () => {
  const place = {
    id: "okc",
    name: "OKC",
    lat: 35.4,
    lng: -97.5,
    timezone: "America/Chicago",
  };
  const rule = createRule({
    name: "weather",
    kind: "weather",
    spec: {
      place,
      events: ["warnings", "watches"],
    },
    channels: [],
  });
  const rec = {
    id: "a",
    revisionKey: "a:1",
    title: "Tornado",
    event: "Tornado Warning",
    placeIds: ["okc"],
    expires: new Date(Date.now() + 3600000).toISOString(),
    receivedAt: new Date().toISOString(),
  };
  expect(
    evaluateRule(rule, {
      weather_alerts: [rec],
    }),
  ).toHaveLength(1);
  for (const change of [
    {
      event: "Wind Advisory",
    },
    {
      expires: "2000-01-01",
    },
    {
      receivedAt: "invalid",
    },
    {
      placeIds: ["elsewhere"],
    },
  ])
    expect(
      evaluateRule(rule, {
        weather_alerts: [
          {
            ...rec,
            ...change,
          },
        ],
      }),
    ).toHaveLength(0);
});
it("NWS expired alerts are excluded and malformed payloads are not no-alert successes", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        features: [
          {
            id: "expired",
            properties: {
              expires: "2000-01-01",
              event: "Tornado Warning",
            },
          },
        ],
      }),
    ),
  );
  expect((await weatherAlerts()).data).toEqual([]);
  clearSourceCache();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        error: "bad",
      }),
    ),
  );
  expect((await weatherAlerts()).status).toBe("unavailable");
});
it("shared validation accepts new kinds and rejects invalid criteria", () => {
  expect(
    validateRule({
      name: "w",
      kind: "market",
      spec: {
        symbol: "aapl",
        field: "price",
        comparator: "above",
        threshold: 2,
      },
      channels: [],
    }).kind,
  ).toBe("market");
  expect(() =>
    validateRule({
      name: "w",
      kind: "weather",
      spec: {
        ring: [
          [0, 0],
          [1, 1],
        ],
        events: ["warnings"],
      },
    }),
  ).toThrow();
  expect(() =>
    validateRule({
      name: "w",
      kind: "market",
      spec: {
        symbol: "AAPL",
        field: "price",
        comparator: "above",
        threshold: -1,
      },
    }),
  ).toThrow();
});

it("weather history reconciles without creating another notification", async () => {
  const { recordAlert, reconcileWeatherHistory } = await import(
    "../alerts/store"
  );
  const rule = createRule({
    name: "place",
    kind: "weather",
    spec: {
      place: { id: "p", name: "p", lat: 1, lng: 1, timezone: "UTC" },
      events: ["warnings"],
    },
    channels: [],
  });
  recordAlert({
    ruleId: rule.id,
    title: "Warning",
    body: "Instructions",
    severity: "HIGH",
    lat: 1,
    lng: 1,
    payload: {
      id: "nws-1",
      expires: new Date(Date.now() + 60000).toISOString(),
    },
  });
  reconcileWeatherHistory(new Set());
  expect(listAlerts()).toHaveLength(1);
  expect((listAlerts()[0].payload as { lifecycle: string }).lifecycle).toBe(
    "no longer active",
  );
  reconcileWeatherHistory(new Set(["nws-1"]));
  expect((listAlerts()[0].payload as { lifecycle: string }).lifecycle).toBe(
    "active",
  );
});

it("zone fallback preserves unknown coverage and resolves published polygons", async () => {
  const alert = {
    id: "zone-alert",
    geometry: null,
    zones: ["https://api.weather.gov/zones/forecast/OKZ025"],
  } as unknown as import("./weather").WeatherAlert;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [0, 0],
              [2, 0],
              [2, 2],
              [0, 2],
              [0, 0],
            ],
          ],
        },
      }),
    ),
  );
  expect((await resolveGeometry(alert)).geometry?.type).toBe("MultiPolygon");
  clearSourceCache();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ error: "unavailable" })),
  );
  expect((await resolveGeometry(alert)).geometry).toBeNull();
});
