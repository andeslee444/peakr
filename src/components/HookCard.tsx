'use client';

import { useState, useCallback } from 'react';
import Image from 'next/image';
import { formatNumber, formatViralScore, proxyImg } from '@/lib/format';
import { HookTypeBadge, HookScoreBadge, HookOverlay, NicheBadge, EmotionBadge } from '@/components/HookBadge';
import VideoHover from '@/components/VideoHover';
import type { Post } from '@/lib/types';

interface HookCardProps {
  post: Post;
  flipped?: boolean;
  isSaved?: boolean;
  isHookSaved?: boolean;
  onSave: (postId: number) => void;
  onSaveHook?: (postId: number) => void;
  onTrack: (username: string, platform: string) => void;
  onInfoClick: (post: Post) => void;
  savingId?: number | null;
}

export default function HookCard({ post, flipped: controlledFlip, isSaved, isHookSaved, onSave, onSaveHook, onTrack, onInfoClick, savingId }: HookCardProps) {
  const [localFlip, setLocalFlip] = useState(false);
  const isFlipped = controlledFlip !== undefined ? controlledFlip : localFlip;
  const [copied, setCopied] = useState(false);

  const analysis = post.hook_analysis;

  const handleFlip = useCallback(() => {
    if (controlledFlip === undefined) {
      setLocalFlip(f => !f);
    }
  }, [controlledFlip]);

  const copyTemplate = useCallback(async () => {
    if (!analysis?.hook_template) return;
    await navigator.clipboard.writeText(analysis.hook_template);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [analysis?.hook_template]);

  return (
    <div className="group" style={{ perspective: '1000px' }}>
      {/* Flip container */}
      <div
        className="relative transition-transform duration-500"
        style={{
          transformStyle: 'preserve-3d',
          transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
        }}
      >
        {/* ===== FRONT ===== */}
        <div
          className="bg-white rounded-2xl overflow-hidden card-shadow"
          style={{ backfaceVisibility: 'hidden' }}
        >
          <div
            className="relative aspect-[9/16] bg-gradient-to-br from-purple-400 to-pink-500 flex items-center justify-center overflow-hidden cursor-pointer"
            onClick={handleFlip}
          >
            <VideoHover
              thumbnailUrl={post.thumbnail_url}
              postUrl={post.post_url}
              isVideo={post.is_video}
              fallbackEmoji={post.platform === 'instagram' ? '📸' : '🎵'}
            />

            {/* Viral score badge */}
            <div className="absolute top-3 left-3 viral-badge text-white text-xs font-bold px-2 py-1 rounded-full flex items-center space-x-1 z-20">
              <span>🔥</span>
              <span>{formatViralScore(post.viral_score)}</span>
            </div>

            {/* Views badge */}
            <div className="absolute top-3 right-3 bg-black/50 text-white text-xs font-medium px-2 py-1 rounded-full flex items-center space-x-1 z-20">
              <span>👁️</span>
              <span>{formatNumber(post.views)}</span>
            </div>

            {/* Hook overlay badges */}
            {analysis && post.analyzed_at && (
              <div className="z-20">
                <HookOverlay analysis={analysis} />
              </div>
            )}

            {/* Save + Track buttons */}
            <div className="absolute bottom-3 right-3 flex items-center gap-1.5 z-20">
              <button
                onClick={(e) => { e.stopPropagation(); onSave(post.id); }}
                disabled={savingId === post.id}
                className={`p-2 rounded-full transition-colors ${isSaved ? 'bg-indigo-500 text-white' : 'bg-white/90 hover:bg-white text-gray-700'}`}
                title={isSaved ? 'Saved' : 'Save post'}
              >
                <svg className="w-4 h-4" fill={isSaved ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                </svg>
              </button>
            </div>

            {/* Track button */}
            <button
              onClick={(e) => { e.stopPropagation(); onTrack(post.username, post.platform); }}
              className="absolute bottom-3 left-3 bg-white/90 hover:bg-white px-2 py-1 rounded-full text-[10px] font-medium text-gray-700 transition-colors z-20 flex items-center space-x-1"
              style={{ bottom: analysis && post.analyzed_at ? '2.5rem' : '0.75rem' }}
            >
              <span>+</span>
              <span>Track</span>
            </button>
          </div>

          {/* Bottom info area — opens InsightsPanel */}
          <div
            className="p-3 cursor-pointer hover:bg-gray-50 transition-colors"
            onClick={() => onInfoClick(post)}
          >
            <div className="flex items-center space-x-2">
              <div className="relative w-7 h-7 rounded-full bg-gradient-to-br from-purple-400 to-pink-500 flex items-center justify-center text-xs overflow-hidden flex-shrink-0">
                {post.avatar_url ? (
                  <Image src={proxyImg(post.avatar_url)!} alt="" fill className="object-cover" unoptimized />
                ) : (
                  <span className="text-white text-[10px]">👤</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center space-x-1">
                  <span className="text-[10px]">{post.platform === 'instagram' ? '📸' : '🎵'}</span>
                  <p className="font-medium text-gray-900 text-xs truncate">@{post.username}</p>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between mt-2 text-[10px] text-gray-500">
              <span>❤️ {formatNumber(post.likes)}</span>
              <span>💬 {formatNumber(post.comments)}</span>
              <span>↗️ {formatNumber(post.shares)}</span>
            </div>
            {post.description && (
              <p className="text-[10px] text-gray-400 mt-1 line-clamp-1">{post.description}</p>
            )}
          </div>
        </div>

        {/* ===== BACK ===== */}
        <div
          className="absolute inset-0 bg-white rounded-2xl overflow-hidden card-shadow"
          style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
        >
          <div className="h-full flex flex-col">
            {/* Save Hook button — top right of back */}
            {onSaveHook && (
              <div className="absolute top-3 right-3 z-10">
                <button
                  onClick={(e) => { e.stopPropagation(); onSaveHook(post.id); }}
                  className={`p-2 rounded-full transition-colors shadow-sm ${
                    isHookSaved
                      ? 'bg-red-500 text-white'
                      : 'bg-white/90 hover:bg-white text-gray-500 hover:text-red-500'
                  }`}
                  title={isHookSaved ? 'Hook saved' : 'Save hook for playbook'}
                >
                  <svg className="w-4 h-4" fill={isHookSaved ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                </button>
              </div>
            )}

            {/* Back content — scrollable */}
            <div
              className="flex-1 overflow-y-auto p-4 space-y-3 cursor-pointer"
              onClick={handleFlip}
            >
              {analysis ? (
                <>
                  {/* Hook template */}
                  {analysis.hook_template && (
                    <div className="bg-indigo-50 rounded-xl p-3">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-[10px] font-semibold text-indigo-400 uppercase tracking-wider">Hook Template</p>
                        <button
                          onClick={(e) => { e.stopPropagation(); copyTemplate(); }}
                          className="text-[10px] text-indigo-500 hover:text-indigo-700 font-medium"
                        >
                          {copied ? 'Copied!' : 'Copy'}
                        </button>
                      </div>
                      <p className="text-sm font-medium text-indigo-900 leading-relaxed">{analysis.hook_template}</p>
                    </div>
                  )}

                  {/* Type + Score */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <HookTypeBadge hookType={analysis.hook_type} />
                    <HookScoreBadge score={analysis.hook_score} />
                    {analysis.niche && <NicheBadge niche={analysis.niche} />}
                  </div>

                  {/* Opening words */}
                  {analysis.hook_text && (
                    <div>
                      <p className="text-[10px] font-medium text-gray-400 mb-0.5">Opening Words</p>
                      <p className="text-xs text-gray-800 italic">&ldquo;{analysis.hook_text}&rdquo;</p>
                    </div>
                  )}

                  {/* Visual hook */}
                  {analysis.hook_visual && (
                    <div>
                      <p className="text-[10px] font-medium text-gray-400 mb-0.5">Visual Hook</p>
                      <p className="text-xs text-gray-700">{analysis.hook_visual}</p>
                    </div>
                  )}

                  {/* Why it works */}
                  {analysis.hook_explanation && (
                    <div>
                      <p className="text-[10px] font-medium text-gray-400 mb-0.5">Why It Works</p>
                      <p className="text-xs text-gray-700">{analysis.hook_explanation}</p>
                    </div>
                  )}

                  {/* Tags */}
                  <div className="flex flex-wrap gap-1">
                    {analysis.emotional_trigger && <EmotionBadge emotion={analysis.emotional_trigger} />}
                    {analysis.target_audience && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">
                        {analysis.target_audience}
                      </span>
                    )}
                    {analysis.hook_format && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">
                        {analysis.hook_format}
                      </span>
                    )}
                    {analysis.cta_type && analysis.cta_type !== 'none' && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600">
                        CTA: {analysis.cta_type}
                      </span>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-center h-full">
                  <p className="text-sm text-gray-400">No analysis yet</p>
                </div>
              )}
            </div>

            {/* Bottom info (same as front) */}
            <div
              className="border-t p-3 cursor-pointer hover:bg-gray-50 transition-colors"
              onClick={(e) => { e.stopPropagation(); onInfoClick(post); }}
            >
              <div className="flex items-center space-x-2">
                <div className="relative w-7 h-7 rounded-full bg-gradient-to-br from-purple-400 to-pink-500 flex items-center justify-center text-xs overflow-hidden flex-shrink-0">
                  {post.avatar_url ? (
                    <Image src={proxyImg(post.avatar_url)!} alt="" fill className="object-cover" unoptimized />
                  ) : (
                    <span className="text-white text-[10px]">👤</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center space-x-1">
                    <span className="text-[10px]">{post.platform === 'instagram' ? '📸' : '🎵'}</span>
                    <p className="font-medium text-gray-900 text-xs truncate">@{post.username}</p>
                  </div>
                </div>
                <span className="text-[10px] text-gray-400">🔥 {formatViralScore(post.viral_score)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
