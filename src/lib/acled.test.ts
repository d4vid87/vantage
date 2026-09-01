import { describe, it, expect } from 'vitest';
import { mapAcled, eventColor } from './acled';

describe('mapAcled', () => {
  it('coerces the string numerics ACLED returns', () => {
    const [e] = mapAcled([{ latitude: '48.5', longitude: '37.2', fatalities: '12', event_type: 'Battles' }]);
    expect(e.lat).toBe(48.5);
    expect(e.lng).toBe(37.2);
    expect(e.fatalities).toBe(12);
  });

  it('drops events with unusable coordinates', () => {
    expect(mapAcled([{ latitude: 'abc', longitude: '1' }])).toHaveLength(0);
    expect(mapAcled([{ latitude: '99', longitude: '1' }])).toHaveLength(0);
  });

  it('defaults fatalities to zero when absent', () => {
    expect(mapAcled([{ latitude: '1', longitude: '1' }])[0].fatalities).toBe(0);
  });

  it('colours by event type, case-insensitively', () => {
    expect(eventColor('Battles')).toBe(eventColor('battles'));
    expect(eventColor('Protests')).not.toBe(eventColor('Battles'));
  });
});
