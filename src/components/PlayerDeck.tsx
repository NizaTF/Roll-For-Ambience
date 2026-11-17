import React, { useState } from 'react';
import {
  ChevronDown,
  ExternalLink,
  FolderPlus,
  Loader2,
  Pause,
  Play,
  Repeat,
  Repeat1,
  RotateCcw,
  RotateCw,
  Shuffle,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Sun,
  Video,
  Volume2,
  Waves,
} from 'lucide-react';
import { AUDIO_FILTER_PRESETS } from '../services/audioFilters';
import { formatDuration, YouTubeAuthStatus } from '../services/freeMusicApi';
import { AudioFilterId, CrossfadeStatus, EqualizerBands, LoopMode, Track } from '../types/audio';

interface PlayerDeckProps {
  currentTrack: Track | null;
  queueName: string;
  isPlaying: boolean;
  isBuffering: boolean;
  currentTime: number;
  duration: number;
  playerError: string | null;
  crossfadeSeconds: number;
  onChangeCrossfade: (sec: number) => void;
  introCacheSeconds: number;
  onChangeIntroCache: (sec: number) => void;
  audioFilter: AudioFilterId;
  onChangeAudioFilter: (filterId: AudioFilterId) => void;
  filterIntensity: number;
  onChangeFilterIntensity: (intensity: number) => void;
  equalizer: EqualizerBands;
  onChangeEqualizer: (bands: EqualizerBands) => void;
  onResetEqualizer: () => void;
  ytAuthStatus?: YouTubeAuthStatus;
  ytLoginSuggested?: boolean;
  ytAuthBusy?: boolean;
  onStartYtAuth?: () => void;
  onLogoutYtAuth?: () => void;
  activeDeckMode?: 'idle' | 'audio' | 'youtube';
  filterStatusNote?: string | null;
  crossfadeStatus: CrossfadeStatus;
  masterVolume: number;
  onChangeVolume: (vol: number) => void;
  loopMode: LoopMode;
  onCycleLoopMode: () => void;
  shuffle: boolean;
  onToggleShuffle: () => void;
  keepScreenAwake: boolean;
  onToggleWakeLock: () => void;
  showYoutubeFrame: boolean;
  onToggleYoutubeFrame: () => void;
  onTogglePlay: () => void;
  onSeek: (sec: number) => void;
  onSkipBy: (delta: number) => void;
  onNext: () => void;
  onPrev: () => void;
  onOpenFolderPicker?: (track: Track) => void;
  onCloseSheet?: () => void;
}

const CROSSFADE_OPTIONS = [0, 2, 4, 6, 8, 10];
const INTRO_CACHE_OPTIONS = [0, 5, 8, 12, 15];

export const PlayerDeck: React.FC<PlayerDeckProps> = ({
  currentTrack,
  queueName,
  isPlaying,
  isBuffering,
  currentTime,
  duration,
  playerError,
  crossfadeSeconds,
  onChangeCrossfade,
  introCacheSeconds,
  onChangeIntroCache,
  audioFilter,
  onChangeAudioFilter,
  filterIntensity,
  onChangeFilterIntensity,
  equalizer,
  onChangeEqualizer,
  onResetEqualizer,
  ytAuthStatus,
  ytLoginSuggested = false,
  ytAuthBusy = false,
  onStartYtAuth,
  onLogoutYtAuth,
  activeDeckMode = 'idle',
  filterStatusNote = null,
  crossfadeStatus,
  masterVolume,
  onChangeVolume,
  loopMode,
  onCycleLoopMode,
  shuffle,
  onToggleShuffle,
  keepScreenAwake,
  onToggleWakeLock,
  showYoutubeFrame,
  onToggleYoutubeFrame,
  onTogglePlay,
  onSeek,
  onSkipBy,
  onNext,
  onPrev,
  onOpenFolderPicker,
  onCloseSheet,
}) => {
  const [eqOpen, setEqOpen] = useState(false);
  const safeDuration = duration > 0 ? duration : 0;
  const progressPct = safeDuration > 0 ? Math.min(100, (currentTime / safeDuration) * 100) : 0;
  const eqModified =
    equalizer.bassDb !== 0 || equalizer.midDb !== 0 || equalizer.trebleDb !== 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Header row (mobile sheet dismiss + context) */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-[#9C988E] truncate">
            Reproduciendo desde {queueName}
          </p>
        </div>
        {onCloseSheet && (
          <button
            type="button"
            onClick={onCloseSheet}
            aria-label="Minimizar reproductor"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-[#9C988E] hover:text-[#F2F0EB] hover:bg-white/5"
          >
            <ChevronDown className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Track Title & Source */}
      <div className="flex items-center gap-3.5">
        <div className="w-14 h-14 rounded-2xl border border-white/10 bg-elevated flex items-center justify-center shrink-0 overflow-hidden">
          {currentTrack?.artworkUrl ? (
            <img
              src={currentTrack.artworkUrl}
              alt={currentTrack.title}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          ) : (
            <Waves
              className={`w-6 h-6 ${
                isPlaying ? 'text-accent-light' : 'text-[#8C887E]'
              }`}
            />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="font-display text-lg font-semibold text-[#F2F0EB] truncate">
            {currentTrack ? currentTrack.title : 'Sin pista activa'}
          </h3>
          <p className="text-xs text-[#9C988E] truncate mt-0.5">
            {currentTrack
              ? `${currentTrack.artist} · ${
                  currentTrack.source === 'youtube'
                    ? 'YouTube'
                    : currentTrack.source === 'audius'
                    ? 'Audius'
                    : currentTrack.source === 'local'
                    ? 'Archivo local'
                    : 'Audio libre'
                }`
              : 'Selecciona una canción de tus carpetas'}
          </p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {currentTrack && onOpenFolderPicker && (
            <button
              type="button"
              onClick={() => onOpenFolderPicker(currentTrack)}
              aria-label="Guardar o cambiar carpetas de esta canción"
              title="Guardar en una o varias carpetas"
              className="min-w-[40px] min-h-[40px] rounded-xl border border-white/10 bg-elevated text-[#C7C2B6] hover:border-accent/60 hover:text-accent-light flex items-center justify-center transition"
            >
              <FolderPlus className="w-4 h-4" />
            </button>
          )}

          {currentTrack?.source === 'youtube' && (
            <button
              type="button"
              onClick={onToggleYoutubeFrame}
              className={`min-h-[40px] px-2.5 rounded-xl border text-xs font-medium inline-flex items-center gap-1.5 shrink-0 transition ${
                showYoutubeFrame
                  ? 'border-accent bg-accent/15 text-accent-light'
                  : 'border-white/10 bg-elevated text-[#C7C2B6]'
              }`}
            >
              <Video className="w-3.5 h-3.5" />
              <span>Vídeo</span>
            </button>
          )}
        </div>
      </div>

      {/* Active crossfade indicator */}
      {crossfadeStatus.active && (
        <div className="rounded-xl border border-accent/40 bg-accent/10 px-3 py-2 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-accent-light">
            <span className="truncate">
              {crossfadeStatus.phase === 'loading'
                ? `Cargando "${crossfadeStatus.toTitle || 'siguiente'}" para fundir...`
                : `Fundido hacia ${crossfadeStatus.toTitle || 'siguiente pista'}`}
            </span>
            <span className="font-mono-tabular shrink-0 ml-2 flex items-center gap-1.5">
              {crossfadeStatus.phase === 'loading' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                `${Math.round(crossfadeStatus.progress * 100)}%`
              )}
            </span>
          </div>
          {crossfadeStatus.phase !== 'loading' && (
            <div className="h-1 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full bg-accent-light transition-all duration-75"
                style={{ width: `${Math.round(crossfadeStatus.progress * 100)}%` }}
              />
            </div>
          )}
        </div>
      )}

      {playerError && (
        <div
          className={`rounded-xl border px-3 py-2 text-xs ${
            playerError.includes('Reintentando')
              ? 'border-amber-500/35 bg-amber-500/10 text-amber-200'
              : 'border-rose-500/30 bg-rose-500/10 text-rose-200'
          }`}
        >
          {playerError}
        </div>
      )}

      {/* Scrubbable Progress Bar */}
      <div className="space-y-1.5">
        <input
          type="range"
          min={0}
          max={safeDuration || 100}
          step={0.5}
          value={safeDuration ? Math.min(currentTime, safeDuration) : 0}
          disabled={!currentTrack || !safeDuration}
          onChange={(e) => onSeek(Number(e.target.value))}
          aria-label="Posición de reproducción"
          className="audio-slider w-full h-6 disabled:opacity-40"
          style={{
            background: `linear-gradient(to right, var(--rfa-accent) ${progressPct}%, rgba(255,255,255,0.12) ${progressPct}%)`,
            borderRadius: '9999px',
            height: '6px',
          }}
        />
        <div className="flex items-center justify-between text-xs text-[#9C988E] font-mono-tabular">
          <span>{formatDuration(currentTime)}</span>
          <span>{safeDuration ? formatDuration(safeDuration) : '--:--'}</span>
        </div>
      </div>

      {/* Main Transport Controls: Prev / -10s / Play-Pause / +10s / Next */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onPrev}
          disabled={!currentTrack}
          aria-label="Canción anterior"
          className="min-w-[44px] min-h-[48px] flex items-center justify-center rounded-xl text-[#D6D2C8] hover:text-[#F2F0EB] hover:bg-white/5 disabled:opacity-35 transition"
        >
          <SkipBack className="w-5 h-5" />
        </button>

        <button
          type="button"
          onClick={() => onSkipBy(-10)}
          disabled={!currentTrack}
          aria-label="Atrasar 10 segundos"
          className="min-w-[48px] min-h-[48px] flex flex-col items-center justify-center rounded-xl text-[#D6D2C8] hover:text-[#F2F0EB] hover:bg-white/5 disabled:opacity-35 transition"
        >
          <RotateCcw className="w-4 h-4" />
          <span className="text-[10px] font-mono-tabular mt-0.5">-10s</span>
        </button>

        <button
          type="button"
          onClick={onTogglePlay}
          aria-label={isPlaying ? 'Pausar' : 'Reproducir'}
          className="w-16 h-16 rounded-2xl bg-accent text-accent-contrast flex items-center justify-center shadow-lg hover:bg-accent-light active:scale-[0.97] transition shrink-0"
        >
          {isBuffering ? (
            <Loader2 className="w-6 h-6 animate-spin" />
          ) : isPlaying ? (
            <Pause className="w-7 h-7 fill-current" />
          ) : (
            <Play className="w-7 h-7 fill-current ml-0.5" />
          )}
        </button>

        <button
          type="button"
          onClick={() => onSkipBy(10)}
          disabled={!currentTrack}
          aria-label="Adelantar 10 segundos"
          className="min-w-[48px] min-h-[48px] flex flex-col items-center justify-center rounded-xl text-[#D6D2C8] hover:text-[#F2F0EB] hover:bg-white/5 disabled:opacity-35 transition"
        >
          <RotateCw className="w-4 h-4" />
          <span className="text-[10px] font-mono-tabular mt-0.5">+10s</span>
        </button>

        <button
          type="button"
          onClick={onNext}
          disabled={!currentTrack}
          aria-label="Siguiente canción"
          className="min-w-[44px] min-h-[48px] flex items-center justify-center rounded-xl text-[#D6D2C8] hover:text-[#F2F0EB] hover:bg-white/5 disabled:opacity-35 transition"
        >
          <SkipForward className="w-5 h-5" />
        </button>
      </div>

      {/* Mode toggles: Shuffle / Loop / Keep screen awake */}
      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={onToggleShuffle}
          className={`min-h-[44px] px-2.5 rounded-xl border text-xs font-medium inline-flex items-center justify-center gap-1.5 transition ${
            shuffle
              ? 'border-accent bg-accent/15 text-accent-light'
              : 'border-white/8 bg-elevated/70 text-[#C7C2B6]'
          }`}
        >
          <Shuffle className="w-3.5 h-3.5" />
          <span>Aleatorio</span>
        </button>

        <button
          type="button"
          onClick={onCycleLoopMode}
          className={`min-h-[44px] px-2.5 rounded-xl border text-xs font-medium inline-flex items-center justify-center gap-1.5 transition ${
            loopMode !== 'none'
              ? 'border-accent bg-accent/15 text-accent-light'
              : 'border-white/8 bg-elevated/70 text-[#C7C2B6]'
          }`}
        >
          {loopMode === 'track' ? (
            <Repeat1 className="w-3.5 h-3.5" />
          ) : (
            <Repeat className="w-3.5 h-3.5" />
          )}
          <span>
            {loopMode === 'track'
              ? 'Pista'
              : loopMode === 'folder'
              ? 'Carpeta'
              : 'Sin bucle'}
          </span>
        </button>

        <button
          type="button"
          onClick={onToggleWakeLock}
          title="Evita que se apague la pantalla durante la sesión"
          className={`min-h-[44px] px-2.5 rounded-xl border text-xs font-medium inline-flex items-center justify-center gap-1.5 transition ${
            keepScreenAwake
              ? 'border-accent bg-accent/15 text-accent-light'
              : 'border-white/8 bg-elevated/70 text-[#C7C2B6]'
          }`}
        >
          <Sun className="w-3.5 h-3.5" />
          <span>Pantalla</span>
        </button>
      </div>

      {/* Crossfade selector */}
      <div className="pt-2 border-t border-white/8 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-[#C7C2B6] font-medium">Fundido entre canciones</span>
          <span className="font-mono-tabular text-accent-light">
            {crossfadeSeconds === 0 ? 'Desactivado' : `${crossfadeSeconds}s`}
          </span>
        </div>
        <div className="grid grid-cols-6 gap-1">
          {CROSSFADE_OPTIONS.map((sec) => (
            <button
              key={sec}
              type="button"
              onClick={() => onChangeCrossfade(sec)}
              className={`min-h-[40px] rounded-lg text-xs font-mono-tabular border transition ${
                crossfadeSeconds === sec
                  ? 'border-accent bg-accent text-accent-contrast font-semibold'
                  : 'border-white/8 bg-elevated/60 text-[#C7C2B6] hover:bg-elevated'
              }`}
            >
              {sec === 0 ? 'Off' : `${sec}s`}
            </button>
          ))}
        </div>
      </div>

      {/* Instant intro cache selector */}
      <div className="pt-2 border-t border-white/8 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-[#C7C2B6] font-medium">Inicio instantáneo (precarga)</span>
          <span className="font-mono-tabular text-accent-light">
            {introCacheSeconds === 0 ? 'Desactivado' : `${introCacheSeconds}s`}
          </span>
        </div>
        <div className="grid grid-cols-5 gap-1">
          {INTRO_CACHE_OPTIONS.map((sec) => (
            <button
              key={sec}
              type="button"
              onClick={() => onChangeIntroCache(sec)}
              className={`min-h-[40px] rounded-lg text-xs font-mono-tabular border transition ${
                introCacheSeconds === sec
                  ? 'border-accent bg-accent text-accent-contrast font-semibold'
                  : 'border-white/8 bg-elevated/60 text-[#C7C2B6] hover:bg-elevated'
              }`}
            >
              {sec === 0 ? 'Off' : `${sec}s`}
            </button>
          ))}
        </div>
      </div>

      {/* Acoustic Environment Filters & Fast Local Equalizer */}
      <div className="pt-2 border-t border-white/8 space-y-2.5">
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="text-[#C7C2B6] font-medium">Ambiente acústico (filtros)</span>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-accent-light truncate">
              {AUDIO_FILTER_PRESETS.find((f) => f.id === audioFilter)?.label || 'Normal'}
            </span>
            <button
              type="button"
              onClick={() => setEqOpen((v) => !v)}
              className={`min-h-[30px] px-2 rounded-lg border text-[11px] font-medium inline-flex items-center gap-1 transition ${
                eqOpen || eqModified
                  ? 'border-accent/60 bg-accent/15 text-accent-light'
                  : 'border-white/10 bg-elevated/70 text-[#C7C2B6] hover:text-[#F2F0EB]'
              }`}
            >
              <SlidersHorizontal className="w-3 h-3" />
              <span>EQ{eqModified ? ' •' : ''}</span>
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4 gap-1.5">
          {AUDIO_FILTER_PRESETS.map((preset) => {
            const active = audioFilter === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                title={preset.description}
                onClick={() => onChangeAudioFilter(preset.id)}
                className={`min-h-[40px] px-2 py-1.5 rounded-lg text-[11px] font-medium border transition truncate ${
                  active
                    ? 'border-accent bg-accent text-accent-contrast font-semibold'
                    : 'border-white/8 bg-elevated/60 text-[#C7C2B6] hover:bg-elevated hover:text-[#F2F0EB]'
                }`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>

        {/* Acoustic filter strength slider */}
        <div className="rounded-xl border border-white/8 bg-canvas/45 px-3 py-2 space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-[#C7C2B6] font-medium">Fuerza del filtro acústico</span>
            <span className="font-mono-tabular text-accent-light">
              {Math.round(filterIntensity * 100)}%
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={Math.round(filterIntensity * 100)}
            onChange={(e) => onChangeFilterIntensity(Number(e.target.value) / 100)}
            aria-label="Fuerza del filtro acústico"
            className={`audio-slider w-full h-5 ${audioFilter === 'none' ? 'opacity-65' : ''}`}
            style={{
              background: `linear-gradient(to right, var(--rfa-accent) ${
                Math.round(filterIntensity * 100)
              }%, rgba(255,255,255,0.12) ${Math.round(filterIntensity * 100)}%)`,
              borderRadius: '9999px',
              height: '6px',
            }}
          />
        </div>

        {/* Fast Local 3-Band Equalizer */}
        {eqOpen && (
          <div className="rounded-xl border border-white/10 bg-canvas/60 p-3 space-y-2.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-[#C7C2B6] font-medium">
                Ecualizador local rápido
              </span>
              {eqModified && (
                <button
                  type="button"
                  onClick={onResetEqualizer}
                  className="text-accent-light hover:underline font-medium"
                >
                  Restablecer
                </button>
              )}
            </div>
            {(
              [
                { key: 'bassDb', label: 'Graves', val: equalizer.bassDb },
                { key: 'midDb', label: 'Medios', val: equalizer.midDb },
                { key: 'trebleDb', label: 'Agudos', val: equalizer.trebleDb },
              ] as const
            ).map((band) => (
              <div key={band.key} className="flex items-center gap-2.5">
                <span className="w-14 text-[11px] text-[#9C988E] shrink-0">
                  {band.label}
                </span>
                <input
                  type="range"
                  min={-12}
                  max={12}
                  step={1}
                  value={band.val}
                  aria-label={`Ecualizador ${band.label}`}
                  onChange={(e) =>
                    onChangeEqualizer({
                      ...equalizer,
                      [band.key]: Number(e.target.value),
                    })
                  }
                  className="audio-slider w-full h-5"
                />
                <span className="w-11 text-right text-[11px] font-mono-tabular text-[#D6D2C8] shrink-0">
                  {band.val > 0 ? `+${band.val}` : band.val} dB
                </span>
              </div>
            ))}
          </div>
        )}

        {filterStatusNote ? (
          <p className="text-[11px] text-amber-300/90 leading-snug">
            {filterStatusNote}
          </p>
        ) : (
          (audioFilter !== 'none' || eqModified) &&
          currentTrack?.source === 'youtube' &&
          activeDeckMode === 'audio' && (
            <p className="text-[11px] text-accent-light/90 leading-snug">
              Ecualizador local aplicado al instante sobre YouTube.
            </p>
          )
        )}

        {ytAuthStatus?.available &&
          !ytAuthStatus.authenticated &&
          (ytLoginSuggested || Boolean(ytAuthStatus.pending)) &&
          onStartYtAuth && (
            <div className="rounded-xl border border-accent/35 bg-accent/10 p-2.5 text-xs space-y-2">
              {ytAuthStatus.pending ? (
                <>
                  <p className="text-[#F2F0EB]">
                    Abre{' '}
                    <a
                      href={ytAuthStatus.pending.verificationUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-accent-light underline inline-flex items-center gap-1"
                    >
                      {ytAuthStatus.pending.verificationUrl}
                      <ExternalLink className="w-3 h-3" />
                    </a>{' '}
                    e introduce el código:
                  </p>
                  <div className="font-mono-tabular text-base font-bold tracking-widest text-accent-light">
                    {ytAuthStatus.pending.userCode}
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-[#D6D2C8]">
                    Este vídeo pide verificación en YouTube para ecualizarse.
                  </span>
                  <button
                    type="button"
                    disabled={ytAuthBusy}
                    onClick={onStartYtAuth}
                    className="shrink-0 min-h-[34px] px-2.5 rounded-lg bg-accent text-accent-contrast text-[11px] font-semibold hover:bg-accent-light disabled:opacity-50"
                  >
                    {ytAuthBusy ? 'Conectando...' : 'Vincular YouTube'}
                  </button>
                </div>
              )}
            </div>
          )}

        {ytAuthStatus?.available && ytAuthStatus.authenticated && onLogoutYtAuth && (
          <div className="flex items-center justify-between text-[11px] text-[#9C988E]">
            <span>YouTube vinculado</span>
            <button
              type="button"
              disabled={ytAuthBusy}
              onClick={onLogoutYtAuth}
              className="hover:text-[#F2F0EB] underline"
            >
              Desvincular
            </button>
          </div>
        )}
      </div>

      {/* Master Volume */}
      <div className="flex items-center gap-3 pt-1">
        <Volume2 className="w-4 h-4 text-[#9C988E] shrink-0" />
        <input
          type="range"
          min={0}
          max={1}
          step={0.02}
          value={masterVolume}
          onChange={(e) => onChangeVolume(Number(e.target.value))}
          aria-label="Volumen maestro de música"
          className="audio-slider w-full h-6"
          style={{
            background: `linear-gradient(to right, var(--rfa-accent) ${
              masterVolume * 100
            }%, rgba(255,255,255,0.12) ${masterVolume * 100}%)`,
            borderRadius: '9999px',
            height: '6px',
          }}
        />
        <span className="text-xs font-mono-tabular text-[#9C988E] w-9 text-right shrink-0">
          {Math.round(masterVolume * 100)}%
        </span>
      </div>
    </div>
  );
};
