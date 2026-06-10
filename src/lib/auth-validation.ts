/** Email + password validation shared by signup, login, and password change. */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Canonical email form: trimmed + lowercased. Prevents case-variant duplicate
 *  accounts and login lockouts (e.g. Foo@x.com vs foo@x.com). */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email);
}

/** Returns a human-readable error if the password is too weak, else null. */
export function passwordError(password: string): string | null {
  if (!password || password.length < 8) {
    return 'Password must be at least 8 characters';
  }
  if (!/[a-zA-Z]/.test(password)) {
    return 'Password must contain a letter';
  }
  if (!/[0-9]/.test(password)) {
    return 'Password must contain a number';
  }
  return null;
}
