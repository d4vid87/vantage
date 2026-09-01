/**
 * VANTAGE — ACLED conflict events.
 *
 * ACLED is the one source here that needs credentials (free, but registered).
 * The layer stays hidden unless ACLED_API_KEY and ACLED_EMAIL are both set.
 * Attribution is required by their terms.
 */

export interface ConflictEvent {
  id: string;
  type: string;
  subtype: string;
  actor1: string;
  actor2: string;
  country: string;
  location: string;
  lat: number;
  lng: number;
  fatalities: number;
  date: string;
  notes: string;
  color: string;
  source: string;
}

/** ACLED's own event taxonomy, coloured by escalation. */
const TYPE_COLORS: Record<string, string> = {
  battles: '#D32F2F',
  'explosions/remote violence': '#FF1744',
  'violence against civilians': '#8E24AA',
  riots: '#FF9500',
  protests: '#FFD700',
  'strategic developments': '#4FC3F7',
};

export function eventColor(type: string): string {
  return TYPE_COLORS[type.toLowerCase()] ?? '#78909C';
}

interface RawEvent {
  event_id_cnty?: string;
  event_type?: string;
  sub_event_type?: string;
  actor1?: string;
  actor2?: string;
  country?: string;
  location?: string;
  latitude?: string | number;
  longitude?: string | number;
  fatalities?: string | number;
  event_date?: string;
  notes?: string;
}

export function mapAcled(raw: RawEvent[] | null | undefined): ConflictEvent[] {
  if (!Array.isArray(raw)) return [];
  const out: ConflictEvent[] = [];

  for (const e of raw) {
    // ACLED returns numerics as strings.
    const lat = Number(e?.latitude);
    const lng = Number(e?.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;

    const type = e.event_type || 'Unknown';
    out.push({
      id: `acled-${e.event_id_cnty ?? `${lat},${lng},${e.event_date}`}`,
      type,
      subtype: e.sub_event_type || '',
      actor1: e.actor1 || '',
      actor2: e.actor2 || '',
      country: e.country || '',
      location: e.location || '',
      lat,
      lng,
      fatalities: Number(e.fatalities) || 0,
      date: e.event_date || '',
      notes: (e.notes || '').slice(0, 400),
      color: eventColor(type),
      source: 'ACLED',
    });
  }

  return out;
}
