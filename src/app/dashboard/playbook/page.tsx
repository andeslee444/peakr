'use client';

import { useState, useEffect, useCallback } from 'react';

interface Template {
  script: string;
  example_filled?: string;
}

interface PlaybookSection {
  id: number;
  title: string;
  hook_type: string | null;
  niche: string | null;
  templates: Template[] | string;
  source_post_ids: number[] | string | null;
  why_it_works: string | null;
  generated_at: string | null;
  updated_at: string;
}

interface HookGroup {
  hook_type: string | null;
  niche: string | null;
  hook_count: number;
}

interface SavedPattern {
  pattern_id: number;
  display_name: string | null;
  canonical_template: string;
  hook_type: string | null;
  niche: string | null;
}

interface GeneratedHook {
  script: string;
  hook_style: string;
  inspired_by: string;
  why: string;
}

export default function PlaybookPage() {
  const [sections, setSections] = useState<PlaybookSection[]>([]);
  const [availableGroups, setAvailableGroups] = useState<HookGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState<number | null>(null);
  const [generatingGroup, setGeneratingGroup] = useState<string | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<string | null>(null);
  const [hasProfile, setHasProfile] = useState(true);
  // Generate hooks for a topic
  const [savedPatterns, setSavedPatterns] = useState<SavedPattern[]>([]);
  const [topic, setTopic] = useState('');
  const [selectedPatternIds, setSelectedPatternIds] = useState<Set<number>>(new Set());
  const [generatedHooks, setGeneratedHooks] = useState<GeneratedHook[] | null>(null);
  const [generatingHooks, setGeneratingHooks] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const fetchPlaybook = useCallback(async () => {
    try {
      const [playbookRes, profileRes, hooksRes] = await Promise.all([
        fetch('/api/playbook'),
        fetch('/api/creator-profile'),
        fetch('/api/user-hooks'),
      ]);
      const playbookData = await playbookRes.json();
      const profileData = await profileRes.json();
      const hooksData = await hooksRes.json();

      setSections(playbookData.sections || []);
      setAvailableGroups(playbookData.availableGroups || []);
      setHasProfile(profileData.profile?.onboarding_step === 'complete');

      const patterns: SavedPattern[] = (hooksData.hooks || []).map((h: SavedPattern) => ({
        pattern_id: h.pattern_id,
        display_name: h.display_name,
        canonical_template: h.canonical_template,
        hook_type: h.hook_type,
        niche: h.niche,
      }));
      setSavedPatterns(patterns);
      setSelectedPatternIds(new Set(patterns.map((p: SavedPattern) => p.pattern_id)));
    } catch (e) {
      console.error('Failed to fetch playbook:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPlaybook(); }, [fetchPlaybook]);

  const handleRegenerate = async (section: PlaybookSection) => {
    setRegenerating(section.id);
    try {
      const res = await fetch('/api/playbook/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          section_id: section.id,
          hook_type: section.hook_type,
          niche: section.niche,
        }),
      });
      const data = await res.json();
      if (data.sections) {
        setSections(data.sections);
      }
    } catch (e) {
      console.error('Failed to regenerate:', e);
    } finally {
      setRegenerating(null);
    }
  };

  const handleGenerate = async (group: HookGroup) => {
    const key = `${group.hook_type || ''}-${group.niche || ''}`;
    setGeneratingGroup(key);
    try {
      const res = await fetch('/api/playbook/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hook_type: group.hook_type,
          niche: group.niche,
        }),
      });
      const data = await res.json();
      if (data.sections) {
        setSections(data.sections);
      }
    } catch (e) {
      console.error('Failed to generate:', e);
    } finally {
      setGeneratingGroup(null);
    }
  };

  const togglePattern = (patternId: number) => {
    setSelectedPatternIds(prev => {
      const next = new Set(prev);
      if (next.has(patternId)) {
        next.delete(patternId);
      } else {
        next.add(patternId);
      }
      return next;
    });
  };

  const handleGenerateHooks = async () => {
    if (!topic.trim()) return;
    setGeneratingHooks(true);
    setGenerateError(null);
    setGeneratedHooks(null);
    try {
      const res = await fetch('/api/playbook/generate-hooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: topic.trim(),
          pattern_ids: selectedPatternIds.size === savedPatterns.length
            ? [] // empty = use all
            : Array.from(selectedPatternIds),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setGenerateError(data.error || 'Failed to generate hooks');
      } else {
        setGeneratedHooks(data.hooks || []);
      }
    } catch (e) {
      console.error('Failed to generate hooks:', e);
      setGenerateError('Failed to generate hooks');
    } finally {
      setGeneratingHooks(false);
    }
  };

  const handleExport = async () => {
    window.open('/api/playbook/export?format=markdown', '_blank');
  };

  const copyTemplate = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(key);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  const parseTemplates = (templates: Template[] | string): Template[] => {
    if (typeof templates === 'string') {
      try { return JSON.parse(templates); } catch { return []; }
    }
    return templates || [];
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Create hooks — hero section */}
      <div className="bg-gradient-to-br from-indigo-600 to-purple-600 rounded-2xl p-6 mb-8 text-white">
        <h1 className="text-2xl font-bold mb-1">Create Your Hooks</h1>
        <p className="text-indigo-200 text-sm">Describe your next video and we&apos;ll generate hooks based on proven viral patterns</p>

        {!hasProfile ? (
          <div className="mt-4 bg-white/10 backdrop-blur rounded-xl p-4">
            <p className="text-sm text-indigo-100 mb-3">
              Complete your creator profile so we can personalize your hooks.
            </p>
            <a
              href="/dashboard/profile"
              className="inline-flex items-center gap-2 px-4 py-2 bg-white text-indigo-600 rounded-lg font-semibold text-sm hover:bg-indigo-50 transition-colors"
            >
              Set Up Profile &rarr;
            </a>
          </div>
        ) : savedPatterns.length === 0 ? (
          <div className="mt-4 bg-white/10 backdrop-blur rounded-xl p-4">
            <p className="text-sm text-indigo-100 mb-3">
              Save some hook patterns from the Hook Lab first — they&apos;ll power your generated scripts.
            </p>
            <a
              href="/dashboard/hook-lab"
              className="inline-flex items-center gap-2 px-4 py-2 bg-white text-indigo-600 rounded-lg font-semibold text-sm hover:bg-indigo-50 transition-colors"
            >
              Browse Hook Lab &rarr;
            </a>
          </div>
        ) : (
          <div className="mt-4">
            <textarea
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. how I learned to code in 6 months, my morning routine as a fitness coach..."
              rows={2}
              className="w-full px-4 py-3 bg-white/10 backdrop-blur border border-white/20 rounded-xl text-sm text-white placeholder-indigo-200 focus:outline-none focus:ring-2 focus:ring-white/50 focus:border-transparent resize-none"
            />

            <p className="text-xs text-indigo-200 mt-3 mb-2">Draw from these hook styles:</p>
            <div className="flex flex-wrap gap-2 mb-4">
              {savedPatterns.map((p) => {
                const selected = selectedPatternIds.has(p.pattern_id);
                return (
                  <button
                    key={p.pattern_id}
                    onClick={() => togglePattern(p.pattern_id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      selected
                        ? 'bg-white/20 text-white border border-white/30'
                        : 'bg-white/5 text-indigo-200 border border-white/10'
                    }`}
                  >
                    {selected ? (
                      <span className="mr-1">&#10003;</span>
                    ) : null}
                    {p.display_name || p.hook_type || 'Pattern'}
                  </button>
                );
              })}
            </div>

            <button
              onClick={handleGenerateHooks}
              disabled={generatingHooks || !topic.trim() || selectedPatternIds.size === 0}
              className="px-5 py-2.5 bg-white text-indigo-600 rounded-xl text-sm font-bold hover:bg-indigo-50 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {generatingHooks ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-600" />
                  Generating...
                </>
              ) : (
                'Generate Hooks'
              )}
            </button>
          </div>
        )}
      </div>

      {/* Generated hooks results */}
      {generateError && (
        <div className="mb-6 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">
          {generateError}
        </div>
      )}

      {generatedHooks && generatedHooks.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">Generated Hooks</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const all = generatedHooks.map((h, i) => `${i + 1}. ${h.script}`).join('\n\n');
                  navigator.clipboard.writeText(all);
                  setCopiedIdx('all');
                  setTimeout(() => setCopiedIdx(null), 2000);
                }}
                className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                {copiedIdx === 'all' ? 'Copied!' : 'Copy All'}
              </button>
              <button
                onClick={() => { setGeneratedHooks(null); setTopic(''); }}
                className="px-3 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors"
              >
                New Topic
              </button>
            </div>
          </div>
          <div className="space-y-4">
            {generatedHooks.map((hook, i) => {
              const key = `gen-${i}`;
              return (
                <div key={i} className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-7 h-7 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-sm font-semibold mt-0.5">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="bg-gray-50 rounded-xl p-4 group relative">
                      <p className="text-gray-900 leading-relaxed pr-8">{hook.script}</p>
                      <button
                        onClick={() => copyTemplate(hook.script, key)}
                        className="absolute top-2 right-2 p-1.5 text-gray-400 hover:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Copy hook"
                      >
                        {copiedIdx === key ? (
                          <span className="text-green-500 text-xs font-medium">Copied!</span>
                        ) : (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        )}
                      </button>
                    </div>
                    <div className="flex items-center gap-2 mt-1.5 px-1">
                      <span className="text-xs font-medium text-indigo-600">{hook.hook_style}</span>
                      <span className="text-gray-300">&#183;</span>
                      <span className="text-xs text-gray-400">{hook.inspired_by}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1 px-1">{hook.why}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Playbook Library header */}
      {(sections.length > 0 || availableGroups.length > 0) && (
        <div className="flex items-center justify-between mb-4 mt-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Playbook Library</h2>
            {sections.length > 0 && (
              <p className="text-sm text-gray-500">
                {sections.length} section{sections.length !== 1 ? 's' : ''} of reusable templates from your saved hooks
              </p>
            )}
          </div>
          {sections.length > 0 && (
            <button
              onClick={handleExport}
              className="px-3 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors flex items-center gap-2"
            >
              <span>📥</span> Export
            </button>
          )}
        </div>
      )}

      {/* Show generate buttons for hook groups that don't have sections yet */}
      {hasProfile && (() => {
        const existingKeys = new Set(
          sections.map(s => `${s.hook_type || ''}-${s.niche || ''}`)
        );
        const ungeneratedGroups = availableGroups.filter(
          g => !existingKeys.has(`${g.hook_type || ''}-${g.niche || ''}`)
        );
        if (ungeneratedGroups.length === 0) return null;
        return (
          <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-6 mb-8">
            <h3 className="font-semibold text-indigo-900 mb-2">Generate playbook sections</h3>
            <p className="text-indigo-700 text-sm mb-4">
              You have saved hooks ready to generate personalized templates.
            </p>
            <div className="flex flex-wrap gap-3">
              {ungeneratedGroups.map((g) => {
                const label = [g.hook_type, g.niche].filter(Boolean).join(' + ') || 'All hooks';
                const key = `${g.hook_type || ''}-${g.niche || ''}`;
                const isGenerating = generatingGroup === key;
                return (
                  <button
                    key={key}
                    onClick={() => handleGenerate(g)}
                    disabled={isGenerating}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {isGenerating ? (
                      <>
                        <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <span className="capitalize">{label}</span>
                        <span className="text-indigo-200">({g.hook_count} hooks)</span>
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })()}

      {sections.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
          <div className="text-4xl mb-4">📖</div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No playbook sections yet</h3>
          <p className="text-gray-500 mb-6 max-w-md mx-auto">
            {availableGroups.length > 0
              ? 'Use the generate buttons above to create your first playbook section from your saved hooks.'
              : 'Save hooks in My Hooks to generate your first playbook section.'}
          </p>
          {availableGroups.length === 0 && (
            <a
              href="/dashboard/saved"
              className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition-colors"
            >
              Go to My Hooks →
            </a>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {sections.map((section) => {
            const templates = parseTemplates(section.templates);
            const label = [section.hook_type, section.niche].filter(Boolean).join(' × ');

            return (
              <div
                key={section.id}
                className="bg-white rounded-2xl border border-gray-200 overflow-hidden"
              >
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-900">
                      {section.title || label || 'Untitled Section'}
                    </h3>
                    {label && section.title && (
                      <p className="text-sm text-gray-500 mt-0.5 capitalize">{label}</p>
                    )}
                  </div>
                  <button
                    onClick={() => handleRegenerate(section)}
                    disabled={regenerating === section.id}
                    className="px-3 py-1.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {regenerating === section.id ? (
                      <>
                        <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-gray-600" />
                        Generating...
                      </>
                    ) : (
                      <>🔄 Regenerate</>
                    )}
                  </button>
                </div>

                {/* Templates */}
                <div className="p-6 space-y-5">
                  {templates.map((t, i) => {
                    const key = `${section.id}-${i}`;
                    return (
                      <div key={i} className="relative">
                        <div className="flex items-start gap-3">
                          <span className="flex-shrink-0 w-7 h-7 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-sm font-semibold mt-0.5">
                            {i + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="bg-gray-50 rounded-xl p-4 group relative">
                              <p className="text-gray-900 leading-relaxed">{t.script}</p>
                              <button
                                onClick={() => copyTemplate(t.script, key)}
                                className="absolute top-2 right-2 p-1.5 text-gray-400 hover:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Copy template"
                              >
                                {copiedIdx === key ? (
                                  <span className="text-green-500 text-xs font-medium">Copied!</span>
                                ) : (
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                  </svg>
                                )}
                              </button>
                            </div>
                            {t.example_filled && (
                              <p className="text-sm text-gray-500 mt-2 pl-1">
                                <span className="font-medium">Example:</span> {t.example_filled}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Why it works */}
                {section.why_it_works && (
                  <div className="px-6 pb-6">
                    <div className="bg-indigo-50 rounded-xl p-4">
                      <p className="text-sm font-medium text-indigo-900 mb-1">
                        💡 Why these work for you
                      </p>
                      <p className="text-sm text-indigo-700">{section.why_it_works}</p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
