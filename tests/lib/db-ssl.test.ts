import { describe, it, expect } from 'vitest';
import { buildSslConfig } from '@/lib/db-ssl';

const RDS = 'postgresql://u:p@peakr.abc123.us-east-1.rds.amazonaws.com:5432/peakr';
const NEON = 'postgresql://u:p@ep-cool-name-123.us-east-1.aws.neon.tech/peakr?sslmode=require';
const SUPABASE = 'postgresql://postgres:p@db.abcdef.supabase.co:5432/postgres';
const LOCAL = 'postgresql://u:p@localhost:5432/peakr';

describe('buildSslConfig', () => {
  it('disables ssl for local / unset connections', () => {
    expect(buildSslConfig(LOCAL, {})).toBe(false);
    expect(buildSslConfig('postgresql://u:p@127.0.0.1:5432/peakr', {})).toBe(false);
    expect(buildSslConfig(undefined, {})).toBe(false);
  });

  it('verifies TLS for any remote provider (Neon, Supabase, RDS)', () => {
    expect(buildSslConfig(NEON, {})).toEqual({ rejectUnauthorized: true });
    expect(buildSslConfig(SUPABASE, {})).toEqual({ rejectUnauthorized: true });
    expect(buildSslConfig(RDS, {})).toEqual({ rejectUnauthorized: true });
  });

  it('pins a CA bundle when DATABASE_CA_CERT is set', () => {
    const cfg = buildSslConfig(NEON, { DATABASE_CA_CERT: '-----BEGIN CERTIFICATE-----\nX\n-----END CERTIFICATE-----' });
    expect(cfg).toMatchObject({ rejectUnauthorized: true });
    expect((cfg as { ca: string }).ca).toContain('BEGIN CERTIFICATE');
  });

  it('allows an explicit, opt-in insecure escape hatch', () => {
    expect(buildSslConfig(RDS, { DATABASE_SSL_INSECURE: 'true' })).toEqual({ rejectUnauthorized: false });
  });
});
