/**
 * VANTAGE — disease outbreak normalisation (WHO Disease Outbreak News).
 *
 * WHO names the affected country only in the headline, and republishes the same
 * outbreak repeatedly as it updates, so entries are keyed on the outbreak rather
 * than the article.
 */

import { centroidFor } from './countryCentroids';
import { countriesFromTitle } from './countryNames';

export interface Outbreak {
  id: string;
  title: string;
  disease: string;
  country: string;
  lat: number;
  lng: number;
  summary: string;
  url: string;
  published: string;
  severity: string;
  color: string;
  source: string;
}

/** Diseases whose appearance in a headline warrants the top band. */
const HIGH_CONSEQUENCE = /ebola|marburg|nipah|mers|smallpox|mpox|plague|anthrax|lassa|avian influenza|h5n1|polio|cholera/i;

export function severityOf(title: string): { severity: string; color: string } {
  if (HIGH_CONSEQUENCE.test(title)) return { severity: 'HIGH', color: '#FF1744' };
  return { severity: 'MODERATE', color: '#FF9500' };
}

function diseaseOf(title: string): string {
  return title.split(/\s+[-–]\s+|,\s+/)[0].trim();
}

interface DonItem {
  Title?: string;
  Summary?: string;
  ItemDefaultUrl?: string;
  UrlName?: string;
  PublicationDateAndTime?: string;
  DonId?: string;
}

export function mapDon(items: DonItem[] | null | undefined): Outbreak[] {
  if (!Array.isArray(items)) return [];
  const seen = new Set<string>();
  const out: Outbreak[] = [];

  for (const it of items) {
    const title = (it?.Title || '').trim();
    if (!title) continue;

    const disease = diseaseOf(title);
    for (const iso of countriesFromTitle(title)) {
      // One outbreak, many updates: key on disease+country, keep the newest.
      const key = `${disease.toLowerCase()}|${iso}`;
      if (seen.has(key)) continue;
      const c = centroidFor(iso);
      if (!c) continue;
      seen.add(key);

      const { severity, color } = severityOf(title);
      out.push({
        id: `who-${it.DonId || it.UrlName || key}`,
        title,
        disease,
        country: iso,
        lng: c[0],
        lat: c[1],
        summary: (it.Summary || '').slice(0, 400),
        url: it.ItemDefaultUrl ? `https://www.who.int/emergencies/disease-outbreak-news/item${it.ItemDefaultUrl}` : '',
        published: it.PublicationDateAndTime || '',
        severity,
        color,
        source: 'WHO',
      });
    }
  }

  return out;
}
