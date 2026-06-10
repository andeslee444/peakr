/**
 * Decide the pg `ssl` option for a connection. Pure + env-injected so it can be
 * unit-tested.
 *
 * Provider-agnostic: any remote host (Neon, Supabase, RDS, …) gets its server
 * certificate verified. Local connections (localhost/127.0.0.1/::1) use no SSL.
 * Previously this only verified RDS hosts and returned `false` for everything
 * else — which would disable SSL against providers like Neon that require it.
 *
 * - DATABASE_CA_CERT: pin a specific CA bundle (PEM).
 * - DATABASE_SSL_INSECURE=true: explicit, discouraged escape hatch.
 */
export type SslEnv = Record<string, string | undefined>;

export type SslConfig = false | { ca?: string; rejectUnauthorized: boolean };

function isLocalHost(databaseUrl: string): boolean {
  let host = '';
  try {
    host = new URL(databaseUrl).hostname.toLowerCase();
  } catch {
    return false;
  }
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '';
}

export function buildSslConfig(databaseUrl: string | undefined, env: SslEnv): SslConfig {
  // No DB configured, or a local dev database → no SSL.
  if (!databaseUrl || isLocalHost(databaseUrl)) {
    return false;
  }
  // Pin a specific CA bundle if provided.
  if (env.DATABASE_CA_CERT) {
    return { ca: env.DATABASE_CA_CERT, rejectUnauthorized: true };
  }
  // Explicit, discouraged opt-out.
  if (env.DATABASE_SSL_INSECURE === 'true') {
    return { rejectUnauthorized: false };
  }
  // Any remote managed provider (Neon, Supabase, RDS, …): verify the cert.
  return { rejectUnauthorized: true };
}
