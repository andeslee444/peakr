'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

const NICHES = [
  'fitness', 'finance', 'business', 'beauty', 'food', 'comedy',
  'lifestyle', 'health', 'fashion', 'tech', 'real-estate',
  'education', 'motivation', 'travel', 'parenting',
];

const CONTENT_STYLES = [
  'educational', 'entertaining', 'storytelling', 'motivational', 'mixed',
];

function getFallbackQuestions(niche: string, contentStyle: string): string[] {
  const nicheLabel = niche || 'your field';
  return [
    `What makes you the right person to talk about ${nicheLabel}? (doesn't have to be formal — life experience counts!)`,
    `What's a story or moment from your ${contentStyle || ''} journey that your audience would relate to?`,
    `What do you wish more people understood about ${nicheLabel}?`,
  ];
}

interface CreatorProfile {
  niche: string | null;
  content_style: string | null;
  target_audience: string | null;
  unique_angle: string | null;
  content_topics: string | null;
  platforms: string[] | string | null;
  inspiration_creators: string[] | string | null;
  background_qa: { q: string; a: string }[] | string | null;
  onboarding_step: string;
  completed_at: string | null;
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<CreatorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<'round1' | 'round2' | 'complete'>('round1');

  // Round 1 fields
  const [niche, setNiche] = useState('');
  const [customNiche, setCustomNiche] = useState('');
  const [contentStyle, setContentStyle] = useState('');
  const [targetAudience, setTargetAudience] = useState('');
  const [uniqueAngle, setUniqueAngle] = useState('');
  const [contentTopics, setContentTopics] = useState('');
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [inspirationCreators, setInspirationCreators] = useState('');

  // Round 2 fields
  const [questions, setQuestions] = useState<string[]>([]);
  const [answers, setAnswers] = useState<string[]>([]);
  const [generatingQuestions, setGeneratingQuestions] = useState(false);
  const [questionError, setQuestionError] = useState(false);

  // Typewriter effect state
  const [revealedChars, setRevealedChars] = useState<number[]>([]);
  const [typingDone, setTypingDone] = useState(false);
  const shouldTypewrite = useRef(false);

  // Drive typewriter animation
  useEffect(() => {
    if (!shouldTypewrite.current || questions.length === 0 || typingDone) return;

    // Initialize revealed chars to 0 for each question
    if (revealedChars.length !== questions.length) {
      setRevealedChars(new Array(questions.length).fill(0));
      return;
    }

    // Find the current question being typed
    const currentQ = revealedChars.findIndex((chars, i) => chars < questions[i].length);
    if (currentQ === -1) {
      // All questions fully revealed
      setTypingDone(true);
      shouldTypewrite.current = false;
      return;
    }

    const timer = setTimeout(() => {
      setRevealedChars(prev => {
        const next = [...prev];
        // Type 2-3 chars at a time for faster speed
        next[currentQ] = Math.min(prev[currentQ] + 2 + Math.floor(Math.random() * 2), questions[currentQ].length);
        return next;
      });
    }, 12 + Math.random() * 8); // 12-20ms per tick, typing 2-3 chars each

    return () => clearTimeout(timer);
  }, [questions, revealedChars, typingDone]);

  const fetchProfile = useCallback(async () => {
    try {
      const res = await fetch('/api/creator-profile');
      const data = await res.json();
      if (data.profile) {
        setProfile(data.profile);
        const p = data.profile;
        setNiche(p.niche || '');
        setContentStyle(p.content_style || '');
        setTargetAudience(p.target_audience || '');
        setUniqueAngle(p.unique_angle || '');
        setContentTopics(p.content_topics || '');

        const parsedPlatforms = typeof p.platforms === 'string' ? JSON.parse(p.platforms) : p.platforms;
        setPlatforms(parsedPlatforms || []);

        const parsedInspo = typeof p.inspiration_creators === 'string' ? JSON.parse(p.inspiration_creators) : p.inspiration_creators;
        setInspirationCreators(parsedInspo?.join(', ') || '');

        const parsedQA = typeof p.background_qa === 'string' ? JSON.parse(p.background_qa) : p.background_qa;
        if (parsedQA && parsedQA.length > 0) {
          setQuestions(parsedQA.map((qa: { q: string }) => qa.q));
          setAnswers(parsedQA.map((qa: { a: string }) => qa.a));
        }

        if (p.onboarding_step === 'complete') {
          setStep('complete');
        } else if (p.onboarding_step === 'round2') {
          setStep('round2');
        } else {
          setStep('round1');
        }
      }
    } catch (e) {
      console.error('Failed to fetch profile:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  const saveProfile = async (data: Record<string, unknown>) => {
    setSaving(true);
    try {
      const res = await fetch('/api/creator-profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await res.json();
      if (result.profile) setProfile(result.profile);
      return result;
    } catch (e) {
      console.error('Failed to save profile:', e);
    } finally {
      setSaving(false);
    }
  };

  const submittingRound1 = useRef(false);

  const handleRound1Submit = async () => {
    if (submittingRound1.current) return; // prevent double-click
    submittingRound1.current = true;

    const effectiveNiche = niche === 'other' ? customNiche : niche;
    const inspoArray = inspirationCreators
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    // Immediately go to Round 2 with loading spinner
    setGeneratingQuestions(true);
    setQuestionError(false);
    setStep('round2');

    // Save profile and generate questions in parallel
    const [, questionsResult] = await Promise.all([
      saveProfile({
        niche: effectiveNiche,
        content_style: contentStyle,
        target_audience: targetAudience,
        unique_angle: uniqueAngle,
        content_topics: contentTopics,
        platforms,
        inspiration_creators: inspoArray,
        onboarding_step: 'round2',
      }),
      fetch('/api/creator-profile/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          niche: effectiveNiche,
          content_style: contentStyle,
          target_audience: targetAudience,
          unique_angle: uniqueAngle,
          content_topics: contentTopics,
        }),
      }).then(r => r.json()).catch(() => null),
    ]);

    let gotQuestions = false;
    if (questionsResult?.questions?.length > 0) {
      setQuestions(questionsResult.questions);
      setAnswers(new Array(questionsResult.questions.length).fill(''));
      gotQuestions = true;
    }

    // Fallback: if AI didn't return questions, use smart defaults
    if (!gotQuestions) {
      const fallback = getFallbackQuestions(effectiveNiche, contentStyle);
      setQuestions(fallback);
      setAnswers(new Array(fallback.length).fill(''));
      setQuestionError(true);
    }

    setGeneratingQuestions(false);
    // Trigger typewriter effect for fresh questions
    shouldTypewrite.current = true;
    setTypingDone(false);
    setRevealedChars([]);
    submittingRound1.current = false;
  };

  const handleRound2Submit = async () => {
    const backgroundQA = questions.map((q, i) => ({ q, a: answers[i] || '' }));

    await saveProfile({
      background_qa: backgroundQA,
      onboarding_step: 'complete',
    });

    setStep('complete');
  };

  const handleEditProfile = () => {
    setStep('round1');
  };

  const togglePlatform = (p: string) => {
    setPlatforms(prev =>
      prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  // Complete state
  if (step === 'complete') {
    const effectiveNiche = niche === 'other' ? customNiche : niche;
    const parsedPlatforms = typeof profile?.platforms === 'string'
      ? JSON.parse(profile.platforms)
      : profile?.platforms;
    const parsedQA = typeof profile?.background_qa === 'string'
      ? JSON.parse(profile.background_qa)
      : profile?.background_qa;

    return (
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Your Creator Profile</h1>
          <button
            onClick={handleEditProfile}
            className="px-4 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors"
          >
            Edit Profile
          </button>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-6">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="text-sm text-gray-500">Niche</p>
              <p className="font-medium text-gray-900 capitalize">{profile?.niche || effectiveNiche}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Content Style</p>
              <p className="font-medium text-gray-900 capitalize">{profile?.content_style || contentStyle}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Target Audience</p>
              <p className="font-medium text-gray-900">{profile?.target_audience || targetAudience}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Platforms</p>
              <p className="font-medium text-gray-900 capitalize">
                {(parsedPlatforms || platforms)?.join(', ') || 'None'}
              </p>
            </div>
          </div>

          {(profile?.unique_angle || uniqueAngle) && (
            <div>
              <p className="text-sm text-gray-500">Unique Angle</p>
              <p className="font-medium text-gray-900">{profile?.unique_angle || uniqueAngle}</p>
            </div>
          )}

          {(profile?.content_topics || contentTopics) && (
            <div>
              <p className="text-sm text-gray-500">Content Topics</p>
              <p className="font-medium text-gray-900">{profile?.content_topics || contentTopics}</p>
            </div>
          )}

          {parsedQA && parsedQA.length > 0 && (
            <div className="border-t pt-6">
              <h3 className="font-semibold text-gray-900 mb-4">Background Details</h3>
              <div className="space-y-4">
                {parsedQA.map((qa: { q: string; a: string }, i: number) => (
                  <div key={i}>
                    <p className="text-sm text-gray-500">{qa.q}</p>
                    <p className="font-medium text-gray-900">{qa.a}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="border-t pt-6">
            <a
              href="/dashboard/playbook"
              className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition-colors"
            >
              View Your Playbook
              <span>&rarr;</span>
            </a>
          </div>
        </div>
      </div>
    );
  }

  // Round 2 — AI-generated questions
  if (step === 'round2') {
    return (
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Let&apos;s personalize your playbook</h1>
        <p className="text-gray-500 mb-8">
          Based on what you told us, we have a few more questions to help generate better hook templates.
        </p>

        {generatingQuestions ? (
          <div className="flex items-center gap-3 py-12 justify-center text-gray-500">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-indigo-600" />
            Generating personalized questions...
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-6">
            {questionError && (
              <div className="text-sm text-amber-600 bg-amber-50 px-4 py-2 rounded-lg">
                We couldn&apos;t generate AI-tailored questions right now, but these defaults will still help personalize your playbook.
              </div>
            )}

            {questions.map((q, i) => {
              const isTypewriting = shouldTypewrite.current && !typingDone;
              const chars = revealedChars[i] ?? q.length;
              const fullyRevealed = chars >= q.length;
              const isCurrentlyTyping = isTypewriting && !fullyRevealed && (i === 0 || (revealedChars[i - 1] ?? 0) >= questions[i - 1].length);
              const hasStarted = !isTypewriting || chars > 0 || i === 0 || (revealedChars[i - 1] ?? 0) >= questions[i - 1].length;

              if (!hasStarted && isTypewriting) return null;

              return (
                <div
                  key={i}
                  className="transition-opacity duration-300"
                  style={{ opacity: hasStarted ? 1 : 0 }}
                >
                  <label className="block text-sm font-medium text-gray-700 mb-2 min-h-[1.25rem]">
                    {isTypewriting ? (
                      <>
                        {q.slice(0, chars)}
                        {isCurrentlyTyping && (
                          <span className="inline-block w-0.5 h-4 bg-indigo-500 ml-0.5 animate-pulse align-text-bottom" />
                        )}
                      </>
                    ) : (
                      q
                    )}
                  </label>
                  <div
                    className="transition-all duration-500 overflow-hidden"
                    style={{
                      maxHeight: fullyRevealed || !isTypewriting ? '200px' : '0px',
                      opacity: fullyRevealed || !isTypewriting ? 1 : 0,
                    }}
                  >
                    <textarea
                      value={answers[i] || ''}
                      onChange={(e) => {
                        const newAnswers = [...answers];
                        newAnswers[i] = e.target.value;
                        setAnswers(newAnswers);
                      }}
                      rows={3}
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none text-gray-900"
                      placeholder="Your answer..."
                    />
                  </div>
                </div>
              );
            })}

            <div
              className="flex items-center gap-3 pt-2 transition-opacity duration-500"
              style={{ opacity: typingDone || !shouldTypewrite.current ? 1 : 0 }}
            >
              <button
                onClick={() => setStep('round1')}
                className="px-6 py-3 text-gray-600 font-medium hover:text-gray-800"
              >
                &larr; Back
              </button>
              <button
                onClick={handleRound2Submit}
                disabled={saving || answers.every(a => !a.trim())}
                className="flex-1 px-6 py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Complete Profile \u2192'}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Round 1 — Basic info
  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Tell us about your content</h1>
      <p className="text-gray-500 mb-8">
        We&apos;ll use this to personalize hook templates in your playbook.
      </p>

      <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-6">
        {/* Niche */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            What&apos;s your niche/topic?
          </label>
          <select
            value={niche}
            onChange={(e) => setNiche(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white text-gray-900"
          >
            <option value="">Select a niche...</option>
            {NICHES.map(n => (
              <option key={n} value={n} className="capitalize">{n}</option>
            ))}
            <option value="other">Other</option>
          </select>
          {niche === 'other' && (
            <input
              type="text"
              value={customNiche}
              onChange={(e) => setCustomNiche(e.target.value)}
              placeholder="Enter your niche..."
              className="mt-2 w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
            />
          )}
        </div>

        {/* Content Style */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            What&apos;s your content style?
          </label>
          <div className="flex flex-wrap gap-2">
            {CONTENT_STYLES.map(s => (
              <button
                key={s}
                onClick={() => setContentStyle(s)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors capitalize ${
                  contentStyle === s
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Target Audience */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Who&apos;s your target audience?
          </label>
          <input
            type="text"
            value={targetAudience}
            onChange={(e) => setTargetAudience(e.target.value)}
            placeholder='e.g., "College students interested in investing"'
            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
          />
        </div>

        {/* Unique Angle — Textarea for 3 lines */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            What&apos;s your unique angle or background?
          </label>
          <textarea
            value={uniqueAngle}
            onChange={(e) => setUniqueAngle(e.target.value)}
            placeholder={'e.g., "I\'m a nurse who left the hospital to teach wellness online. I bring real medical knowledge but explain it in simple, relatable terms that anyone can follow."'}
            rows={3}
            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none text-gray-900"
          />
        </div>

        {/* Content Topics */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            What specific topics do you want to make content about?
          </label>
          <textarea
            value={contentTopics}
            onChange={(e) => setContentTopics(e.target.value)}
            placeholder={'e.g., "Meal prep for busy professionals, debunking fad diets, simple home workouts, mental health and fitness connection"'}
            rows={3}
            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none text-gray-900"
          />
        </div>

        {/* Platforms */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            What platforms do you post on?
          </label>
          <div className="flex gap-3">
            {['tiktok', 'instagram'].map(p => (
              <button
                key={p}
                onClick={() => togglePlatform(p)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl border transition-colors capitalize ${
                  platforms.includes(p)
                    ? 'border-indigo-600 bg-indigo-50 text-indigo-600'
                    : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                <span>{p === 'tiktok' ? '🎵' : '📸'}</span>
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Inspiration Creators */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Any creators you admire? <span className="text-gray-400">(optional)</span>
          </label>
          <input
            type="text"
            value={inspirationCreators}
            onChange={(e) => setInspirationCreators(e.target.value)}
            placeholder='e.g., "@alexhormozi, @melrobbins"'
            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
          />
        </div>

        {/* Submit */}
        <button
          onClick={handleRound1Submit}
          disabled={saving || generatingQuestions || (!niche && !customNiche) || !contentStyle}
          className="w-full px-6 py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50"
        >
          {saving || generatingQuestions ? 'Saving...' : 'Continue \u2192'}
        </button>
      </div>
    </div>
  );
}
