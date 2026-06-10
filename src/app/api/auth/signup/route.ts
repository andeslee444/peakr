import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getPool } from '@/lib/db';
import { normalizeEmail, isValidEmail, passwordError } from '@/lib/auth-validation';

export async function POST(request: Request) {
  const { email, password, name } = await request.json();

  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
  }

  const normalized = normalizeEmail(String(email));
  if (!isValidEmail(normalized)) {
    return NextResponse.json({ error: 'Please enter a valid email address' }, { status: 400 });
  }

  const pwError = passwordError(String(password));
  if (pwError) {
    return NextResponse.json({ error: pwError }, { status: 400 });
  }

  const pool = getPool();

  // Check if email already exists (normalized, case-insensitive)
  const { rows: existing } = await pool.query(
    'SELECT id FROM users WHERE email = $1',
    [normalized]
  );

  if (existing.length > 0) {
    return NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await pool.query(
    `INSERT INTO users (email, password_hash, display_name, last_login_at)
     VALUES ($1, $2, $3, NOW())`,
    [normalized, passwordHash, name || null]
  );

  return NextResponse.json({ success: true });
}
