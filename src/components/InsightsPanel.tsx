'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { formatNumber, formatViralScore, proxyImg } from '@/lib/format';
import { HookTypeBadge, HookScoreBadge, NicheBadge, EmotionBadge, FormatBadge } from '@/components/HookBadge';
import type { Post, SavedPost, HookAnalysis } from '@/lib/types';

type InsightsPost = Post | SavedPost;

interface InsightsPanelProps {
  post: InsightsPost | null;
  open: boolean;
  onClose: () => void;
  onPostUpdate?: (postId: number, updates: { hook_analysis: HookAnalysis; analyzed_at: string; transcript: string | null }) => void;
  isSaved?: boolean;
  onSave?: (postId: number) => void;
}

export default function InsightsPanel({ post, open, onClose, onPostUpdate, isSaved, onSave }: InsightsPanelProps) {
  const [analysis, setAnalysis] = useState<HookAnalysis | null>(null);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'analyzing' | 'queued' | 'done' | 'error'>('idle');
  const panelRef = useRef<HTMLDivElement>(null);
  const analyzeCalledRef = useRef<number | null>(null);

  // Get the actual post ID (SavedPost uses post_id, Post uses id)
  const postId = post ? ('post_id' in post ? post.post_id : post.id) : null;

  // Reset and load when post changes
  useEffect(() => {
    if (!post || !open) {
      analyzeCalledRef.current = null;
      return;
    }

    if (post.hook_analysis && post.analyzed_at) {
      setAnalysis(post.hook_analysis);
      setTranscript(post.transcript ?? null);
      setStatus('done');
      analyzeCalledRef.current = null;
      return;
    }

    // Auto-trigger analysis if not yet analyzed
    if (postId && analyzeCalledRef.current !== postId) {
      analyzeCalledRef.current = postId;
      setAnalysis(null);
      setTranscript(null);
      setStatus('analyzing');

      fetch('/api/analyze-hook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: postId }),
      })
        .then(res => res.json())
        .then(data => {
          if (data.status === 'already_analyzed') {
            setAnalysis(data.hook_analysis);
            setTranscript(data.transcript ?? null);
            setStatus('done');
            onPostUpdate?.(postId, { hook_analysis: data.hook_analysis, analyzed_at: data.analyzed_at, transcript: data.transcript });
          } else if (data.status === 'queued') {
            setStatus('queued');
          } else {
            setStatus('error');
          }
        })
        .catch(() => setStatus('error'));
    }
  }, [post, open, postId, onPostUpdate]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Delay to avoid the opening click from closing immediately
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClick);
    }, 100);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClick);
    };
  }, [open, onClose]);

  if (!post) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/30 z-40 transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className={`fixed top-0 right-0 h-full w-full max-w-md bg-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out overflow-y-auto ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full hover:bg-gray-100 transition-colors z-10"
        >
          <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Thumbnail */}
        {(post.thumbnail_url || post.s3_thumbnail_url) && (
          <div className="relative aspect-video w-full bg-gradient-to-br from-purple-400 to-pink-500 overflow-hidden">
            <Image src={proxyImg(post.thumbnail_url, post.s3_thumbnail_url)!} alt="" fill className="object-cover" unoptimized />
            {post.post_url && (
              <a
                href={post.post_url}
                target="_blank"
                rel="noopener noreferrer"
                className="absolute inset-0 flex items-center justify-center bg-black/0 hover:bg-black/20 transition-colors"
              >
                <span className="bg-white/90 rounded-full p-3 opacity-0 hover:opacity-100 transition-opacity">
                  <svg className="w-6 h-6 text-gray-800" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </span>
              </a>
            )}
          </div>
        )}

        <div className="p-6 space-y-6">
          {/* Header: username + platform + date */}
          <div className="flex items-center space-x-3">
            <div className="relative w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-pink-500 flex items-center justify-center text-lg overflow-hidden flex-shrink-0">
              {post.avatar_url ? (
                <Image src={proxyImg(post.avatar_url)!} alt="" fill className="object-cover" unoptimized />
              ) : (
                <span className="text-white">👤</span>
              )}
            </div>
            <div>
              <div className="flex items-center space-x-1.5">
                <span className="text-sm">{post.platform === 'instagram' ? '📸' : '🎵'}</span>
                <p className="font-semibold text-gray-900">@{post.username}</p>
              </div>
              <p className="text-xs text-gray-500">
                {post.platform === 'instagram' ? 'Instagram' : 'TikTok'}
                {post.posted_at ? ` · ${new Date(post.posted_at).toLocaleDateString()}` : ''}
              </p>
            </div>
          </div>

          {/* Description */}
          {post.description && (
            <p className="text-sm text-gray-700 leading-relaxed">{post.description}</p>
          )}

          {/* Stats */}
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Stats</h3>
            <div className="grid grid-cols-4 gap-3">
              <div className="text-center">
                <p className="text-lg font-bold text-gray-900">{formatNumber(post.likes)}</p>
                <p className="text-xs text-gray-500">Likes</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-gray-900">{formatNumber(post.comments)}</p>
                <p className="text-xs text-gray-500">Comments</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-gray-900">{formatNumber(post.shares)}</p>
                <p className="text-xs text-gray-500">Shares</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-gray-900">{formatViralScore(post.viral_score)}</p>
                <p className="text-xs text-gray-500">Viral</p>
              </div>
            </div>
          </div>

          {/* Save Hook button */}
          {onSave && postId && (
            <button
              onClick={() => onSave(postId)}
              className={`w-full py-2.5 rounded-xl font-semibold text-sm transition-colors ${
                isSaved
                  ? 'bg-red-50 text-red-600 border border-red-200'
                  : 'bg-indigo-600 text-white hover:bg-indigo-700'
              }`}
            >
              {isSaved ? '♥ Saved to My Hooks' : '♡ Save Hook'}
            </button>
          )}

          {/* Hook Analysis */}
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Hook Analysis</h3>

            {status === 'analyzing' && (
              <div className="flex items-center gap-3 py-6 justify-center text-gray-500">
                <span className="animate-spin inline-block w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full" />
                <span className="text-sm">Analyzing hook...</span>
              </div>
            )}

            {status === 'queued' && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
                <p className="text-sm text-amber-700 font-medium">Queued for analysis</p>
                <p className="text-xs text-amber-600 mt-1">The Mac Mini will process this shortly. Check back soon.</p>
              </div>
            )}

            {status === 'error' && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
                <p className="text-sm text-red-700">Analysis unavailable</p>
              </div>
            )}

            {status === 'done' && analysis && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <HookTypeBadge hookType={analysis.hook_type} />
                  <HookScoreBadge score={analysis.hook_score} />
                  {analysis.niche && <NicheBadge niche={analysis.niche} />}
                  {analysis.hook_format && <FormatBadge format={analysis.hook_format} />}
                </div>

                {analysis.hook_template && (
                  <div className="bg-indigo-50 rounded-xl p-3">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-medium text-indigo-500">Hook Template</p>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(analysis.hook_template!);
                        }}
                        className="text-xs text-indigo-500 hover:text-indigo-700 font-medium"
                      >
                        Copy
                      </button>
                    </div>
                    <p className="text-sm font-medium text-indigo-900">{analysis.hook_template}</p>
                  </div>
                )}

                {analysis.hook_text && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-1">Opening words</p>
                    <p className="text-sm text-gray-800 italic">&ldquo;{analysis.hook_text}&rdquo;</p>
                  </div>
                )}

                {analysis.hook_visual && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-1">Visual hook</p>
                    <p className="text-sm text-gray-800">{analysis.hook_visual}</p>
                  </div>
                )}

                {analysis.hook_explanation && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-1">Why it works</p>
                    <p className="text-sm text-gray-800">{analysis.hook_explanation}</p>
                  </div>
                )}

                {/* New fields */}
                <div className="flex flex-wrap gap-1.5">
                  {analysis.emotional_trigger && <EmotionBadge emotion={analysis.emotional_trigger} />}
                  {analysis.target_audience && (
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                      {analysis.target_audience}
                    </span>
                  )}
                  {analysis.cta_type && analysis.cta_type !== 'none' && (
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-600">
                      CTA: {analysis.cta_type}
                    </span>
                  )}
                </div>
              </div>
            )}

            {status === 'idle' && !analysis && (
              <p className="text-sm text-gray-400 text-center py-4">No analysis available</p>
            )}
          </div>

          {/* Transcript */}
          {(status === 'done' && transcript) && (
            <div>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Transcript</h3>
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{transcript}</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
