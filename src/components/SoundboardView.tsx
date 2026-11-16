import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Globe,
  Link2,
  Loader2,
  Pause,
  Play,
  Plus,
  Repeat,
  RotateCcw,
  Search,
  Square,
  Trash2,
  Volume2,
  X,
} from 'lucide-react';
import { formatDuration, searchInternetSfx } from '../services/freeMusicApi';
import { SoundCategory, SoundPad, WikimediaSfxResult } from '../types/audio';

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

const QUICK_SFX_PRESETS: { query: string; label: string; category: SoundCategory }[] = [
  { query: 'sword', label: 'Espada', category: 'combate' },
  { query: 'thunder', label: 'Trueno', category: 'ambiente' },
  { query: 'fire', label: 'Fuego', category: 'ambiente' },
  { query: 'dragon', label: 'Dragón', category: 'criaturas' },
  { query: 'arrow', label: 'Flecha', category: 'combate' },
  { query: 'wind', label: 'Viento', category: 'ambiente' },
  { query: 'horse', label: 'Caballo', category: 'escena' },
  { query: 'bell', label: 'Campana', category: 'escena' },
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

  // Internet SFX search state
  const [sfxQuery, setSfxQuery] = useState('');
  const [sfxLoading, setSfxLoading] = useState(false);
  const [sfxResults, setSfxResults] = useState<WikimediaSfxResult[]>([]);
  const [sfxError, setSfxError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<SoundCategory>('escena');
  const [addedUrls, setAddedUrls] = useState<Record<string, boolean>>({});

  // Preview audio inside search
  const [previewId, setPreviewId] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  // Direct URL fallback inside finder
  const [showUrlForm, setShowUrlForm] = useState(false);
  const [customUrl, setCustomUrl] = useState('');
  const [customName, setCustomName] = useState('');
  const [customLoop, setCustomLoop] = useState(false);

  useEffect(() => {
    return () => {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current.src = '';
      }
    };
  }, []);

  const visiblePads = useMemo(() => {
    if (category === 'all') return pads;
    return pads.filter((p) => p.category === category);
  }, [category, pads]);

  const stopPreview = () => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current.currentTime = 0;
    }
    setPreviewId(null);
  };

  const togglePreview = async (item: WikimediaSfxResult) => {
    if (previewId === item.id) {
      stopPreview();
      return;
    }

    stopPreview();
    if (!previewAudioRef.current) {
      previewAudioRef.current = new Audio();
    }
    const audio = previewAudioRef.current;
    audio.src = item.url;
    audio.volume = 0.85;
    audio.onended = () => setPreviewId(null);
    audio.onerror = () => setPreviewId(null);

    try {
      setPreviewId(item.id);
      await audio.play();
    } catch {
      setPreviewId(null);
    }
  };

  const runSfxSearch = async (term: string, suggestedCat?: SoundCategory) => {
    const clean = term.trim();
    if (!clean) return;
    setSfxQuery(clean);
    if (suggestedCat) setSelectedCategory(suggestedCat);
    setSfxLoading(true);
    setSfxError(null);
    stopPreview();

    try {
      const list = await searchInternetSfx(clean);
      setSfxResults(list);
      if (list.length === 0) {
        setSfxError(
          'Sin resultados para esa búsqueda. Prueba palabras en inglés como "sword", "thunder" o "wolf".'
        );
      }
    } catch {
      setSfxError('No se pudo consultar el catálogo de sonidos ahora mismo.');
    } finally {
      setSfxLoading(false);
    }
  };

  const handlePinSearchResult = (item: WikimediaSfxResult) => {
    onAddPad({
      name: item.title,
      url: item.url,
      category: selectedCategory,
      loop: selectedCategory === 'ambiente',
      sourceLabel: item.sourceLabel || 'Wikimedia Commons',
    });
    setAddedUrls((prev) => ({ ...prev, [item.url]: true }));
  };

  const handleAddCustomUrl = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customUrl.trim()) return;
    onAddPad({
      name: customName.trim() || 'Sonido de internet',
      url: customUrl.trim(),
      category: selectedCategory,
      loop: customLoop,
      sourceLabel: 'URL directa',
    });
    setCustomUrl('');
    setCustomName('');
    setShowUrlForm(false);
  };

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
                ? 'bg-[#1E2128] text-[#F2BE63] border border-[#D99B38]/60'
                : 'bg-[#D99B38] text-[#0D0E11] hover:bg-[#F2BE63]'
            }`}
          >
            {showInternetFinder ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            <span>{showInternetFinder ? 'Cerrar buscador' : 'Buscar sonidos'}</span>
          </button>
        </div>
      </div>

      {/* Inline Internet Sound Search & Add Panel */}
      {showInternetFinder && (
        <div className="rounded-2xl border border-[#D99B38]/35 bg-[#16181D] p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-medium text-[#F2BE63]">
              <Globe className="w-4 h-4 shrink-0" />
              <span>Buscar efectos libres en internet (Wikimedia e Internet Archive)</span>
            </div>
            <button
              type="button"
              onClick={() => setShowUrlForm((v) => !v)}
              className="text-xs text-[#C7C2B6] hover:text-[#F2F0EB] underline underline-offset-4 whitespace-nowrap"
            >
              {showUrlForm ? 'Volver a buscar' : 'Pegar URL'}
            </button>
          </div>

          {!showUrlForm ? (
            <>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  runSfxSearch(sfxQuery);
                }}
                className="flex items-center gap-2"
              >
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-[#8C887E] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="search"
                    value={sfxQuery}
                    onChange={(e) => setSfxQuery(e.target.value)}
                    placeholder="Buscar efecto (ej. espada, trueno, dragón, fuego)..."
                    className="w-full min-h-[44px] pl-9 pr-3 rounded-xl bg-[#0D0E11] border border-white/12 text-sm text-[#F2F0EB] placeholder:text-[#78746C] focus:outline-none focus:border-[#D99B38]"
                  />
                </div>
                <button
                  type="submit"
                  disabled={sfxLoading}
                  className="min-h-[44px] px-4 rounded-xl bg-[#D99B38] text-[#0D0E11] text-xs font-semibold hover:bg-[#F2BE63] shrink-0"
                >
                  {sfxLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Buscar'}
                </button>
              </form>

              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                {QUICK_SFX_PRESETS.map((preset) => (
                  <button
                    key={preset.query}
                    type="button"
                    onClick={() => runSfxSearch(preset.query, preset.category)}
                    className="min-h-[36px] px-3 py-1 rounded-lg border border-white/8 bg-[#0D0E11] text-xs text-[#C7C2B6] hover:border-[#D99B38]/50 hover:text-[#F2BE63] whitespace-nowrap shrink-0 transition"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="text-[#9C988E]">Guardar nuevos sonidos en:</span>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value as SoundCategory)}
                  className="min-h-[38px] px-2.5 rounded-lg bg-[#0D0E11] border border-white/12 text-xs text-[#F2F0EB]"
                >
                  <option value="ambiente">Ambiente</option>
                  <option value="combate">Combate</option>
                  <option value="criaturas">Criaturas</option>
                  <option value="escena">Escena</option>
                </select>
              </div>

              {sfxError && <p className="text-xs text-rose-400">{sfxError}</p>}

              {sfxLoading && (
                <div className="py-5 flex items-center justify-center gap-2 text-xs text-[#9C988E]">
                  <Loader2 className="w-4 h-4 animate-spin text-[#D99B38]" />
                  <span>Buscando efectos gratuitos...</span>
                </div>
              )}

              {!sfxLoading && sfxResults.length > 0 && (
                <div className="rounded-xl border border-white/10 bg-[#0D0E11] divide-y divide-white/6 max-h-64 overflow-y-auto">
                  {sfxResults.map((item) => {
                    const isPreviewing = previewId === item.id;
                    const alreadyAdded =
                      addedUrls[item.url] || pads.some((p) => p.url === item.url);

                    return (
                      <div
                        key={item.id}
                        className="flex items-center justify-between gap-2 px-3 py-2.5 min-h-[56px]"
                      >
                        <button
                          type="button"
                          onClick={() => togglePreview(item)}
                          aria-label={isPreviewing ? 'Detener prueba' : 'Probar sonido'}
                          className={`min-w-[40px] min-h-[40px] rounded-lg flex items-center justify-center shrink-0 transition ${
                            isPreviewing
                              ? 'bg-[#D99B38] text-[#0D0E11]'
                              : 'bg-[#1E2128] text-[#D6D2C8] hover:text-[#F2BE63]'
                          }`}
                        >
                          {isPreviewing ? (
                            <Pause className="w-4 h-4 fill-current" />
                          ) : (
                            <Play className="w-4 h-4 fill-current ml-0.5" />
                          )}
                        </button>

                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-medium text-[#F2F0EB] truncate">
                            {item.title}
                          </div>
                          <div className="text-[11px] text-[#8C887E] font-mono-tabular">
                            {item.sourceLabel || 'Wikimedia'}
                            {item.duration ? ` · ${formatDuration(item.duration)}` : ''}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handlePinSearchResult(item)}
                          disabled={alreadyAdded}
                          className={`min-h-[38px] px-3 rounded-lg text-xs font-semibold shrink-0 inline-flex items-center gap-1 transition ${
                            alreadyAdded
                              ? 'bg-[#1E2128] text-[#F2BE63] border border-[#D99B38]/40'
                              : 'bg-[#D99B38] text-[#0D0E11] hover:bg-[#F2BE63]'
                          }`}
                        >
                          {alreadyAdded ? (
                            <>
                              <Check className="w-3.5 h-3.5" />
                              <span>Añadido</span>
                            </>
                          ) : (
                            <>
                              <Plus className="w-3.5 h-3.5" />
                              <span>Añadir</span>
                            </>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <form onSubmit={handleAddCustomUrl} className="space-y-2.5">
              <input
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="Nombre del botón (ej. Rugido de dragón)"
                className="w-full min-h-[44px] px-3 rounded-xl bg-[#0D0E11] border border-white/12 text-sm text-[#F2F0EB]"
              />
              <div className="relative">
                <Link2 className="w-4 h-4 text-[#8C887E] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="url"
                  value={customUrl}
                  onChange={(e) => setCustomUrl(e.target.value)}
                  placeholder="https://.../efecto.mp3"
                  className="w-full min-h-[44px] pl-9 pr-3 rounded-xl bg-[#0D0E11] border border-white/12 text-sm text-[#F2F0EB]"
                />
              </div>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value as SoundCategory)}
                  className="min-h-[42px] px-3 rounded-xl bg-[#0D0E11] border border-white/12 text-xs text-[#F2F0EB]"
                >
                  <option value="ambiente">Ambiente</option>
                  <option value="combate">Combate</option>
                  <option value="criaturas">Criaturas</option>
                  <option value="escena">Escena</option>
                </select>

                <label className="inline-flex items-center gap-2 text-xs text-[#C7C2B6] min-h-[42px] px-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={customLoop}
                    onChange={(e) => setCustomLoop(e.target.checked)}
                    className="accent-[#D99B38] w-4 h-4"
                  />
                  <span>Repetir en bucle</span>
                </label>

                <button
                  type="submit"
                  className="min-h-[42px] px-4 rounded-xl bg-[#D99B38] text-[#0D0E11] text-xs font-semibold hover:bg-[#F2BE63]"
                >
                  Guardar sonido
                </button>
              </div>
            </form>
          )}
        </div>
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
                  : 'bg-[#16181D] text-[#C7C2B6] border-white/8 hover:bg-[#1E2128]'
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
          className="min-w-[40px] min-h-[40px] rounded-xl border border-white/8 bg-[#16181D] text-[#9C988E] hover:text-[#F2F0EB] flex items-center justify-center shrink-0"
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
                  ? 'border-[#D99B38] bg-[#D99B38]/15'
                  : 'border-white/10 bg-[#16181D] hover:bg-[#1E2128]'
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
                        ? 'text-[#F2BE63] bg-[#D99B38]/20'
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
                      background: `linear-gradient(to right, #D99B38 ${
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
