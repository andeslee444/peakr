/**
 * Decide the pg `ssl` option for a connection. Pure + env-injected so it can be
 * unit-tested.
 *
 * For AWS RDS hosts we verify the server certificate by default (previously the
 * code used `rejectUnauthorized: false`, which silently accepted any cert and
 * left the connection open to MITM). Newer RDS certificates chain to Amazon Root
 * CA 1, which is in Node's trust store. To pin the RDS CA bundle explicitly, set
 * DATABASE_CA_CERT to its PEM contents. DATABASE_SSL_INSECURE=true is an explicit,
 * discouraged escape hatch.
 */
export type SslEnv = Record<string, string | undefined>;

export type SslConfig = false | { ca?: string; rejectUnauthorized: boolean };

export function buildSslConfig(databaseUrl: string | undefined, env: SslEnv): SslConfig {
  const isRds = !!databaseUrl && databaseUrl.includes('rds.amazonaws.com');
  if (!isRds) {
    return false;
  }
  if (env.DATABASE_CA_CERT) {
    return { ca: env.DATABASE_CA_CERT, rejectUnauthorized: true };
  }
  if (env.DATABASE_SSL_INSECURE === 'true') {
    return { rejectUnauthorized: false };
  }
  return { rejectUnauthorized: true };
}
