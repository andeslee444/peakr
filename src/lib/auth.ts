import NextAuth from 'next-auth';
import TikTok from 'next-auth/providers/tiktok';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { getPool } from './db';
import { normalizeEmail } from './auth-validation';
import { rateLimit } from './rate-limit';
import { normalizePlan } from './plan';
import { shapeSession, sessionStillValid } from './auth-callbacks';

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  providers: [
    TikTok,
    Credentials({
      name: 'Email',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        try {
          if (!credentials?.email || !credentials?.password) {
            return null;
          }

          // Normalize so case/whitespace variants resolve to the same account.
          const email = normalizeEmail(String(credentials.email));

          // Throttle brute-force / credential-stuffing per email.
          if (!rateLimit(`login:${email}`, 10, 15 * 60 * 1000).allowed) {
            return null;
          }

          const pool = getPool();
          const { rows: [user] } = await pool.query(
            'SELECT id, email, password_hash, username, display_name FROM users WHERE email = $1',
            [email]
          );

          // Same null result for every failure mode — no account enumeration,
          // no PII in logs.
          if (!user || !user.password_hash) {
            return null;
          }

          const valid = await bcrypt.compare(credentials.password as string, user.password_hash);
          if (!valid) {
            return null;
          }

          return {
            id: String(user.id),
            email: user.email,
            name: user.display_name || user.username || user.email,
          };
        } catch {
          console.error('[auth] authorize error');
          return null;
        }
      },
    }),
  ],
  session: { strategy: 'jwt', maxAge: 60 * 60 * 24 * 30 }, // 30-day bounded session lifetime
  pages: {
    signIn: '/login',
  },
  callbacks: {
    async signIn({ profile, account }) {
      // Only run TikTok upsert for TikTok OAuth
      if (account?.provider !== 'tiktok' || !profile) return true;

      const tiktokUser = (profile as { data?: { user?: Record<string, unknown> } }).data?.user;
      if (!tiktokUser) return true;

      const pool = getPool();
      await pool.query(
        `INSERT INTO users (tiktok_id, username, display_name, avatar_url, last_login_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (tiktok_id) DO UPDATE SET
           username = EXCLUDED.username,
           display_name = EXCLUDED.display_name,
           avatar_url = EXCLUDED.avatar_url,
           last_login_at = NOW()`,
        [
          tiktokUser.open_id as string,
          tiktokUser.username as string,
          tiktokUser.display_name as string,
          tiktokUser.avatar_url as string,
        ]
      );
      return true;
    },
    async jwt({ token, profile, user, account }) {
      // TikTok OAuth login
      if (account?.provider === 'tiktok' && profile) {
        const tiktokUser = (profile as { data?: { user?: Record<string, unknown> } }).data?.user;
        if (tiktokUser) {
          token.tiktokId = tiktokUser.open_id as string;
          token.username = tiktokUser.username as string;

          const pool = getPool();
          const { rows: [dbUser] } = await pool.query(
            'SELECT id FROM users WHERE tiktok_id = $1',
            [tiktokUser.open_id]
          );
          if (dbUser) {
            token.userId = dbUser.id;
          }
        }
      }
      // Credentials login
      if (account?.provider === 'credentials' && user) {
        token.userId = Number(user.id);
        token.username = user.name || user.email;
      }
      // On login (account present), stamp the live plan + token version once so
      // the client can gate UI without an extra round-trip. Enforcement still
      // reads the live plan server-side, so a later upgrade isn't blocked.
      if (account && token.userId) {
        const pool = getPool();
        const { rows: [u] } = await pool.query('SELECT plan, token_version FROM users WHERE id = $1', [token.userId]);
        token.plan = normalizePlan(u?.plan);
        token.tokenVersion = Number(u?.token_version ?? 0);
      } else if (token.userId) {
        // Subsequent requests: revoke the session if the password changed since
        // this token was issued (token_version bumped on change/reset).
        try {
          const pool = getPool();
          const { rows: [u] } = await pool.query('SELECT token_version FROM users WHERE id = $1', [token.userId]);
          if (u && !sessionStillValid(token.tokenVersion, u.token_version)) {
            delete token.userId;
          }
        } catch {
          // On a transient DB error, don't lock the user out — keep the session.
        }
      }
      return token;
    },
    async session({ session, token }) {
      return shapeSession(session, token);
    },
  },
});
