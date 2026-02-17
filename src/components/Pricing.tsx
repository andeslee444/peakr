'use client';

import Link from 'next/link';

const plans = [
  {
    name: 'Monthly',
    tagline: 'Perfect for trying out Peakr',
    badge: '50% off month 1',
    price: '$12',
    period: '/first month',
    afterPrice: 'Then $24/month',
    features: [
      'Track 15 accounts',
      'Save Instagram & TikTok content',
      'Export viral content',
      'Email support',
    ],
    cta: 'Go Viral',
    popular: false,
  },
  {
    name: 'Annual',
    tagline: 'Best value for serious creators',
    badge: 'Save 60%',
    price: '$10',
    period: '/month',
    afterPrice: 'Billed annually at $120',
    features: [
      'Track 50 accounts',
      'Save Instagram & TikTok content',
      'Export viral content',
      'Priority email support',
      'Save $168 with annual',
    ],
    cta: 'Go Really Viral',
    popular: true,
  },
];

export default function Pricing() {
  return (
    <section id="pricing" className="py-20 px-4 bg-gray-50">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
            Get ahead of your competition with{' '}
            <span className="gradient-text">data-backed</span> content decisions.
          </h2>
          <p className="mt-4 text-lg text-gray-600">
            Built for creators, brands, and teams who care about performance.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {plans.map((plan, index) => (
            <div
              key={index}
              className={`relative bg-white rounded-2xl p-8 ${
                plan.popular
                  ? 'ring-2 ring-indigo-500 shadow-xl'
                  : 'card-shadow'
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                  <span className="gradient-bg text-white text-sm font-semibold px-4 py-1 rounded-full">
                    {plan.badge}
                  </span>
                </div>
              )}
              
              {!plan.popular && plan.badge && (
                <span className="inline-block bg-amber-100 text-amber-700 text-sm font-semibold px-3 py-1 rounded-full mb-4">
                  {plan.badge}
                </span>
              )}

              <h3 className="text-2xl font-bold text-gray-900">{plan.name}</h3>
              <p className="text-gray-600 mt-1">{plan.tagline}</p>

              <div className="mt-6">
                <span className="text-4xl font-bold text-gray-900">{plan.price}</span>
                <span className="text-gray-600">{plan.period}</span>
              </div>
              <p className="text-sm text-gray-500 mt-1">{plan.afterPrice}</p>

              <ul className="mt-6 space-y-3">
                {plan.features.map((feature, i) => (
                  <li key={i} className="flex items-center space-x-3">
                    <svg
                      className="w-5 h-5 text-green-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    <span className="text-gray-700">{feature}</span>
                  </li>
                ))}
              </ul>

              <Link
                href="/signup"
                className={`mt-8 block text-center py-3 px-6 rounded-full font-semibold transition-all ${
                  plan.popular
                    ? 'gradient-bg text-white hover:opacity-90'
                    : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                }`}
              >
                {plan.cta}
              </Link>

              <p className="text-center text-sm text-gray-500 mt-4">
                {plan.popular ? plan.afterPrice : 'Cancel anytime'}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
