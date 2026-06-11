/**
 * Minimal transactional email via the Resend REST API (no SDK dependency).
 * Gated on RESEND_API_KEY: when unset, sending is a logged no-op so the app
 * runs in dev/CI without email configured.
 */
export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
}

export interface SendEmailResult {
  sent: boolean;
  reason?: string;
}

/**
 * Whether transactional email can actually be delivered. This is a *global*
 * fact (does the deployment have an API key?), independent of any specific
 * recipient — so callers can surface "email unavailable" without leaking
 * whether a given account exists.
 */
export function isEmailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

export async function sendEmail({ to, subject, html }: SendEmailParams): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || 'Peakr <noreply@peakr.app>';

  if (!apiKey) {
    console.warn('[email] RESEND_API_KEY not set; skipping email');
    return { sent: false, reason: 'no_api_key' };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to, subject, html }),
    });
    if (!res.ok) {
      console.error('[email] Resend send failed', res.status);
      return { sent: false, reason: `http_${res.status}` };
    }
    return { sent: true };
  } catch (e) {
    console.error('[email] Resend send error', e);
    return { sent: false, reason: 'exception' };
  }
}
