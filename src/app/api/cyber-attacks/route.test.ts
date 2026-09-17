import { expect, it } from 'vitest';
import { mapFeodoEntries } from './route';

it('maps observed Feodo fields without inventing an attack origin or action', () => {
  const [row] = mapFeodoEntries([{ ip_address: '203.0.113.7', port: 443, country: 'US', malware: 'Emotet', last_online: '2026-09-16' }]);
  expect(row).toMatchObject({ target_ip: '203.0.113.7', port: 443, target_country: 'US', location_precision: 'country-centroid', observed_at: '2026-09-16' });
  expect(row).not.toHaveProperty('src_lat');
  expect(row).not.toHaveProperty('action');
});
