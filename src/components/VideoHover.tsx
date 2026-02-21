'use client';

import Image from 'next/image';
import { proxyImg } from '@/lib/format';

interface VideoHoverProps {
  thumbnailUrl: string | null;
  s3ThumbnailUrl?: string | null;
  postUrl: string | null;
  isVideo: boolean;
  fallbackEmoji?: string;
  children?: React.ReactNode;
}

export default function VideoHover({ thumbnailUrl, s3ThumbnailUrl, postUrl, fallbackEmoji = '📱', children }: VideoHoverProps) {
  const imgSrc = proxyImg(thumbnailUrl, s3ThumbnailUrl);

  const handlePlayClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (postUrl) {
      window.open(postUrl, '_blank');
    }
  };

  return (
    <div className="relative w-full h-full">
      {/* Thumbnail */}
      {imgSrc ? (
        <Image src={imgSrc} alt="" fill className="object-cover" unoptimized />
      ) : (
        <span className="text-6xl">{fallbackEmoji}</span>
      )}

      {/* Play button — always visible when there's a URL, centered, z-30 to sit above card badges */}
      {postUrl && (
        <button
          onClick={handlePlayClick}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 bg-black/50 hover:bg-black/70 hover:scale-110 rounded-full p-3 transition-all shadow-lg cursor-pointer"
        >
          <svg className="w-8 h-8 text-white drop-shadow" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        </button>
      )}

      {children}
    </div>
  );
}
