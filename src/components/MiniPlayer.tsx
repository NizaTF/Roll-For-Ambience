import React from 'react';
import { Loader2, Pause, Play, SkipForward } from 'lucide-react';
import { CrossfadeStatus, Track } from '../types/audio';

interface MiniPlayerProps {
  currentTrack: Track;
  isPlaying: boolean;
  isBuffering: boolean;
  currentTime: number;
  duration: number;
  crossfadeStatus: CrossfadeStatus;
  onTogglePlay: () => void;
  onNext: () => void;
  onExpand: () => void;
}

export const MiniPlayer: React.FC<MiniPlayerProps> = ({
  currentTrack,
  isPlaying,
  isBuffering,
  currentTime,
  duration,
  crossfadeStatus,
  onTogglePlay,
  onNext,
  onExpand,
}) => {
  const pct =
    duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;

  return (
    <div className="relative bg-surface/95 backdrop-blur-md border-t border-white/10">
      {/* Hairline progress indicator */}
      <div className="h-0.5 w-full bg-white/8 overflow-hidden">
        <div
          className="h-full bg-accent transition-all duration-200"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="flex items-center justify-between gap-2 px-3 h-[52px]">
        <button
          type="button"
          onClick={onExpand}
          className="flex-1 min-w-0 text-left py-1 pr-2"
        >
          <div className="text-xs font-semibold text-[#F2F0EB] truncate">
            {currentTrack.title}
          </div>
          <div className="text-[11px] text-[#9C988E] truncate">
            {crossfadeStatus.active
              ? crossfadeStatus.phase === 'loading'
                ? `Cargando ${crossfadeStatus.toTitle || 'siguiente'}...`
                : `Fundido (${crossfadeStatus.durationSec}s)...`
              : currentTrack.artist}
          </div>
        </button>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onTogglePlay}
            aria-label={isPlaying ? 'Pausar' : 'Reproducir'}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-accent-light hover:bg-white/5"
          >
            {isBuffering ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : isPlaying ? (
              <Pause className="w-5 h-5 fill-current" />
            ) : (
              <Play className="w-5 h-5 fill-current ml-0.5" />
            )}
          </button>

          <button
            type="button"
            onClick={onNext}
            aria-label="Siguiente"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-[#D6D2C8] hover:bg-white/5"
          >
            <SkipForward className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};
