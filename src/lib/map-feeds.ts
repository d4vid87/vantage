import { mapIodaOutages } from './internet-outages';

export interface MapFeed {
  key: string; url: string; layers?: string[]; capability?: string; interval: number;
  transform?: (data: Record<string, unknown>) => Record<string, unknown>;
}
const minutes = (n: number) => n * 60_000;
export const MAP_FEEDS: MapFeed[] = [
  { key: 'earthquakes', url: '/api/earthquakes', interval: minutes(15) },
  { key: 'news', url: '/api/news', interval: minutes(30) },
  { key: 'markets', url: '/api/markets', interval: minutes(15), transform: d => ({ markets: d }) },
  { key: 'space_weather', url: '/api/space-weather', interval: minutes(15) },
  { key: 'flights', url: '/api/flights', layers: ['flights', 'military', 'private', 'jets'], interval: minutes(5) },
  { key: 'satellites', url: '/api/satellites', layers: ['satellites', 'sat_comms', 'sat_military', 'sat_navigation', 'sat_earth', 'sat_science'], interval: minutes(5), transform: d => ({ ...d, satellites_at: d.timestamp }) },
  { key: 'fires', url: '/api/fires', layers: ['fires'], interval: minutes(15) },
  { key: 'cctv', url: '/api/cctv?region=all', layers: ['cctv'], interval: minutes(30) },
  { key: 'maritime', url: '/api/maritime', layers: ['maritime'], interval: 10_000, transform: d => ({ maritime_ports: d.ports, maritime_chokepoints: d.chokepoints, maritime_ships: d.ships }) },
  { key: 'balloons', url: '/api/balloons', layers: ['balloons'], interval: minutes(5) },
  { key: 'radiation', url: '/api/radiation', layers: ['radiation'], interval: minutes(5), transform: d => ({ radiation: d.stations }) },
  { key: 'live_news', url: '/api/live-news', layers: ['live_news'], interval: minutes(60), transform: d => ({ live_feeds: d.feeds }) },
  { key: 'weather', url: '/api/weather', layers: ['weather'], interval: minutes(15), transform: d => ({ weather_events: d.events }) },
  { key: 'infrastructure', url: '/api/infrastructure', layers: ['infrastructure'], interval: minutes(1440) },
  { key: 'gdelt', url: '/api/gdelt', layers: ['global_incidents'], interval: minutes(5), transform: d => ({ gdelt: d.events }) },
  { key: 'cables', url: '/data/submarine-cables.json', layers: ['cables'], interval: minutes(1440), transform: d => ({ submarine_cables: d.features }) },
  { key: 'cyber_attacks', url: '/api/cyber-attacks', layers: ['cyber_attacks'], interval: 10_000, transform: d => ({ cyber_attacks: d.attacks }) },
  { key: 'gdelt_events', url: '/api/gdelt-events?limit=600', layers: ['gdelt_events'], interval: minutes(5), transform: d => ({ gdelt_events: d.events }) },
  { key: 'air_quality', url: '/api/air-quality', layers: ['air_quality'], interval: minutes(30), transform: d => ({ air_quality: d.stations }) },
  { key: 'disease', url: '/api/disease', layers: ['disease'], interval: minutes(60), transform: d => ({ disease: d.outbreaks }) },
  { key: 'volcanoes', url: '/api/volcanoes', layers: ['volcanoes'], interval: minutes(60) },
  { key: 'power_outages', url: '/api/power-outages', layers: ['power_outages'], interval: minutes(5), transform: d => ({ power_outages: d.outages }) },
  { key: 'country_risk', url: '/api/country-risk', layers: ['country_risk'], interval: minutes(15), transform: d => ({ country_risk: d.countries }) },
  { key: 'travel_advisories', url: '/api/travel-advisories', layers: ['travel_advisories'], interval: minutes(360), transform: d => ({ travel_advisories: d.advisories }) },
  { key: 'gps_jamming', url: '/api/gps-jamming', layers: ['gps_jamming'], interval: minutes(60), transform: d => ({ gps_jamming: d.cells }) },
  { key: 'acled', url: '/api/acled', layers: ['acled'], capability: 'acled', interval: minutes(15), transform: d => ({ acled: d.events }) },
  { key: 'ransomware', url: '/api/ransomware', layers: ['ransomware'], interval: minutes(15), transform: d => ({ ransomware: d.victims }) },
  { key: 'tor_exits', url: '/api/tor-exits', layers: ['tor_exits'], interval: minutes(60), transform: d => ({ tor_exits: d.countries }) },
  { key: 'frontlines', url: '/api/frontlines', layers: ['frontlines'], interval: minutes(15) },
  { key: 'internet_outages', url: '/api/radar', layers: ['cf_outages', 'cf_attacks'], interval: minutes(5), transform: d => ({ ioda_outages: mapIodaOutages(d.outages as never) }) },
  { key: 'cloudflare', url: '/api/cloudflare-radar', layers: ['cf_outages', 'cf_attacks'], capability: 'cloudflare', interval: minutes(5), transform: d => ({ cloudflare_outages: d.outages, cf_attack_origins: d.attack_origins }) },
];
export interface MapFeedStatus {
  key: string; lastSuccess?: number; lastAttempt?: number; error?: string;
  loading?: boolean; interval?: number; source?: string; observedAt?: string;
  retrievedAt?: string; availability?: 'current' | 'stale' | 'unavailable';
}
export function feedInterval(feed: MapFeed, lowPower: boolean) { return lowPower ? Math.max(60_000, feed.interval * 3) : feed.interval; }
export function feedDue(status: MapFeedStatus | undefined, interval: number, now = Date.now()) {
  if (status?.loading) return false;
  if (status?.error) return now - (status.lastAttempt ?? 0) >= 60_000;
  return !status?.lastSuccess || now - status.lastSuccess >= interval;
}
