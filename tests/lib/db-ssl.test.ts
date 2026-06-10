import { describe, it, expect } from 'vitest';
import { buildSslConfig } from '@/lib/db-ssl';

const RDS = 'postgresql://u:p@peakr.abc123.us-east-1.rds.amazonaws.com:5432/peakr';
const LOCAL = 'postgresql://u:p@localhost:5432/peakr';

describe('buildSslConfig', () => {
  it('disables ssl for non-RDS / local connections (unchanged behavior)', () => {
    expect(buildSslConfig(LOCAL, {})).toBe(false);
    expect(buildSslConfig(undefined, {})).toBe(false);
  });

  it('validates against a pinned CA bundle when DATABASE_CA_CERT is set', () => {
    const cfg = buildSslConfig(RDS, { DATABASE_CA_CERT: '-----BEGIN CERTIFICATE-----\nX\n-----END CERTIFICATE-----' });
    expect(cfg).toMatchObject({ rejectUnauthorized: true });
    expect((cfg as { ca: string }).ca).toContain('BEGIN CERTIFICATE');
  });

  it('verifies certificates by default for RDS (no insecure skip)', () => {
    expect(buildSslConfig(RDS, {})).toEqual({ rejectUnauthorized: true });
  });

  it('allows an explicit, opt-in insecure escape hatch', () => {
    expect(buildSslConfig(RDS, { DATABASE_SSL_INSECURE: 'true' })).toEqual({ rejectUnauthorized: false });
  });
});
