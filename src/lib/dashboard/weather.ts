import { feed, json } from "./remote";
import { asRecord, finite, type Place, type JsonRecord } from "./types";
import { polygonGeometry } from "./geometry";
export interface WeatherAlert {
  id: string;
  title: string;
  event: string;
  severity: string;
  urgency: string;
  certainty: string;
  effective: string;
  expires: string;
  description: string;
  instruction: string;
  source: string;
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon | null;
  zones: string[];
  references: unknown;
  receivedAt: string;
  placeIds?: string[];
}
const rows = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
export async function weatherAlerts(place?: Place) {
  return feed(
    "nws-alerts:" + (place ? `${place.lat},${place.lng}` : "all"),
    "NOAA/NWS",
    60_000,
    async () => {
      const raw = asRecord(
        await json(
          "https://api.weather.gov/alerts/active?status=actual" +
            (place ? `&point=${place.lat},${place.lng}` : ""),
        ),
      );
      if (!Array.isArray(raw.features))
        throw new Error("Invalid NWS alert response");
      return rows(raw.features)
        .map((f) => {
          const feature = asRecord(f),
            p = asRecord(feature.properties);
          return {
            id: String(p.id || feature.id),
            title: String(p.headline || p.event),
            event: String(p.event),
            severity: String(p.severity),
            urgency: String(p.urgency),
            certainty: String(p.certainty),
            effective: String(p.effective),
            expires: String(p.expires),
            description: String(p.description || ""),
            instruction: String(p.instruction || ""),
            source:
              "https://api.weather.gov/alerts/" +
              encodeURIComponent(
                String(p.id || "")
                  .split("/")
                  .at(-1)!,
              ),
            geometry: polygonGeometry(feature.geometry),
            zones: rows(p.affectedZones).filter(
              (s): s is string =>
                typeof s === "string" &&
                /^https:\/\/api\.weather\.gov\/zones\/(forecast|county|fire)\/[A-Za-z0-9]+$/.test(
                  s,
                ),
            ),
            references: p.references,
            receivedAt: new Date().toISOString(),
            ...(place
              ? {
                  placeIds: [place.id],
                }
              : {}),
          } satisfies WeatherAlert;
        })
        .filter((a) => Date.parse(a.expires) > Date.now());
    },
  );
}
export async function resolveGeometry(
  alert: WeatherAlert,
): Promise<WeatherAlert> {
  if (alert.geometry || !alert.zones.length) return alert;
  const polygons: GeoJSON.Position[][][] = [];
  for (const url of alert.zones) {
    const result = await feed("zone:" + url, "NOAA/NWS", 86400000, () =>
      json(url),
    );
    const g = polygonGeometry(asRecord(result.data).geometry);
    if (!g) return alert;
    polygons.push(...(g.type === "Polygon" ? [g.coordinates] : g.coordinates));
  }
  return {
    ...alert,
    geometry: {
      type: "MultiPolygon",
      coordinates: polygons,
    },
  };
}
export async function placeSearch(q: string) {
  if (!q.trim() || q.length > 100) throw new Error("Enter a city name.");
  return feed("places:" + q, "Open-Meteo / GeoNames", 86400000, () =>
    json(
      "https://geocoding-api.open-meteo.com/v1/search?count=8&language=en&name=" +
        encodeURIComponent(q),
    ),
  );
}
export async function forecast(place: Place, units: "us" | "metric") {
  return feed(
    `forecast:${place.lat},${place.lng}:${units}`,
    "NWS / Open-Meteo",
    1800000,
    async () => {
      const u = new URL("https://api.open-meteo.com/v1/forecast");
      Object.entries({
        latitude: String(place.lat),
        longitude: String(place.lng),
        timezone: place.timezone,
        current:
          "temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code",
        hourly:
          "temperature_2m,precipitation_probability,precipitation,wind_speed_10m",
        daily:
          "temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset",
        temperature_unit: units === "us" ? "fahrenheit" : "celsius",
        wind_speed_unit: units === "us" ? "mph" : "kmh",
        precipitation_unit: units === "us" ? "inch" : "mm",
      }).forEach(([k, v]) => u.searchParams.set(k, v));
      let modeled: JsonRecord = {};
      try {
        modeled = asRecord(await json(u.href));
      } catch {
        /* NWS remains independently usable. */
      }
      let nws: JsonRecord | null = null;
      try {
        const point = asRecord(
          asRecord(
            await json(
              `https://api.weather.gov/points/${place.lat},${place.lng}`,
            ),
          ).properties,
        );
        const valid = (x: unknown) =>
          typeof x === "string" &&
          /^https:\/\/api\.weather\.gov\/(gridpoints|stations)\//.test(x);
        if (valid(point.forecast)) {
          const [periods, hourly, stations] = await Promise.all([
            json(
              String(point.forecast) +
                (units === "metric" ? "?units=si" : "?units=us"),
            ),
            valid(point.forecastHourly)
              ? json(
                  String(point.forecastHourly) +
                    (units === "metric" ? "?units=si" : "?units=us"),
                )
              : null,
            valid(point.observationStations)
              ? json(String(point.observationStations))
              : null,
          ]);
          const station = asRecord(rows(asRecord(stations).features)[0]).id;
          let observation: unknown = null;
          if (valid(station))
            try {
              observation = await json(
                String(station) + "/observations/latest",
              );
            } catch {
              /* modeled conditions remain labeled */
            }
          nws = {
            periods: asRecord(periods).properties,
            hourly: asRecord(hourly).properties,
            observation: asRecord(observation).properties || null,
          };
        }
      } catch {
        /* NWS has US coverage; explicit model fallback below */
      }
      if (!modeled.current && !nws)
        throw new Error("Both forecast providers are unavailable.");
      return {
        place,
        modeled,
        nws,
        conditionsSource: nws?.observation
          ? "NWS station observation"
          : "Open-Meteo model",
        forecastSource: nws?.periods ? "NWS forecast" : "Open-Meteo forecast",
      };
    },
  );
}
export async function radar() {
  return feed("radar", "RainViewer", 300000, async () => {
    const d = asRecord(
      await json("https://api.rainviewer.com/public/weather-maps.json"),
    );
    const host = String(d.host);
    if (!/^https:\/\/[a-z0-9.-]+\.rainviewer\.com$/.test(host))
      throw new Error("Invalid radar host");
    return {
      host,
      frames: rows(asRecord(d.radar).past)
        .map((x) => asRecord(x))
        .filter(
          (x) =>
            finite(x.time) &&
            typeof x.path === "string" &&
            /^\/v2\/radar\/[A-Za-z0-9/_-]+$/.test(x.path),
        ),
      maxzoom: 7,
      attribution: "RainViewer",
      coverage:
        "Available radar coverage; blank tiles may indicate no coverage.",
    };
  });
}
const NHC =
  "https://mapservices.weather.noaa.gov/tropical/rest/services/tropical/NHC_tropical_weather/MapServer";
export async function hurricanes() {
  return feed("hurricanes", "NOAA/NHC", 900000, async () => {
    const [catalogRaw, stormsRaw] = await Promise.all([
      json(NHC + "?f=json"),
      json("https://www.nhc.noaa.gov/CurrentStorms.json"),
    ]);
    const catalog = asRecord(catalogRaw);
    const storms = asRecord(stormsRaw);
    if (!Array.isArray(storms.activeStorms))
      throw new Error("Invalid NHC storm catalog");
    const bins = storms.activeStorms.map((x) => String(asRecord(x).binNumber));
    const layers = rows(catalog.layers)
      .map(asRecord)
      .filter(
        (x) =>
          bins.some((b) => String(x.name).startsWith(b + " ")) &&
          / (Forecast Track|Forecast Cone|Past Track)$/.test(String(x.name)),
      );
    const features: GeoJSON.Feature[] = [];
    for (let i = 0; i < layers.length; i += 6) {
      const batch = await Promise.all(
        layers.slice(i, i + 6).map(async (l) => {
          const d = asRecord(
            await json(
              `${NHC}/${Number(l.id)}/query?where=1%3D1&outFields=*&f=geojson`,
            ),
          );
          if (d.error) throw new Error("NHC layer unavailable");
          return rows(d.features).map((raw) => {
            const f = raw as GeoJSON.Feature;
            return {
              ...f,
              properties: {
                ...f.properties,
                layerName: l.name,
                name:
                  String(f.properties?.stormname || "Tropical system") +
                  " · " +
                  String(l.name),
                validTime: f.properties?.advdate || null,
                receivedAt: new Date().toISOString(),
                source: "https://www.nhc.noaa.gov/gis/",
              },
            };
          });
        }),
      );
      features.push(...batch.flat());
    }
    return {
      type: "FeatureCollection",
      features,
    } as GeoJSON.FeatureCollection;
  });
}
let gridAnchor: {
  lat: number;
  lng: number;
  at: number;
} | null = null;
export async function weatherGrid(lat: number, lng: number) {
  if (!finite(lat) || !finite(lng) || Math.abs(lat) > 80 || Math.abs(lng) > 180)
    throw new Error("Choose a region between 80°S and 80°N.");
  if (!gridAnchor || Date.now() - gridAnchor.at > 3600000)
    gridAnchor = {
      lat: Math.round(lat),
      lng: Math.round(lng),
      at: Date.now(),
    };
  const anchor = gridAnchor;
  return feed(
    "forecast-grid",
    "Open-Meteo coarse forecast grid",
    3600000,
    async () => {
      const points = Array.from(
        {
          length: 64,
        },
        (_, i) => ({
          lat: Math.max(
            -85,
            Math.min(85, anchor.lat + (Math.floor(i / 8) - 3.5) * 2),
          ),
          lng: ((anchor.lng + ((i % 8) - 3.5) * 2 + 540) % 360) - 180,
        }),
      );
      const u = new URL("https://api.open-meteo.com/v1/forecast");
      u.searchParams.set("latitude", points.map((p) => p.lat).join(","));
      u.searchParams.set("longitude", points.map((p) => p.lng).join(","));
      u.searchParams.set(
        "hourly",
        "temperature_2m,wind_speed_10m,wind_direction_10m,precipitation",
      );
      u.searchParams.set("forecast_days", "2");
      u.searchParams.set("timezone", "GMT");
      const data = rows(await json(u.href));
      if (data.length !== 64) throw new Error("Incomplete forecast grid");
      return {
        anchor,
        spacing: 2,
        points: points.map((p, i) => ({
          ...p,
          hourly: asRecord(asRecord(data[i]).hourly),
        })),
        units: {
          temperature: "°C",
          wind: "km/h",
          rainfall: "mm/hour",
        },
      };
    },
  );
}
