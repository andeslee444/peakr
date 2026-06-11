/**
 * Pure NextAuth callback helpers, kept out of `auth.ts` so they can be unit
 * tested without booting NextAuth (which needs env + provider config).
 */
import { normalizePlan, type Plan } from './plan';

export interface ShapedSessionUser {
  id?: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  plan?: Plan;
  onboardingComplete?: boolean;
}

export interface ShapedSession {
  user?: ShapedSessionUser | null;
}

type TokenLike = { userId?: unknown; username?: unknown; plan?: unknown; [key: string]: unknown };

/**
 * Copy identity + subscription plan from the JWT onto the session user so the
 * client can gate UI (e.g. hide the upgrade banner for pro users). Plan is
 * normalized — an unknown value is treated as `free`. Mutates and returns the
 * same session object.
 */
/**
 * Whether a JWT is still valid given the user's current token version. A
 * password change bumps the DB version, so older tokens (issued before the
 * change) no longer match and are treated as revoked. Missing values are 0, so
 * pre-feature tokens stay valid until the first real change.
 */
export function sessionStillValid(tokenVersion: unknown, currentVersion: unknown): boolean {
  return Number(tokenVersion ?? 0) === Number(currentVersion ?? 0);
}

export function shapeSession<T extends { user?: { name?: string | null } | null }>(
  session: T,
  token: TokenLike
): T & ShapedSession {
  const user = session.user as ShapedSessionUser | null | undefined;
  if (user) {
    if (token.userId) user.id = String(token.userId);
    if (token.username) user.name = String(token.username);
    user.plan = normalizePlan(token.plan);
    user.onboardingComplete = token.onboardingComplete === true;
  }
  return session as T & ShapedSession;
}
