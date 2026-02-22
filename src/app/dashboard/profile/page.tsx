'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { CreatorSuggestion } from '@/lib/types';
import { HookTypeBadge, HookScoreBadge } from '@/components/HookBadge';
import { formatNumber, proxyImg } from '@/lib/format';

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
  content_topics: string | null;
  platforms: string[] | string | null;
  inspiration_creators: string[] | string | null;
  onboarding_step: string;
  completed_at: string | null;
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<CreatorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<'round1' | 'suggestions' | 'complete'>('round1');

  // Suggestions state
  const [suggestions, setSuggestions] = useState<CreatorSuggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [suggestionActions, setSuggestionActions] = useState<Record<string, { tracked: boolean; hooksSaved: boolean }>>({});

  // Round 1 fields
  const [niche, setNiche] = useState('');
  const [customNiche, setCustomNiche] = useState('');
  const [contentStyle, setContentStyle] = useState('');
  const [targetAudience, setTargetAudience] = useState('');
  const [uniqueAngle, setUniqueAngle] = useState('');
  const [contentTopics, setContentTopics] = useState('');
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [inspirationCreators, setInspirationCreators] = useState('');


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

        if (p.onboarding_step === 'complete') {
          setStep('complete');
        } else if (p.onboarding_step === 'suggestions') {
          setStep('suggestions');
          fetchSuggestions(p);
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

  const fetchSuggestions = async (p?: CreatorProfile | null) => {
    const prof = p || profile;
    if (!prof) return;
    setLoadingSuggestions(true);
    try {
      const res = await fetch('/api/creator-profile/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          niche: prof.niche,
          content_style: prof.content_style,
          target_audience: prof.target_audience,
          unique_angle: prof.unique_angle,
          content_topics: prof.content_topics,
        }),
      });
      const data = await res.json();
      if (data.suggestions) setSuggestions(data.suggestions);
    } catch (e) {
      console.error('Failed to fetch suggestions:', e);
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const handleTrackCreator = async (username: string, platform: string, displayName: string | null, avatarUrl: string | null, followers: number) => {
    const key = `${username}:${platform}`;
    try {
      await fetch('/api/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          platform,
          display_name: displayName,
          avatar_url: avatarUrl,
          followers,
        }),
      });
      setSuggestionActions(prev => ({
        ...prev,
        [key]: { ...prev[key], tracked: true },
      }));
    } catch (e) {
      console.error('Failed to track creator:', e);
    }
  };

  const handleSaveHooks = async (username: string, platform: string, postIds: number[]) => {
    const key = `${username}:${platform}`;
    try {
      await Promise.all(postIds.map(post_id =>
        fetch('/api/user-hooks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ post_id }),
        })
      ));
      setSuggestionActions(prev => ({
        ...prev,
        [key]: { ...prev[key], hooksSaved: true },
      }));
    } catch (e) {
      console.error('Failed to save hooks:', e);
    }
  };

  const handleCompleteSuggestions = async () => {
    await saveProfile({ onboarding_step: 'complete' });
    setStep('complete');
  };

  const submittingRound1 = useRef(false);

  const handleRound1Submit = async () => {
    if (submittingRound1.current) return;
    submittingRound1.current = true;

    const effectiveNiche = niche === 'other' ? customNiche : niche;
    const inspoArray = inspirationCreators
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    setStep('suggestions');

    await saveProfile({
      niche: effectiveNiche,
      content_style: contentStyle,
      target_audience: targetAudience,
      unique_angle: uniqueAngle,
      content_topics: contentTopics,
      platforms,
      inspiration_creators: inspoArray,
      onboarding_step: 'suggestions',
    });

    fetchSuggestions();
    submittingRound1.current = false;
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

  // Creator suggestions
  if (step === 'suggestions') {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-2xl font-bold text-gray-900">Creators to study</h1>
          <button
            onClick={handleCompleteSuggestions}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Skip this step &rarr;
          </button>
        </div>
        <p className="text-gray-500 mb-8">
          Based on your profile, these creators use hook patterns you can learn from.
        </p>

        {loadingSuggestions ? (
          <div className="flex items-center gap-3 py-12 justify-center text-gray-500">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-indigo-600" />
            Finding creators that match your story...
          </div>
        ) : suggestions.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
            <p className="text-gray-500 mb-6">
              We don&apos;t have enough creator data in your niche yet. You can start tracking creators manually from the dashboard.
            </p>
            <button
              onClick={handleCompleteSuggestions}
              className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition-colors"
            >
              Complete Profile
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {suggestions.map((creator) => {
              const key = `${creator.username}:${creator.platform}`;
              const actions = suggestionActions[key] || { tracked: false, hooksSaved: false };
              const platformIcon = creator.platform === 'tiktok' ? '\uD83C\uDFB5' : '\uD83D\uDCF8';

              return (
                <div key={key} className="bg-white rounded-2xl border border-gray-200 p-6">
                  {/* Header */}
                  <div className="flex items-center gap-3 mb-3">
                    {creator.avatar_url ? (
                      <img
                        src={proxyImg(creator.avatar_url)}
                        alt={creator.username}
                        className="w-10 h-10 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-400 text-sm font-bold">
                        {creator.username[0]?.toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 truncate">
                        @{creator.username}
                      </p>
                      <p className="text-xs text-gray-500">
                        {platformIcon} {formatNumber(creator.followers)} followers
                      </p>
                    </div>
                  </div>

                  {/* Why text */}
                  {creator.why_text && (
                    <p className="text-sm text-gray-600 mb-4 italic">
                      &ldquo;{creator.why_text}&rdquo;
                    </p>
                  )}

                  {/* Top hooks */}
                  {creator.top_hooks.length > 0 && (
                    <div className="space-y-2 mb-4">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Top Hooks</p>
                      {creator.top_hooks.map((hook, i) => (
                        <div key={i} className="bg-gray-50 rounded-xl p-3">
                          <div className="flex items-center gap-2 mb-1">
                            <HookTypeBadge hookType={hook.hook_type} />
                            <HookScoreBadge score={hook.hook_score} />
                            <span className="text-[10px] text-gray-400 ml-auto">
                              {formatNumber(hook.views)} views
                            </span>
                          </div>
                          {hook.hook_template && (
                            <p className="text-sm text-gray-700">
                              &ldquo;{hook.hook_template}&rdquo;
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleTrackCreator(creator.username, creator.platform, creator.display_name, creator.avatar_url, creator.followers)}
                      disabled={actions.tracked}
                      className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
                        actions.tracked
                          ? 'bg-green-50 text-green-600'
                          : 'bg-indigo-600 text-white hover:bg-indigo-700'
                      }`}
                    >
                      {actions.tracked ? '\u2713 Tracked' : 'Track Creator'}
                    </button>
                    <button
                      onClick={() => handleSaveHooks(creator.username, creator.platform, creator.top_hooks.map(h => h.post_id))}
                      disabled={actions.hooksSaved || creator.top_hooks.length === 0}
                      className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
                        actions.hooksSaved
                          ? 'bg-green-50 text-green-600'
                          : 'bg-amber-500 text-white hover:bg-amber-600'
                      }`}
                    >
                      {actions.hooksSaved ? '\u2713 Hooks Saved' : 'Save Hooks'}
                    </button>
                  </div>
                </div>
              );
            })}

            <button
              onClick={handleCompleteSuggestions}
              className="w-full px-6 py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition-colors mt-6"
            >
              Complete Profile &rarr;
            </button>
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
          disabled={saving || (!niche && !customNiche) || !contentStyle}
          className="w-full px-6 py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Continue \u2192'}
        </button>
      </div>
    </div>
  );
}
