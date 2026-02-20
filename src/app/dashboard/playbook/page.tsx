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

export default function PlaybookPage() {
  const [sections, setSections] = useState<PlaybookSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState<number | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<string | null>(null);
  const [hasProfile, setHasProfile] = useState(true);

  const fetchPlaybook = useCallback(async () => {
    try {
      const [playbookRes, profileRes] = await Promise.all([
        fetch('/api/playbook'),
        fetch('/api/creator-profile'),
      ]);
      const playbookData = await playbookRes.json();
      const profileData = await profileRes.json();

      setSections(playbookData.sections || []);
      setHasProfile(profileData.profile?.onboarding_step === 'complete');
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
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Your Hook Playbook</h1>
          {sections.length > 0 && (
            <p className="text-gray-500 mt-1">
              {sections.length} section{sections.length !== 1 ? 's' : ''} based on your saved hooks
            </p>
          )}
        </div>
        {sections.length > 0 && (
          <button
            onClick={handleExport}
            className="px-4 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors flex items-center gap-2"
          >
            <span>📥</span> Export Markdown
          </button>
        )}
      </div>

      {!hasProfile && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 mb-8">
          <h3 className="font-semibold text-amber-900 mb-2">Complete your profile first</h3>
          <p className="text-amber-700 mb-4">
            Your creator profile helps us generate personalized hook templates.
          </p>
          <a
            href="/dashboard/profile"
            className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg font-medium hover:bg-amber-700 transition-colors"
          >
            Set Up Profile →
          </a>
        </div>
      )}

      {sections.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
          <div className="text-4xl mb-4">📖</div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No playbook sections yet</h3>
          <p className="text-gray-500 mb-6 max-w-md mx-auto">
            Save hooks in Hook Lab to generate your first playbook section.
            Save 3+ hooks of the same type or niche to get personalized templates.
          </p>
          <a
            href="/dashboard/hook-lab"
            className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition-colors"
          >
            Go to Hook Lab →
          </a>
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
