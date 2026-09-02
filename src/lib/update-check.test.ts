import { describe, it, expect } from 'vitest';
import { isNewer } from './update-check';

describe('isNewer', () => {
  it('orders plain semver', () => {
    expect(isNewer('3.2.0', '3.1.0')).toBe(true);
    expect(isNewer('3.1.0', '3.1.0')).toBe(false);
    expect(isNewer('3.0.9', '3.1.0')).toBe(false);
  });

  it('handles v-prefix and length mismatch', () => {
    expect(isNewer('v3.1.1', '3.1')).toBe(true);
    expect(isNewer('3.1', '3.1.0')).toBe(false);
  });

  it('major beats minor', () => {
    expect(isNewer('4.0.0', '3.9.9')).toBe(true);
  });

  it('garbage compares as zero, never throws', () => {
    expect(isNewer('not-a-version', '3.1.0')).toBe(false);
  });
});
