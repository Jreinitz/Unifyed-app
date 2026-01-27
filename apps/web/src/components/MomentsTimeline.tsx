'use client';

import { useCallback } from 'react';
import { seekToTime } from './VideoPlayer';

interface Moment {
  id: string;
  title: string;
  description: string | null;
  timestamp: number;
  thumbnailUrl: string | null;
}

interface MomentsTimelineProps {
  moments: Moment[];
  currentTime?: number;
  onMomentClick?: (moment: Moment) => void;
}

function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function MomentsTimeline({ 
  moments, 
  currentTime = 0,
  onMomentClick,
}: MomentsTimelineProps) {
  const handleClick = useCallback((moment: Moment) => {
    seekToTime(moment.timestamp);
    onMomentClick?.(moment);
  }, [onMomentClick]);

  if (moments.length === 0) {
    return (
      <div className="text-slate-500 text-center py-8">
        <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p>No moments marked yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {moments.map((moment, index) => {
        // Determine if this moment is "active" (closest to current time)
        const isActive = currentTime >= moment.timestamp && 
          (index === moments.length - 1 || currentTime < moments[index + 1]?.timestamp);

        return (
          <button
            key={moment.id}
            onClick={() => handleClick(moment)}
            className={`
              w-full text-left px-4 py-3 rounded-lg transition-all duration-200
              flex items-start gap-3 group
              ${isActive 
                ? 'bg-brand-600/20 border border-brand-500/50 shadow-lg shadow-brand-500/10' 
                : 'bg-slate-800/50 hover:bg-slate-800 border border-transparent'
              }
            `}
          >
            {/* Timestamp badge */}
            <span className={`
              font-mono text-sm px-2 py-0.5 rounded
              ${isActive ? 'bg-brand-500 text-white' : 'bg-slate-700 text-slate-300 group-hover:bg-slate-600'}
            `}>
              {formatTimestamp(moment.timestamp)}
            </span>
            
            {/* Content */}
            <div className="flex-1 min-w-0">
              <p className={`font-medium truncate ${isActive ? 'text-white' : 'text-slate-200'}`}>
                {moment.title}
              </p>
              {moment.description && (
                <p className="text-sm text-slate-400 truncate mt-0.5">
                  {moment.description}
                </p>
              )}
            </div>
            
            {/* Play indicator */}
            <svg 
              className={`w-5 h-5 flex-shrink-0 transition-opacity ${isActive ? 'text-brand-400 opacity-100' : 'text-slate-500 opacity-0 group-hover:opacity-100'}`}
              fill="currentColor" 
              viewBox="0 0 20 20"
            >
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
            </svg>
          </button>
        );
      })}
    </div>
  );
}
