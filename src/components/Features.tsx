'use client';

const painPoints = [
  {
    icon: '😵‍💫',
    text: 'Scrolling endlessly for content ideas and falling into procrastination',
  },
  {
    icon: '🤷',
    text: 'Not knowing which creators or competitors are actually worth paying attention to',
  },
  {
    icon: '📊',
    text: 'Choosing creators based on numbers without knowing how they compare in your niche',
  },
  {
    icon: '⏰',
    text: 'Manually checking accounts one by one with no easy way to compare performance',
  },
];

const features = [
  {
    number: '1',
    title: 'Track any public account',
    description: 'Monitor competitors, creators, and brands on Instagram and TikTok in one dashboard.',
    preview: '📱',
  },
  {
    number: '2',
    title: 'Decode the hooks with AI',
    description: 'The Hook Lab analyzes top posts and breaks down the hook type, format, and emotional trigger behind why each one went viral.',
    preview: '🪝',
  },
  {
    number: '3',
    title: 'Generate & execute',
    description: 'Generate hook scripts and a content playbook for your own niche, compare accounts side by side, and export the data.',
    preview: '📖',
  },
];

export default function Features() {
  return (
    <>
      {/* Pain Points Section */}
      <section id="features" className="py-16 px-4 bg-gray-50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center text-gray-900 mb-12">
            With Peakr you can stop:
          </h2>
          <div className="space-y-4">
            {painPoints.map((point, index) => (
              <div
                key={index}
                className="flex items-start space-x-4 bg-white rounded-xl p-6 card-shadow"
              >
                <span className="text-2xl">{point.icon}</span>
                <p className="text-gray-700 text-lg">{point.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
              Turn competitor data into your{' '}
              <span className="gradient-text">unfair advantage</span>
            </h2>
            <p className="mt-4 text-lg text-gray-600 max-w-2xl mx-auto">
              Peakr turns competitor content into sortable, exportable data so you
              can see what&apos;s actually working, fast.
            </p>
          </div>

          <div className="space-y-12">
            {features.map((feature, index) => (
              <div
                key={index}
                className={`flex flex-col ${
                  index % 2 === 0 ? 'lg:flex-row' : 'lg:flex-row-reverse'
                } items-center gap-8`}
              >
                <div className="flex-1">
                  <div className="bg-gradient-to-br from-purple-100 to-indigo-100 rounded-2xl p-8 h-64 flex items-center justify-center">
                    <span className="text-8xl">{feature.preview}</span>
                  </div>
                </div>
                <div className="flex-1 space-y-4">
                  <div className="flex items-center space-x-3">
                    <span className="gradient-bg text-white w-8 h-8 rounded-full flex items-center justify-center font-bold">
                      {feature.number}
                    </span>
                    <h3 className="text-2xl font-bold text-gray-900">{feature.title}</h3>
                  </div>
                  <p className="text-gray-600 text-lg">{feature.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
