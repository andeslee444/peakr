import Link from 'next/link';

export const metadata = { title: 'Privacy Policy — Peakr' };

export default function PrivacyPage() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-16 text-gray-800">
      <Link href="/" className="text-indigo-600 hover:text-indigo-500 text-sm">← Back to Peakr</Link>
      <h1 className="text-3xl font-bold mt-4 mb-2">Privacy Policy</h1>
      <p className="text-sm text-gray-500 mb-8">Last updated: 2026-06-10</p>

      <div className="prose prose-sm max-w-none space-y-4">
        <p className="text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
          This is a starting template. Have it reviewed by legal counsel before launch.
        </p>

        <h2 className="text-xl font-semibold">What we collect</h2>
        <p>
          When you create an account we store your email address (or, if you sign in
          with TikTok, your TikTok profile basics: username, display name, avatar).
          We store the public social accounts you choose to track and the public
          content metrics we analyze for you.
        </p>

        <h2 className="text-xl font-semibold">How we use it</h2>
        <p>
          To operate Peakr: authenticating you, tracking the accounts you add,
          analyzing viral content, and generating your hook playbook. We do not sell
          your personal data.
        </p>

        <h2 className="text-xl font-semibold">Third parties</h2>
        <p>
          We use service providers including a cloud database (AWS), email delivery
          (Resend), payments (Stripe), error monitoring (Sentry), and AI model
          providers used to analyze content. Each processes data only to provide
          their service.
        </p>

        <h2 className="text-xl font-semibold">Your choices</h2>
        <p>
          You can update your details or change your password in Account settings,
          and delete your account at any time, which removes your personal data and
          your tracked-account links. Contact us at{' '}
          <a href="mailto:support@peakr.app" className="text-indigo-600">support@peakr.app</a>.
        </p>
      </div>
    </main>
  );
}
