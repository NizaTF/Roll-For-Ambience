import React, { useMemo, useState } from 'react';
import {
  Plus,
  Repeat,
  RotateCcw,
  Square,
  Trash2,
  Volume2,
  X,
} from 'lucide-react';
import { SoundCategory, SoundPad } from '../types/audio';
import { SoundFinderPanel } from './SoundFinderPanel';

interface SoundboardViewProps {
  pads: SoundPad[];
  activePadIds: Record<string, boolean>;
  loadingPadIds: Record<string, boolean>;
  padErrors: Record<string, string>;
  activeCount: number;
  onTogglePad: (pad: SoundPad) => void;
  onToggleLoop: (padId: string) => void;
  onSetPadVolume: (padId: string, volume: number) => void;
  onStopAll: () => void;
  onAddPad: (input: {
    name: string;
    url: string;
    category: SoundCategory;
    loop: boolean;
    sourceLabel: string;
  }) => void;
  onRemovePad: (padId: string) => void;
  onResetStarterPads: () => void;
}

const CATEGORIES: { value: 'all' | SoundCategory; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'ambiente', label: 'Ambiente' },
  { value: 'combate', label: 'Combate' },
  { value: 'criaturas', label: 'Criaturas' },
  { value: 'escena', label: 'Escena' },
];

export const SoundboardView: React.FC<SoundboardViewProps> = ({
  pads,
  activePadIds,
  loadingPadIds,
  padErrors,
  activeCount,
  onTogglePad,
  onToggleLoop,
  onSetPadVolume,
  onStopAll,
  onAddPad,
  onRemovePad,
  onResetStarterPads,
}) => {
  const [category, setCategory] = useState<'all' | SoundCategory>('all');
  const [showInternetFinder, setShowInternetFinder] = useState(false);

  const visiblePads = useMemo(() => {
    if (category === 'all') return pads;
    return pads.filter((p) => p.category === category);
  }, [category, pads]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="font-display text-xl sm:text-2xl font-semibold text-[#F2F0EB]">
            Panel de sonidos
          </h2>
          <p className="text-xs text-[#9C988E] mt-0.5">
            Efectos simultáneos sobre la música · búsqueda gratuita en internet
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {activeCount > 0 && (
            <button
              type="button"
              onClick={onStopAll}
              className="min-h-[44px] px-3.5 py-2 rounded-xl border border-rose-500/40 bg-rose-500/15 text-rose-200 text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-rose-500/25 transition whitespace-nowrap"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>Detener ({activeCount})</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowInternetFinder((v) => !v)}
            className={`min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition whitespace-nowrap ${
              showInternetFinder
                ? 'bg-elevated text-accent-light border border-accent/60'
                : 'bg-accent text-accent-contrast hover:bg-accent-light'
            }`}
          >
            {showInternetFinder ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            <span>{showInternetFinder ? 'Cerrar buscador' : 'Buscar sonidos'}</span>
          </button>
        </div>
      </div>

      {/* Inline Internet Sound Search & Add Panel */}
      {showInternetFinder && (
        <SoundFinderPanel
          pads={pads}
          onAddPad={onAddPad}
          onRemovePad={onRemovePad}
          compact
        />
      )}

      {/* Category tabs */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              type="button"
              onClick={() => setCategory(cat.value)}
              className={`min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs font-medium border transition whitespace-nowrap shrink-0 ${
                category === cat.value
                  ? 'bg-[#F2F0EB] text-[#0D0E11] border-[#F2F0EB] font-semibold'
                  : 'bg-surface text-[#C7C2B6] border-white/8 hover:bg-elevated'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={onResetStarterPads}
          title="Restaurar sonidos iniciales"
          aria-label="Restaurar sonidos iniciales"
          className="min-w-[40px] min-h-[40px] rounded-xl border border-white/8 bg-surface text-[#9C988E] hover:text-[#F2F0EB] flex items-center justify-center shrink-0"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      {/* Tactile Sound Pad Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {visiblePads.map((pad) => {
          const isActive = Boolean(activePadIds[pad.id]);
          const isLoading = Boolean(loadingPadIds[pad.id]);
          const error = padErrors[pad.id];

          return (
            <div
              key={pad.id}
              className={`rounded-2xl border p-3 flex flex-col justify-between min-h-[118px] transition ${
                isActive
                  ? 'border-accent bg-accent/15'
                  : 'border-white/10 bg-surface hover:bg-elevated'
              }`}
            >
              <div className="flex items-start justify-between gap-1">
                <button
                  type="button"
                  onClick={() => onTogglePad(pad)}
                  className="flex-1 text-left min-h-[48px] pr-1 active:scale-[0.98] transition-transform"
                >
                  <div className="text-sm font-semibold text-[#F2F0EB] leading-snug line-clamp-2">
                    {pad.name}
                  </div>
                  <div className="text-[11px] text-[#9C988E] mt-1">
                    {isLoading
                      ? 'Cargando...'
                      : isActive
                      ? 'Sonando'
                      : pad.category}
                  </div>
                </button>

                <div className="flex flex-col items-end shrink-0">
                  <button
                    type="button"
                    onClick={() => onToggleLoop(pad.id)}
                    aria-label={pad.loop ? 'Desactivar bucle' : 'Activar bucle'}
                    title={pad.loop ? 'Bucle activo' : 'Un disparo'}
                    className={`min-w-[40px] min-h-[40px] rounded-lg flex items-center justify-center transition ${
                      pad.loop
                        ? 'text-accent-light bg-accent/20'
                        : 'text-[#78746C] hover:text-[#D6D2C8]'
                    }`}
                  >
                    <Repeat className="w-4 h-4" />
                  </button>
                  {pad.isCustom && (
                    <button
                      type="button"
                      onClick={() => onRemovePad(pad.id)}
                      aria-label="Eliminar sonido"
                      className="min-w-[40px] min-h-[36px] rounded-lg flex items-center justify-center text-[#78746C] hover:text-rose-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {error ? (
                <p className="text-[11px] text-rose-400 mt-2">{error}</p>
              ) : (
                <div className="mt-2 flex items-center gap-2">
                  <Volume2 className="w-3.5 h-3.5 text-[#8C887E] shrink-0" />
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={pad.volume}
                    onChange={(e) => onSetPadVolume(pad.id, Number(e.target.value))}
                    aria-label={`Volumen de ${pad.name}`}
                    className="audio-slider w-full h-5"
                    style={{
                      background: `linear-gradient(to right, var(--rfa-accent) ${
                        pad.volume * 100
                      }%, rgba(255,255,255,0.12) ${pad.volume * 100}%)`,
                      borderRadius: '9999px',
                      height: '5px',
                    }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
