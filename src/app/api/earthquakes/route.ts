
import { recordFailure, recordSuccess } from '@/lib/feed-health';
import { NextResponse } from 'next/server';

/**
 * VANTAGE — Earthquake Data API
 * Fetches real-time seismic events from USGS (last 24h, M2.5+)
 * No API key required
 */

export async function GET() {
  try {
    const url = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson';
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      recordFailure('earthquakes', `USGS HTTP ${res.status}`, false);
      return NextResponse.json({ earthquakes: [], error: 'USGS unavailable' }, { status: 502 });
    }

    const data = await res.json();
    const features = data.features || [];

    const earthquakes = features.map((f: any) => {
      const coords = f.geometry?.coordinates || [0, 0, 0];
      const props = f.properties || {};
      return {
        id: f.id,
        lat: coords[1],
        lng: coords[0],
        depth: coords[2],
        magnitude: props.mag,
        place: props.place,
        time: props.time,
        url: props.url,
        tsunami: props.tsunami,
        type: props.type,
        felt: props.felt,
        alert: props.alert,
      };
    });

    recordSuccess('earthquakes', earthquakes.length);
    return NextResponse.json({
      earthquakes,
      total: earthquakes.length,
      timestamp: new Date().toISOString(),
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
      },
    });
  } catch (error) {
    recordFailure('earthquakes', error instanceof Error ? error.message : 'Fetch failed', false);
    console.error('Earthquake fetch error:', error);
    return NextResponse.json({ earthquakes: [], error: 'Failed to fetch earthquake data' }, { status: 500 });
  }
}

