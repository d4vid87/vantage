import { describe, it, expect } from 'vitest';
import { mapDon, severityOf } from './disease';

const don = (o: Record<string, unknown>) => ({
  Title: 'Nipah virus disease - India', Summary: 'summary',
  ItemDefaultUrl: '/2026-DON609', DonId: 'd1',
  PublicationDateAndTime: '2026-08-28T15:28:00Z', ...o,
});

describe('mapDon', () => {
  it('places an outbreak at its country centroid', () => {
    const [o] = mapDon([don({})]);
    expect(o.country).toBe('IN');
    expect(typeof o.lat).toBe('number');
  });

  it('emits one entry per co-affected country', () => {
    const out = mapDon([don({ Title: 'Ebola disease, Democratic Republic of the Congo & Uganda', DonId: 'd2' })]);
    expect(out.map((o) => o.country).sort()).toEqual(['CD', 'UG']);
  });

  it('collapses repeated updates of the same outbreak', () => {
    // WHO republishes an outbreak as it updates; the map wants one marker.
    const out = mapDon([
      don({ DonId: 'a', Title: 'Ebola disease - Democratic Republic of the Congo' }),
      don({ DonId: 'b', Title: 'Ebola disease - Democratic Republic of the Congo' }),
    ]);
    expect(out).toHaveLength(1);
  });

  it('keeps different diseases in the same country apart', () => {
    const out = mapDon([
      don({ DonId: 'a', Title: 'Ebola disease - Uganda' }),
      don({ DonId: 'b', Title: 'Measles - Uganda' }),
    ]);
    expect(out).toHaveLength(2);
  });

  it('skips global scopes that have no country to place', () => {
    expect(mapDon([don({ Title: 'Yellow fever - Global' })])).toHaveLength(0);
  });

  it('bands high-consequence pathogens above the rest', () => {
    expect(severityOf('Ebola disease - Uganda').severity).toBe('HIGH');
    expect(severityOf('Nipah virus disease - India').severity).toBe('HIGH');
    expect(severityOf('Seasonal influenza - France').severity).toBe('MODERATE');
  });

  it('survives a null payload', () => {
    expect(mapDon(null)).toEqual([]);
  });
});
