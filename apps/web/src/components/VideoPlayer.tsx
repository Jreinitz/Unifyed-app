'use client';

import { useRef, useEffect, useCallback, useState } from 'react';

interface VideoPlayerProps {
  videoUrl: string | null;
  thumbnailUrl?: string | null;
  onTimeUpdate?: (currentTime: number) => void;
  className?: string;
}

export function VideoPlayer({ 
  videoUrl, 
  thumbnailUrl, 
  onTimeUpdate,
  className = '',
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);

  // Handle time updates
  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current) {
      const time = videoRef.current.currentTime;
      setCurrentTime(time);
      onTimeUpdate?.(time);
    }
  }, [onTimeUpdate]);

  // Seek to specific time
  const seekTo = useCallback((time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  }, []);

  // Expose seekTo via window for external control
  useEffect(() => {
    (window as unknown as { unifyed_seekTo?: (time: number) => void }).unifyed_seekTo = seekTo;
    return () => {
      delete (window as unknown as { unifyed_seekTo?: (time: number) => void }).unifyed_seekTo;
    };
  }, [seekTo]);

  // Check if it's a YouTube URL
  const isYouTube = videoUrl?.includes('youtube.com') || videoUrl?.includes('youtu.be');
  
  // Check if it's a TikTok embed URL
  const isTikTok = videoUrl?.includes('tiktok.com');

  // Extract YouTube video ID
  const getYouTubeId = (url: string): string | null => {
    const match = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([^&\s]+)/);
    return match?.[1] ?? null;
  };

  if (!videoUrl) {
    return (
      <div className={`bg-slate-900 flex items-center justify-center aspect-video ${className}`}>
        <div className="text-center text-slate-500">
          <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          <p>Video not available</p>
        </div>
      </div>
    );
  }

  if (isYouTube) {
    const videoId = getYouTubeId(videoUrl);
    if (videoId) {
      return (
        <div className={`relative aspect-video ${className}`}>
          <iframe
            src={`https://www.youtube.com/embed/${videoId}?enablejsapi=1&rel=0`}
            className="w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      );
    }
  }

  if (isTikTok) {
    return (
      <div className={`relative aspect-[9/16] max-h-[600px] mx-auto ${className}`}>
        <iframe
          src={videoUrl}
          className="w-full h-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }

  // Regular video player
  return (
    <div className={`relative bg-black ${className}`}>
      <video
        ref={videoRef}
        src={videoUrl}
        poster={thumbnailUrl ?? undefined}
        className="w-full aspect-video"
        controls
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={() => {
          if (videoRef.current) {
            setDuration(videoRef.current.duration);
            setIsLoaded(true);
          }
        }}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
      />
      
      {/* Progress overlay */}
      {isLoaded && duration > 0 && (
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-800/50">
          <div 
            className="h-full bg-brand-500 transition-all duration-200"
            style={{ width: `${(currentTime / duration) * 100}%` }}
          />
        </div>
      )}
    </div>
  );
}

// Export seekTo function type for TypeScript
export function seekToTime(time: number) {
  const seekFn = (window as unknown as { unifyed_seekTo?: (time: number) => void }).unifyed_seekTo;
  if (seekFn) {
    seekFn(time);
  }
}
