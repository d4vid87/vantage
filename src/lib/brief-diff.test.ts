import { describe, it, expect } from 'vitest';
import { summarizeSnapshot, diffSnapshots, changesSection, type BriefSnapshot } from './brief-diff';

const snap = (ids: Record<string, string[]>, counts: Record<string, number>): BriefSnapshot =>
  ({ ids, counts, takenAt: '2026-09-01T00:00:00Z' });

describe('summarizeSnapshot', () => {
  it('keeps identities only for notable layers, counts for everything', () => {
    const s = summarizeSnapshot({
      disease: [{ id: 'don-1' }, { id: 'don-2' }],
      flights: [{ callsign: 'X' }, { callsign: 'Y' }, { callsign: 'Z' }],
    });
    expect(s.ids.disease).toEqual(['don-1', 'don-2']);
    expect(s.ids.flights).toBeUndefined();
    expect(s.counts).toEqual({ disease: 2, flights: 3 });
  });

  it('falls back through title/name for identity', () => {
    const s = summarizeSnapshot({ ransomware: [{ victim: 'Acme Corp' }] });
    expect(s.ids.ransomware).toEqual(['Acme Corp']);
  });
});

describe('diffSnapshots', () => {
  it('no previous snapshot means no lines — never fabricate a delta', () => {
    expect(diffSnapshots(null, snap({ disease: ['a'] }, { disease: 1 }))).toEqual([]);
  });

  it('names new items in notable layers', () => {
    const prev = snap({ disease: ['don-1'] }, { disease: 1 });
    const curr = snap({ disease: ['don-1', 'don-2'] }, { disease: 2 });
    const lines = diffSnapshots(prev, curr);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('1 new disease');
    expect(lines[0]).toContain('don-2');
  });

  it('a layer absent from the previous snapshot is not reported as all-new', () => {
    const prev = snap({}, {});
    const curr = snap({ volcanoes: ['Etna', 'Merapi'] }, { volcanoes: 2 });
    expect(diffSnapshots(prev, curr)).toEqual([]);
  });

  it('reports count moves that clear both ratio and delta gates', () => {
    const prev = snap({}, { gps_jamming: 100, fires: 100, air_quality: 12 });
    const curr = snap({}, { gps_jamming: 150, fires: 108, air_quality: 20 });
    const lines = diffSnapshots(prev, curr);
    // gps_jamming +50% and +50 items: reported. fires +8%: under ratio.
    // air_quality +67% but only +8 items: under delta.
    expect(lines).toEqual(['gps jamming count 100 → 150 (+50%)']);
  });

  it('reports drops as negative percentages', () => {
    const lines = diffSnapshots(snap({}, { flights: 200 }), snap({}, { flights: 100 }));
    expect(lines).toEqual(['flights count 200 → 100 (-50%)']);
  });

  it('caps the named list and counts the remainder', () => {
    const prev = snap({ ransomware: [] }, {});
    const curr = snap({ ransomware: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }, {});
    const [line] = diffSnapshots(prev, curr);
    expect(line).toContain('7 new ransomware');
    expect(line).toContain('(+2 more)');
  });
});

describe('changesSection', () => {
  it('is empty when quiet', () => {
    expect(changesSection([])).toBe('');
  });
  it('renders a markdown section', () => {
    expect(changesSection(['x'])).toContain('## Changes since last brief');
    expect(changesSection(['x'])).toContain('- x');
  });
});
