import Link from 'next/link';

export const metadata = { title: 'Terms of Service — Peakr' };

export default function TermsPage() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-16 text-gray-800">
      <Link href="/" className="text-indigo-600 hover:text-indigo-500 text-sm">← Back to Peakr</Link>
      <h1 className="text-3xl font-bold mt-4 mb-2">Terms of Service</h1>
      <p className="text-sm text-gray-500 mb-8">Last updated: 2026-06-10</p>

      <div className="prose prose-sm max-w-none space-y-4">
        <p className="text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
          This is a starting template. Have it reviewed by legal counsel before launch.
        </p>

        <h2 className="text-xl font-semibold">Using Peakr</h2>
        <p>
          Peakr helps you track and analyze public Instagram and TikTok content. You
          agree to use it lawfully and not to abuse the service (including automated
          scraping beyond the features we provide, or attempting to disrupt it).
        </p>

        <h2 className="text-xl font-semibold">Accounts</h2>
        <p>
          You are responsible for keeping your login credentials secure and for
          activity under your account.
        </p>

        <h2 className="text-xl font-semibold">Subscriptions</h2>
        <p>
          Paid plans are billed through Stripe. You can cancel at any time; access
          continues through the end of the paid period.
        </p>

        <h2 className="text-xl font-semibold">Content &amp; third parties</h2>
        <p>
          Peakr surfaces publicly available content from third-party platforms. We
          are not affiliated with TikTok or Instagram, and your use of their content
          remains subject to their terms.
        </p>

        <h2 className="text-xl font-semibold">Disclaimer</h2>
        <p>
          Peakr is provided &quot;as is&quot; without warranties. Contact us at{' '}
          <a href="mailto:support@peakr.app" className="text-indigo-600">support@peakr.app</a>.
        </p>
      </div>
    </main>
  );
}
