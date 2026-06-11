import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import bcrypt from 'bcryptjs';
import { getPool } from '@/lib/db';
import { passwordError } from '@/lib/auth-validation';

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { currentPassword, newPassword } = await request.json();

  const pwError = passwordError(String(newPassword || ''));
  if (pwError) {
    return NextResponse.json({ error: pwError }, { status: 400 });
  }

  const pool = getPool();
  const { rows: [user] } = await pool.query(
    'SELECT password_hash FROM users WHERE id = $1',
    [session.user.id]
  );

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  // If user has an existing password, verify the current one
  if (user.password_hash) {
    if (!currentPassword) {
      return NextResponse.json({ error: 'Current password is required' }, { status: 400 });
    }
    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) {
      return NextResponse.json({ error: 'Current password is incorrect' }, { status: 403 });
    }
  }

  const newHash = await bcrypt.hash(newPassword, 12);
  // Bump token_version to revoke any other sessions (a changed password should
  // log out the compromised session everywhere).
  await pool.query(
    'UPDATE users SET password_hash = $1, token_version = token_version + 1 WHERE id = $2',
    [newHash, session.user.id]
  );

  return NextResponse.json({ success: true });
}
