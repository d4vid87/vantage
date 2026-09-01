/**
 * VANTAGE — SondeHub radiosonde tracking.
 *
 * SondeHub returns an object keyed by sonde serial, each value being that
 * sonde's most recent telemetry frame — not an array.
 */

export interface Balloon {
  id: string;
  callsign: string;
  lat: number;
  lng: number;
  altitude: number;
  velocity_v: number | null;
  heading: number | null;
  type: string;
  manufacturer: string;
  frequency: number | null;
  phase: string;
  color: string;
  datetime: string;
}

export interface SondeFrame {
  serial?: string;
  lat?: number;
  lon?: number;
  alt?: number;
  vel_v?: number;
  heading?: number;
  type?: string;
  manufacturer?: string;
  frequency?: number;
  datetime?: string;
  uploader_callsign?: string;
}

/**
 * Ascent/descent matters more than raw altitude: a descending sonde is on its
 * parachute and its landing site is the thing an analyst cares about.
 */
export function phaseOf(velV: number | null, alt: number): { phase: string; color: string } {
  if (velV !== null && velV < -2) return { phase: 'Descending', color: '#FF9500' };
  if (velV !== null && velV > 2) return { phase: 'Ascending', color: '#00E676' };
  if (alt > 25000) return { phase: 'Float', color: '#00B0FF' };
  // Plenty of uploaders omit vertical velocity, so altitude alone has to decide
  // whether a sonde is flying — without this a sonde at 20km reads as 'Ground'.
  if (alt > 1000) return { phase: 'Airborne', color: '#00B0FF' };
  return { phase: 'Ground', color: '#9E9E9E' };
}

export function mapBalloons(raw: Record<string, SondeFrame> | null | undefined): Balloon[] {
  if (!raw || typeof raw !== 'object') return [];
  const out: Balloon[] = [];

  for (const [serial, s] of Object.entries(raw)) {
    if (!s || typeof s !== 'object') continue;
    const { lat, lon: lng, alt } = s;
    if (typeof lat !== 'number' || typeof lng !== 'number') continue;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;

    const altitude = typeof alt === 'number' ? alt : 0;
    const velV = typeof s.vel_v === 'number' ? s.vel_v : null;
    const { phase, color } = phaseOf(velV, altitude);

    out.push({
      id: `sonde-${serial}`,
      callsign: s.serial || serial,
      lat,
      lng,
      altitude: Math.round(altitude),
      velocity_v: velV,
      heading: typeof s.heading === 'number' ? s.heading : null,
      type: s.type || 'Radiosonde',
      manufacturer: s.manufacturer || 'Unknown',
      frequency: typeof s.frequency === 'number' ? s.frequency : null,
      phase,
      color,
      datetime: s.datetime || '',
    });
  }

  return out.sort((a, b) => b.altitude - a.altitude);
}
