import { it, expect } from "vitest";
import {
  searchReceived,
  incidentSnapshot,
  visitChanges,
  situationReport,
} from "./workspace";
import {
  DEFAULT_NOTIFICATION_POLICY,
  validateNotificationPolicy,
  notificationAllowed,
} from "../alerts/notification-policy";
it("search matches multiple words and retains zero coordinates, deduplicates and caps results", () => {
  const data = {
    flights: [
      { id: "one", callsign: "TEST 123", lat: 0, lng: 0 },
      { id: "one", callsign: "TEST 123", lat: 0, lng: 0 },
      { id: "two", callsign: "TEST 456", lat: 95, lng: 1 },
    ],
  };
  expect(searchReceived(data, "123 flights")).toEqual([
    {
      id: "flights:one",
      label: "TEST 123",
      category: "flights",
      lat: 0,
      lng: 0,
    },
  ]);
  expect(searchReceived(data, "test", 1)).toHaveLength(1);
  expect(searchReceived(data, "456")[0].lat).toBeUndefined();
  expect(searchReceived(data, " ")).toEqual([]);
});
it("compares saved alerts, real price moves, feed recovery and incident revisions", () => {
  const previous = {
    at: "2026-01-01",
    alertIds: ["old"],
    quotes: { AAPL: 100 },
    feeds: { earthquakes: "unavailable" },
    incidents: incidentSnapshot({
      earthquakes: [{ id: "e", location: "Ocean", magnitude: 5 }],
    }),
  };
  const current = {
    ...previous,
    alertIds: ["old", "new"],
    quotes: { AAPL: 102 },
    feeds: { earthquakes: "received" },
    incidents: incidentSnapshot({
      earthquakes: [
        { id: "e", location: "Ocean", magnitude: 6 },
        { id: "n", location: "Island" },
      ],
    }),
  };
  expect(visitChanges(previous, current)).toEqual([
    "1 new stored alerts (within the latest 500).",
    "AAPL: +2.00% since your previous snapshot.",
    "earthquakes: unavailable → received.",
    "1 new received incidents.",
    "Updated incident: Ocean.",
  ]);
  expect(visitChanges(null, current)).toEqual([]);
});
it("escapes report content and rejects active image URLs and unsafe source links", () => {
  const report = situationReport({
    at: "now",
    notes: "<script>alert(1)</script>",
    image: "javascript:evil()",
    layers: [],
    camera: {},
    feeds: [
      { source: "https://example.com", key: "source" },
      { source: "javascript:evil()", key: "evil" },
    ],
    alerts: [{ title: '<img onerror="bad">' }],
    quotes: [],
    places: [],
  });
  expect(report).not.toContain("<script>");
  expect(report).not.toContain("<img");
  expect(report).toContain("&lt;script&gt;");
  expect(report).toContain('href="https://example.com"');
  expect(report).not.toContain('href="javascript:');
  expect(report).toContain("Static snapshot, not live data");
});
it("quiet hours honor timezones, inclusive start/exclusive end and severe-weather opt-in", () => {
  const p = {
    ...DEFAULT_NOTIFICATION_POLICY,
    enabled: true,
    timezone: "America/Chicago",
  };
  const alert = { severity: "HIGH", payload: { event: "Tornado Warning" } };
  expect(notificationAllowed(p, alert, new Date("2026-09-09T03:00:00Z"))).toBe(
    false,
  );
  expect(notificationAllowed(p, alert, new Date("2026-09-09T12:00:00Z"))).toBe(
    true,
  );
  expect(
    notificationAllowed(
      { ...p, severeWeatherBypass: true },
      alert,
      new Date("2026-09-09T03:00:00Z"),
    ),
  ).toBe(true);
  expect(
    notificationAllowed(
      { ...p, severeWeatherBypass: true },
      { severity: "HIGH" },
      new Date("2026-09-09T03:00:00Z"),
    ),
  ).toBe(false);
  expect(
    notificationAllowed(
      { ...p, start: "09:00", end: "17:00" },
      alert,
      new Date("2026-09-09T15:00:00Z"),
    ),
  ).toBe(false);
  expect(notificationAllowed(p, alert, new Date("2026-01-09T04:00:00Z"))).toBe(
    false,
  );
  expect(() => validateNotificationPolicy({ ...p, start: "25:00" })).toThrow();
  expect(() =>
    validateNotificationPolicy({ ...p, timezone: "Wrong/Zone" }),
  ).toThrow();
  expect(() => validateNotificationPolicy({ ...p, end: p.start })).toThrow();
});
