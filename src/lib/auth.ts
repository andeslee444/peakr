import NextAuth from 'next-auth';
import TikTok from 'next-auth/providers/tiktok';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { getPool } from './db';

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
        if (!credentials?.email || !credentials?.password) return null;

        const pool = getPool();
        const { rows: [user] } = await pool.query(
          'SELECT id, email, password_hash, username, display_name FROM users WHERE email = $1',
          [credentials.email]
        );

        if (!user || !user.password_hash) return null;

        const valid = await bcrypt.compare(credentials.password as string, user.password_hash);
        if (!valid) return null;

        return {
          id: String(user.id),
          email: user.email,
          name: user.display_name || user.username || user.email,
        };
      },
    }),
  ],
  session: { strategy: 'jwt' },
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
      return token;
    },
    async session({ session, token }) {
      if (token.userId) {
        session.user.id = String(token.userId);
      }
      if (token.username) {
        session.user.name = token.username as string;
      }
      return session;
    },
  },
});
