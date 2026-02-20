'use client';

import { useState, useRef, useCallback } from 'react';
import Image from 'next/image';
import { proxyImg } from '@/lib/format';

interface VideoHoverProps {
  thumbnailUrl: string | null;
  postUrl: string | null;
  isVideo: boolean;
  fallbackEmoji?: string;
  children?: React.ReactNode;
}

export default function VideoHover({ thumbnailUrl, postUrl, isVideo, fallbackEmoji = '📱', children }: VideoHoverProps) {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [showVideo, setShowVideo] = useState(false);
  const [fetchFailed, setFetchFailed] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchController = useRef<AbortController | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const handleMouseEnter = useCallback(() => {
    if (!isVideo || !postUrl || fetchFailed) return;

    if (videoUrl) {
      // Already have the URL, just show it
      hoverTimer.current = setTimeout(() => setShowVideo(true), 150);
      return;
    }

    hoverTimer.current = setTimeout(async () => {
      fetchController.current = new AbortController();
      const timeout = setTimeout(() => fetchController.current?.abort(), 3000);
      try {
        const res = await fetch(`/api/video-url?url=${encodeURIComponent(postUrl)}`, {
          signal: fetchController.current.signal,
        });
        clearTimeout(timeout);
        if (res.ok) {
          const data = await res.json();
          setVideoUrl(data.video_url);
          setShowVideo(true);
        } else {
          setFetchFailed(true);
        }
      } catch {
        setFetchFailed(true);
      }
    }, 300);
  }, [isVideo, postUrl, videoUrl, fetchFailed]);

  const handleMouseLeave = useCallback(() => {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
    fetchController.current?.abort();
    setShowVideo(false);
    if (videoRef.current) {
      videoRef.current.pause();
    }
  }, []);

  return (
    <div
      className="relative w-full h-full"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Thumbnail */}
      {thumbnailUrl ? (
        <Image src={proxyImg(thumbnailUrl)!} alt="" fill className="object-cover" unoptimized />
      ) : (
        <span className="text-6xl">{fallbackEmoji}</span>
      )}

      {/* Video overlay */}
      {showVideo && videoUrl && (
        <video
          ref={videoRef}
          src={videoUrl}
          autoPlay
          muted
          loop
          playsInline
          className="absolute inset-0 w-full h-full object-cover z-10"
          onError={() => { setShowVideo(false); setFetchFailed(true); }}
        />
      )}

      {/* Play icon for videos that haven't loaded */}
      {isVideo && !showVideo && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="bg-black/40 rounded-full p-2">
            <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      )}

      {children}
    </div>
  );
}
