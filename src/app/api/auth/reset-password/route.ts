import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getPool } from '@/lib/db';
import { passwordError } from '@/lib/auth-validation';
import { hashToken } from '@/lib/reset-token';
import { enforceRateLimit } from '@/lib/rate-limit';

export async function POST(request: Request) {
  const limited = enforceRateLimit(request, 'reset-password', 10, 15 * 60_000);
  if (limited) return limited;

  const { token, password } = await request.json();

  if (!token || typeof token !== 'string') {
    return NextResponse.json({ error: 'Invalid or expired reset link' }, { status: 400 });
  }
  const pwError = passwordError(String(password || ''));
  if (pwError) {
    return NextResponse.json({ error: pwError }, { status: 400 });
  }

  const pool = getPool();
  const { rows: [row] } = await pool.query(
    `SELECT id, user_id FROM password_reset_tokens
     WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()`,
    [hashToken(token)]
  );

  if (!row) {
    return NextResponse.json({ error: 'Invalid or expired reset link' }, { status: 400 });
  }

  const newHash = await bcrypt.hash(password, 12);
  await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, row.user_id]);
  await pool.query('UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1', [row.id]);

  return NextResponse.json({ ok: true });
}
