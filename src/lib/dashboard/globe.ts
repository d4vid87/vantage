import type { LayerStyle } from "./types";
export interface GlobeEnhancements {
  styles: Record<string, LayerStyle>;
  clusters: boolean;
  mode: "live" | "recorded" | "forecast";
  radarUrl: string | null;
  overlays: Record<string, GeoJSON.FeatureCollection>;
  visible: string[];
}
export const EMPTY_GLOBE: GlobeEnhancements = {
  styles: {},
  clusters: true,
  mode: "live",
  radarUrl: null,
  overlays: {},
  visible: [],
};
export const EXTRA_LAYERS = [
  "warnings",
  "radar",
  "hurricanes",
  "wind",
  "temperature",
  "rainfall",
  "financial",
];
export const SOURCE_GROUPS: Record<string, string[]> = {
  flights: ["flights"],
  private: ["private-fl"],
  jets: ["jets"],
  military: ["military"],
  earthquakes: ["earthquakes"],
  cctv: ["cctv"],
  fires: ["fires"],
  weather: ["weather"],
  infrastructure: ["infrastructure"],
  maritime: ["maritime", "maritime-ships", "maritime-choke"],
  global_incidents: ["gdelt"],
  conflict_zones: ["conflict-zones"],
  live_news: ["live-news"],
  radiation: ["radiation"],
  air_quality: ["air-quality"],
  volcanoes: ["volcanoes"],
  disease: ["disease"],
  power_outages: ["power-outages"],
  gdelt_events: ["gdelt-events"],
  frontlines: ["frontlines"],
  gps_jamming: ["gps-jamming"],
  acled: ["acled"],
  ransomware: ["ransomware"],
  balloons: ["balloons"],
  warnings: ["enh-warnings"],
  hurricanes: ["enh-hurricanes"],
  wind: ["enh-wind"],
  temperature: ["enh-temperature"],
  rainfall: ["enh-rainfall"],
  financial: ["enh-financial"],
  radar: ["enh-radar-a", "enh-radar-b"],
};
export const PRESETS: Record<string, string[]> = {
  "Severe Weather": ["weather", "warnings", "radar", "hurricanes"],
  Aviation: ["flights", "military", "private", "jets"],
  Markets: ["financial", "maritime", "infrastructure"],
  "All Intelligence": [],
};
