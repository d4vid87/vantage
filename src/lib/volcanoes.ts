/**
 * VANTAGE — Smithsonian/USGS Weekly Volcanic Activity Report.
 *
 * The feed is GeoRSS: each item carries a `georss:point` of "lat lng" and a
 * title of "Volcano (Country)".
 */

export interface Volcano {
  id: string;
  name: string;
  country: string;
  activity: string;
  lat: number;
  lng: number;
  summary: string;
  url: string;
  published: string;
  color: string;
  source: string;
}

export interface VolcanoItem {
  title?: string;
  contentSnippet?: string;
  content?: string;
  link?: string;
  pubDate?: string;
  isoDate?: string;
  point?: string;
  'georss:point'?: string;
}

export function parsePoint(point: string | undefined): [number, number] | null {
  if (!point) return null;
  const [lat, lng] = point.trim().split(/\s+/).map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return [lat, lng];
}

/**
 * "Ambae (Vanuatu) - Report for 20 August-26 August 2026 - New Eruptive Activity"
 * → { name: 'Ambae', country: 'Vanuatu', activity: 'New Eruptive Activity' }.
 * The country is the first parenthesised group, not a trailing one, and the
 * reporting window that follows is noise on a map label.
 */
export function splitTitle(title: string): { name: string; country: string; activity: string } {
  const t = title.trim();
  const m = /^([^(]+)\(([^)]*)\)(.*)$/.exec(t);
  if (!m) return { name: t, country: '', activity: '' };
  const rest = m[3].split(/\s+-\s+/).map((x) => x.trim()).filter(Boolean);
  return {
    name: m[1].trim(),
    country: m[2].trim(),
    activity: rest.length ? rest[rest.length - 1] : '',
  };
}

export function mapVolcanoes(items: VolcanoItem[] | null | undefined): Volcano[] {
  if (!Array.isArray(items)) return [];
  const out: Volcano[] = [];

  for (const it of items) {
    const pt = parsePoint(it?.point ?? it?.['georss:point']);
    if (!pt) continue;
    const title = (it.title || '').trim();
    if (!title) continue;

    const { name, country, activity } = splitTitle(title);
    out.push({
      id: `gvp-${name.toLowerCase().replace(/\s+/g, '-')}`,
      name,
      country,
      activity,
      lat: pt[0],
      lng: pt[1],
      summary: (it.contentSnippet || it.content || '').replace(/\s+/g, ' ').slice(0, 500),
      url: it.link || '',
      published: it.isoDate || it.pubDate || '',
      color: '#FF6D00',
      source: 'Smithsonian GVP',
    });
  }

  return out;
}
