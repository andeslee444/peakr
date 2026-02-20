'use client';

import { useState, useEffect, useCallback } from 'react';

const NICHES = [
  'fitness', 'finance', 'business', 'beauty', 'food', 'comedy',
  'lifestyle', 'health', 'fashion', 'tech', 'real-estate',
  'education', 'motivation', 'travel', 'parenting',
];

const CONTENT_STYLES = [
  'educational', 'entertaining', 'storytelling', 'motivational', 'mixed',
];

interface CreatorProfile {
  niche: string | null;
  content_style: string | null;
  target_audience: string | null;
  unique_angle: string | null;
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
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [inspirationCreators, setInspirationCreators] = useState('');

  // Round 2 fields
  const [questions, setQuestions] = useState<string[]>([]);
  const [answers, setAnswers] = useState<string[]>([]);
  const [generatingQuestions, setGeneratingQuestions] = useState(false);

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

  const handleRound1Submit = async () => {
    const effectiveNiche = niche === 'other' ? customNiche : niche;
    const inspoArray = inspirationCreators
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    await saveProfile({
      niche: effectiveNiche,
      content_style: contentStyle,
      target_audience: targetAudience,
      unique_angle: uniqueAngle,
      platforms,
      inspiration_creators: inspoArray,
      onboarding_step: 'round2',
    });

    // Generate Round 2 questions
    setGeneratingQuestions(true);
    try {
      const res = await fetch('/api/creator-profile/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          niche: effectiveNiche,
          content_style: contentStyle,
          target_audience: targetAudience,
          unique_angle: uniqueAngle,
        }),
      });
      const data = await res.json();
      if (data.questions) {
        setQuestions(data.questions);
        setAnswers(new Array(data.questions.length).fill(''));
      }
    } catch (e) {
      console.error('Failed to generate questions:', e);
    } finally {
      setGeneratingQuestions(false);
    }

    setStep('round2');
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

          <div>
            <p className="text-sm text-gray-500">Unique Angle</p>
            <p className="font-medium text-gray-900">{profile?.unique_angle || uniqueAngle}</p>
          </div>

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
              <span>→</span>
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
            {questions.map((q, i) => (
              <div key={i}>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {q}
                </label>
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
            ))}

            <div className="flex items-center gap-3 pt-2">
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
                {saving ? 'Saving...' : 'Complete Profile →'}
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

        {/* Unique Angle */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            What&apos;s your unique angle or background?
          </label>
          <input
            type="text"
            value={uniqueAngle}
            onChange={(e) => setUniqueAngle(e.target.value)}
            placeholder={'e.g., "I\'m a nurse who teaches wellness"'}
            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
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
          disabled={saving || (!niche && !customNiche) || !contentStyle}
          className="w-full px-6 py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Continue →'}
        </button>
      </div>
    </div>
  );
}
