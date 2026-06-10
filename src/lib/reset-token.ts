import crypto from 'crypto';

/** Generate a high-entropy password-reset token (the raw value emailed to the user). */
export function generateResetToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/** Hash a token for storage. We never store the raw token, only its SHA-256. */
export function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

export function isTokenExpired(expiresAt: Date, now: number = Date.now()): boolean {
  return expiresAt.getTime() <= now;
}
