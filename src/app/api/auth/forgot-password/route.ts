import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { normalizeEmail, isValidEmail } from '@/lib/auth-validation';
import { generateResetToken, hashToken } from '@/lib/reset-token';
import { sendEmail } from '@/lib/email';
import { enforceRateLimit } from '@/lib/rate-limit';

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

export async function POST(request: Request) {
  const limited = enforceRateLimit(request, 'forgot-password', 5, 15 * 60_000);
  if (limited) return limited;

  // Always return the same generic response so callers can't tell whether an
  // email is registered.
  const generic = NextResponse.json({
    ok: true,
    message: 'If an account exists for that email, a reset link has been sent.',
  });

  try {
    const { email } = await request.json();
    const normalized = normalizeEmail(String(email || ''));
    if (!isValidEmail(normalized)) return generic;

    const pool = getPool();
    const { rows: [user] } = await pool.query('SELECT id FROM users WHERE email = $1', [normalized]);
    if (!user) return generic;

    const token = generateResetToken();
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();
    await pool.query(
      'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [user.id, hashToken(token), expiresAt]
    );

    const base = process.env.AUTH_URL || new URL(request.url).origin;
    const link = `${base}/reset-password?token=${token}`;
    await sendEmail({
      to: normalized,
      subject: 'Reset your Peakr password',
      html: `<p>Reset your password with the link below (valid for 1 hour):</p>
             <p><a href="${link}">${link}</a></p>
             <p>If you didn't request this, you can ignore this email.</p>`,
    });

    return generic;
  } catch {
    // Never leak failures here either.
    return generic;
  }
}
