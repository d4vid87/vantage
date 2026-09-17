import { describe, expect, it } from 'vitest';
import { shouldRotateGlobe } from './idle-rotation';

describe('idle globe rotation', () => {
  const ready = { enabled: true, zoom: 2, idleMs: 20_000, hidden: false, reducedMotion: false, lowPower: false, blocked: false, moving: false };

  it('runs only for an idle, visible overview', () => {
    expect(shouldRotateGlobe(ready)).toBe(true);
    for (const blocked of [
      { idleMs: 19_999 }, { zoom: 4 }, { hidden: true }, { reducedMotion: true },
      { lowPower: true }, { blocked: true }, { moving: true }, { enabled: false },
    ]) expect(shouldRotateGlobe({ ...ready, ...blocked })).toBe(false);
  });
});
