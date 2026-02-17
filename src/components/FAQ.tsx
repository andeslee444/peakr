'use client';

import { useState } from 'react';

const faqs = [
  {
    question: 'What is Peakr?',
    answer: 'Peakr is an Instagram and TikTok account tracking tool. It lets you track any public creator or brand account to see which posts, formats and creators are outperforming, using real performance data. Find the peak performers in any niche.',
  },
  {
    question: 'Who is Peakr for?',
    answer: 'Peakr is built for content creators, small business owners, social media managers, ecommerce brands, agencies and influencer marketing teams. If content plays a key role in your business and you want clearer, more predictable results without guesswork, Peakr is for you.',
  },
  {
    question: 'What problem does Peakr solve?',
    answer: 'Peakr replaces hours of manual research. Stop endless scrolling and guessing what might work. Track any public account, sort by best performance, see which formats and sounds drive results, compare creators side by side, and export the data to Excel — all in one place.',
  },
  {
    question: 'Can I track any public Instagram or TikTok account?',
    answer: 'Yes. You can track any public creator or brand account of your choice. No login, permission or approval from the account owner is required.',
  },
  {
    question: 'How does Peakr help me day to day?',
    answer: 'Most users use Peakr to research content ideas before posting, monitor competitors weekly, review influencer performance in one place, save winning formats and plan content with confidence. It replaces hours of manual checking and comparison.',
  },
  {
    question: 'Is using Peakr allowed by Instagram and TikTok?',
    answer: 'Yes. Peakr only analyzes publicly available content, similar to social listening and competitor research tools. It does not access private data, require passwords or connect directly to your social accounts.',
  },
  {
    question: 'What does the viral score mean on Peakr?',
    answer: 'Peakr analyzes public performance signals such as views, engagement, relative performance and content format patterns to give viral scores. The focus is on identifying outperforming posts and momentum relative to the tracked content creator\'s average performance.',
  },
  {
    question: 'Is there a discount and can I cancel anytime?',
    answer: 'Yes. The monthly plan includes 50% off for month 1 at checkout. You can cancel your subscription at any time.',
  },
];

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section className="py-20 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
            <span className="gradient-text">Frequently</span> Asked Questions
          </h2>
          <p className="mt-4 text-lg text-gray-600">
            Detailed answers to help you understand the platform better.
          </p>
        </div>

        <div className="space-y-4">
          {faqs.map((faq, index) => (
            <div
              key={index}
              className="bg-white rounded-xl card-shadow overflow-hidden"
            >
              <button
                className="w-full px-6 py-4 text-left flex items-center justify-between"
                onClick={() => setOpenIndex(openIndex === index ? null : index)}
              >
                <span className="font-semibold text-gray-900">{faq.question}</span>
                <svg
                  className={`w-5 h-5 text-gray-500 transform transition-transform ${
                    openIndex === index ? 'rotate-180' : ''
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>
              {openIndex === index && (
                <div className="px-6 pb-4">
                  <p className="text-gray-600">{faq.answer}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
