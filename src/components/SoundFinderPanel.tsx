import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  Globe,
  HardDriveUpload,
  Link2,
  Loader2,
  Pause,
  Play,
  Plus,
  Repeat,
  Search,
  Trash2,
} from 'lucide-react';
import { formatDuration, searchInternetSfx } from '../services/freeMusicApi';
import {
  formatBytes,
  isLocalMediaUrl,
  isSupportedAudioFile,
  resolveLocalMediaUrl,
  saveLocalAudioFile,
} from '../services/localMedia';
import { SoundCategory, SoundPad, WikimediaSfxResult } from '../types/audio';

interface SoundFinderPanelProps {
  pads: SoundPad[];
  onAddPad: (input: {
    name: string;
    url: string;
    category: SoundCategory;
    loop: boolean;
    sourceLabel: string;
  }) => void;
  onRemovePad?: (padId: string) => void;
  onGoToSoundboard?: () => void;
  compact?: boolean;
}

type FinderMode = 'catalog' | 'local' | 'url';

const QUICK_SFX_PRESETS: {
  query: string;
  label: string;
  category: SoundCategory;
  loop?: boolean;
}[] = [
  { query: 'sword', label: 'Espada', category: 'combate' },
  { query: 'thunder', label: 'Trueno', category: 'ambiente' },
  { query: 'rain', label: 'Lluvia', category: 'ambiente', loop: true },
  { query: 'fire', label: 'Hoguera', category: 'ambiente', loop: true },
  { query: 'dragon', label: 'Dragón', category: 'criaturas' },
  { query: 'wolf', label: 'Lobo', category: 'criaturas' },
  { query: 'arrow', label: 'Flecha', category: 'combate' },
  { query: 'wind', label: 'Viento', category: 'ambiente', loop: true },
  { query: 'door', label: 'Puerta', category: 'escena' },
  { query: 'coins', label: 'Monedas', category: 'escena' },
  { query: 'magic', label: 'Magia', category: 'combate' },
  { query: 'horse', label: 'Caballo', category: 'escena' },
  { query: 'bell', label: 'Campana', category: 'escena' },
  { query: 'drums', label: 'Tambores', category: 'combate', loop: true },
];

export const SoundFinderPanel: React.FC<SoundFinderPanelProps> = ({
  pads,
  onAddPad,
  onRemovePad,
  onGoToSoundboard,
  compact = false,
}) => {
  const [mode, setMode] = useState<FinderMode>('catalog');
  const [sfxQuery, setSfxQuery] = useState('');
  const [sfxLoading, setSfxLoading] = useState(false);
  const [sfxResults, setSfxResults] = useState<WikimediaSfxResult[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [sfxError, setSfxError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<SoundCategory>('escena');
  const [addWithLoop, setAddWithLoop] = useState(false);
  const [addedUrls, setAddedUrls] = useState<Record<string, boolean>>({});
  const [previewErrorId, setPreviewErrorId] = useState<string | null>(null);

  // Preview audio inside search
  const [previewId, setPreviewId] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  // Local audio file import state
  const localFileInputRef = useRef<HTMLInputElement | null>(null);
  const [localImporting, setLocalImporting] = useState(false);
  const [localNotice, setLocalNotice] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [localCustomTitle, setLocalCustomTitle] = useState('');

  // Direct URL mode
  const [customUrl, setCustomUrl] = useState('');
  const [customName, setCustomName] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);
  const [urlNotice, setUrlNotice] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current.src = '';
      }
    };
  }, []);

  const stopPreview = () => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current.currentTime = 0;
    }
    setPreviewId(null);
  };

  const togglePreviewUrl = async (id: string, url: string) => {
    if (previewId === id) {
      stopPreview();
      return;
    }

    stopPreview();
    setPreviewErrorId(null);
    if (!previewAudioRef.current) {
      previewAudioRef.current = new Audio();
    }
    const audio = previewAudioRef.current;

    try {
      const resolvedUrl = isLocalMediaUrl(url) ? await resolveLocalMediaUrl(url) : url;
      audio.src = resolvedUrl;
      audio.volume = 0.85;
      audio.onended = () => setPreviewId(null);
      audio.onerror = () => {
        setPreviewId(null);
        setPreviewErrorId(id);
      };
      setPreviewId(id);
      await audio.play();
    } catch {
      setPreviewId(null);
      setPreviewErrorId(id);
    }
  };

  const runSfxSearch = async (
    term: string,
    suggestedCat?: SoundCategory,
    suggestedLoop?: boolean
  ) => {
    const clean = term.trim();
    if (!clean) return;
    setSfxQuery(clean);
    if (suggestedCat) {
      setSelectedCategory(suggestedCat);
      setAddWithLoop(suggestedLoop ?? suggestedCat === 'ambiente');
    }
    setSfxLoading(true);
    setHasSearched(true);
    setSfxError(null);
    setPreviewErrorId(null);
    stopPreview();

    try {
      const list = await searchInternetSfx(clean);
      setSfxResults(list);
      if (list.length === 0) {
        setSfxError(
          'Sin resultados para esa búsqueda. Prueba palabras como "espada", "trueno", "lluvia" o en inglés ("sword", "wolf").'
        );
      }
    } catch {
      setSfxError('No se pudo consultar el catálogo de sonidos ahora mismo.');
    } finally {
      setSfxLoading(false);
    }
  };

  const handleCategoryChange = (cat: SoundCategory) => {
    setSelectedCategory(cat);
    if (cat === 'ambiente') {
      setAddWithLoop(true);
    }
  };

  const handlePinSearchResult = (item: WikimediaSfxResult) => {
    onAddPad({
      name: item.title,
      url: item.url,
      category: selectedCategory,
      loop: addWithLoop,
      sourceLabel: item.sourceLabel || 'Wikimedia SFX',
    });
    setAddedUrls((prev) => ({ ...prev, [item.url]: true }));
  };

  const handleRemoveByUrl = (url: string) => {
    if (!onRemovePad) return;
    const match = pads.find((p) => p.url === url && p.isCustom);
    if (match) {
      onRemovePad(match.id);
      setAddedUrls((prev) => {
        const next = { ...prev };
        delete next[url];
        return next;
      });
    }
  };

  const handleImportLocalFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    const validFiles = files.filter(isSupportedAudioFile);

    setLocalError(null);
    setLocalNotice(null);

    if (validFiles.length === 0) {
      setLocalError(
        'Selecciona archivos de audio válidos (.mp3, .ogg, .wav, .m4a, .flac).'
      );
      return;
    }

    setLocalImporting(true);
    let importedCount = 0;
    let totalBytes = 0;

    try {
      for (let i = 0; i < validFiles.length; i += 1) {
        const file = validFiles[i];
        const titleOverride =
          validFiles.length === 1 && localCustomTitle.trim()
            ? localCustomTitle.trim()
            : undefined;
        const saved = await saveLocalAudioFile(file, 'sfx', titleOverride);
        onAddPad({
          name: saved.title,
          url: saved.mediaUrl,
          category: selectedCategory,
          loop: addWithLoop,
          sourceLabel: 'Archivo local',
        });
        importedCount += 1;
        totalBytes += saved.size;
      }

      setLocalNotice(
        importedCount === 1
          ? `Sonido guardado en el Soundboard (${formatBytes(totalBytes)})`
          : `${importedCount} sonidos importados al Soundboard (${formatBytes(totalBytes)})`
      );
      setLocalCustomTitle('');
    } catch (err) {
      setLocalError(
        err instanceof Error ? err.message : 'No se pudieron importar los archivos.'
      );
    } finally {
      setLocalImporting(false);
    }
  };

  const handleAddCustomUrl = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = customUrl.trim();
    if (!raw) return;
    setUrlError(null);
    setUrlNotice(null);

    try {
      const parsed = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
      const fallbackName = decodeURIComponent(
        parsed.pathname.split('/').pop() || 'Sonido de internet'
      ).replace(/\.(mp3|ogg|wav|m4a)$/i, '');

      const finalName = customName.trim() || fallbackName || 'Sonido de internet';
      onAddPad({
        name: finalName,
        url: parsed.toString(),
        category: selectedCategory,
        loop: addWithLoop,
        sourceLabel: 'URL directa',
      });
      setUrlNotice(`"${finalName}" añadido al Soundboard`);
      setCustomUrl('');
      setCustomName('');
      if (compact) {
        setMode('catalog');
      }
    } catch {
      setUrlError('URL no válida. Pega un enlace directo a un archivo .mp3, .ogg o .wav.');
    }
  };

  const localPads = pads.filter((p) => isLocalMediaUrl(p.url));

  return (
    <div
      className={
        compact
          ? 'rounded-2xl border border-accent/35 bg-surface p-4 space-y-3'
          : 'space-y-3'
      }
    >
      {/* Mode switch: Online Catalog / Local File / Direct URL */}
      <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-surface border border-white/10">
        <button
          type="button"
          onClick={() => {
            setMode('catalog');
            setUrlError(null);
            setLocalError(null);
          }}
          className={`min-h-[40px] px-2 py-1.5 rounded-lg text-xs font-medium inline-flex items-center justify-center gap-1.5 transition whitespace-nowrap ${
            mode === 'catalog'
              ? 'bg-accent text-accent-contrast font-semibold'
              : 'text-[#C7C2B6] hover:text-[#F2F0EB]'
          }`}
        >
          <Globe className="w-3.5 h-3.5 shrink-0" />
          <span>Online</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setMode('local');
            setUrlError(null);
            setLocalError(null);
          }}
          className={`min-h-[40px] px-2 py-1.5 rounded-lg text-xs font-medium inline-flex items-center justify-center gap-1.5 transition whitespace-nowrap ${
            mode === 'local'
              ? 'bg-accent text-accent-contrast font-semibold'
              : 'text-[#C7C2B6] hover:text-[#F2F0EB]'
          }`}
        >
          <HardDriveUpload className="w-3.5 h-3.5 shrink-0" />
          <span>Archivo local</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setMode('url');
            setUrlError(null);
            setLocalError(null);
          }}
          className={`min-h-[40px] px-2 py-1.5 rounded-lg text-xs font-medium inline-flex items-center justify-center gap-1.5 transition whitespace-nowrap ${
            mode === 'url'
              ? 'bg-accent text-accent-contrast font-semibold'
              : 'text-[#C7C2B6] hover:text-[#F2F0EB]'
          }`}
        >
          <Link2 className="w-3.5 h-3.5 shrink-0" />
          <span>Pegar URL</span>
        </button>
      </div>

      {/* Shared options row: category + loop toggle */}
      <div className="rounded-xl border border-white/8 bg-surface px-3 py-2.5 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-[#9C988E]">Categoría al añadir:</span>
          <select
            value={selectedCategory}
            onChange={(e) => handleCategoryChange(e.target.value as SoundCategory)}
            className="min-h-[38px] px-2.5 rounded-lg bg-canvas border border-white/12 text-xs text-[#F2F0EB] focus:outline-none focus:border-accent"
          >
            <option value="ambiente">Ambiente</option>
            <option value="combate">Combate</option>
            <option value="criaturas">Criaturas</option>
            <option value="escena">Escena</option>
          </select>
        </div>

        <button
          type="button"
          onClick={() => setAddWithLoop((v) => !v)}
          aria-pressed={addWithLoop}
          className={`min-h-[38px] px-3 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 transition ${
            addWithLoop
              ? 'border-accent/60 bg-accent/15 text-accent-light'
              : 'border-white/10 bg-canvas text-[#9C988E] hover:text-[#F2F0EB]'
          }`}
        >
          <Repeat className="w-3.5 h-3.5" />
          <span>{addWithLoop ? 'Con bucle activo' : 'Un disparo'}</span>
        </button>
      </div>

      {mode === 'catalog' && (
        <>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              runSfxSearch(sfxQuery);
            }}
            className="flex items-center gap-2"
          >
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-[#8C887E] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={sfxQuery}
                onChange={(e) => setSfxQuery(e.target.value)}
                placeholder="Buscar sonido (ej. espada, trueno, dragón, taberna, lluvia)..."
                className={`w-full min-h-[46px] pl-10 pr-3 rounded-xl border border-white/12 text-sm text-[#F2F0EB] placeholder:text-[#78746C] focus:outline-none focus:border-accent ${
                  compact ? 'bg-canvas' : 'bg-surface'
                }`}
              />
            </div>
            <button
              type="submit"
              disabled={sfxLoading}
              className="min-h-[46px] px-4 rounded-xl bg-accent text-accent-contrast text-sm font-semibold hover:bg-accent-light disabled:opacity-60 transition shrink-0"
            >
              {sfxLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Buscar'}
            </button>
          </form>

          {/* Quick D&D SFX chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {QUICK_SFX_PRESETS.map((preset) => (
              <button
                key={preset.query}
                type="button"
                onClick={() => runSfxSearch(preset.query, preset.category, preset.loop)}
                className={`min-h-[36px] px-3 py-1.5 rounded-lg border border-white/8 text-xs text-[#C7C2B6] hover:border-accent/50 hover:text-accent-light whitespace-nowrap shrink-0 transition ${
                  compact ? 'bg-canvas' : 'bg-surface'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {sfxError && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">
              {sfxError}
            </div>
          )}

          {sfxLoading ? (
            <div className="rounded-2xl border border-white/8 bg-surface p-8 flex flex-col items-center justify-center gap-2 text-xs text-[#9C988E]">
              <Loader2 className="w-5 h-5 animate-spin text-accent" />
              <span>Buscando efectos gratuitos...</span>
            </div>
          ) : sfxResults.length > 0 ? (
            <div
              className={`rounded-2xl border border-white/10 divide-y divide-white/6 overflow-hidden ${
                compact ? 'bg-canvas max-h-64 overflow-y-auto' : 'bg-surface'
              }`}
            >
              {sfxResults.map((item) => {
                const isPreviewing = previewId === item.id;
                const matchingCustomPad = pads.find((p) => p.url === item.url);
                const alreadyAdded = Boolean(addedUrls[item.url] || matchingCustomPad);
                const hasPreviewError = previewErrorId === item.id;

                return (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-2.5 px-3 py-2.5 min-h-[60px] hover:bg-white/[0.02] transition"
                  >
                    <button
                      type="button"
                      onClick={() => togglePreviewUrl(item.id, item.url)}
                      aria-label={isPreviewing ? 'Detener prueba' : 'Probar sonido'}
                      className={`min-w-[42px] min-h-[42px] rounded-xl flex items-center justify-center shrink-0 border transition ${
                        isPreviewing
                          ? 'bg-accent text-accent-contrast border-accent'
                          : 'bg-elevated text-[#D6D2C8] border-white/8 hover:text-accent-light'
                      }`}
                    >
                      {isPreviewing ? (
                        <Pause className="w-4 h-4 fill-current" />
                      ) : (
                        <Play className="w-4 h-4 fill-current ml-0.5" />
                      )}
                    </button>

                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-[#F2F0EB] truncate">
                        {item.title}
                      </div>
                      <div className="text-[11px] text-[#8C887E] font-mono-tabular flex items-center gap-1.5 truncate mt-0.5">
                        <span>{item.sourceLabel || 'Wikimedia SFX'}</span>
                        {item.duration ? (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{formatDuration(item.duration)}</span>
                          </>
                        ) : null}
                        {hasPreviewError && (
                          <span className="text-rose-400">· No se pudo previsualizar</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {alreadyAdded && matchingCustomPad?.isCustom && onRemovePad && (
                        <button
                          type="button"
                          onClick={() => handleRemoveByUrl(item.url)}
                          aria-label="Quitar del Soundboard"
                          title="Quitar del Soundboard"
                          className="min-w-[40px] min-h-[40px] rounded-xl border border-white/10 bg-elevated text-[#9C988E] hover:text-rose-400 flex items-center justify-center transition"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handlePinSearchResult(item)}
                        disabled={alreadyAdded}
                        className={`min-h-[42px] px-3 rounded-xl text-xs font-semibold shrink-0 inline-flex items-center gap-1.5 transition ${
                          alreadyAdded
                            ? 'bg-accent/12 text-accent-light border border-accent/50'
                            : 'bg-accent text-accent-contrast hover:bg-accent-light'
                        }`}
                      >
                        {alreadyAdded ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>En Soundboard</span>
                          </>
                        ) : (
                          <>
                            <Plus className="w-3.5 h-3.5" />
                            <span>Añadir</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : !hasSearched ? (
            <div className="rounded-2xl border border-white/8 bg-surface p-5 text-sm text-[#9C988E]">
              Busca efectos de sonido gratuitos (espadas, truenos, lluvia, criaturas, ambiente de
              taberna...), pruébalos al instante y añádelos directamente a tu panel de Soundboard.
            </div>
          ) : null}
        </>
      )}

      {mode === 'local' && (
        <div className="space-y-3">
          <div className="rounded-2xl border border-white/10 bg-surface p-4 space-y-3">
            <div>
              <label className="block text-xs text-[#9C988E] mb-1.5">
                Nombre personalizado (opcional, si subes 1 sonido)
              </label>
              <input
                type="text"
                value={localCustomTitle}
                onChange={(e) => setLocalCustomTitle(e.target.value)}
                placeholder="Ej. Puerta secreta abriéndose"
                className="w-full min-h-[44px] px-3.5 rounded-xl bg-canvas border border-white/12 text-sm text-[#F2F0EB] placeholder:text-[#78746C] focus:outline-none focus:border-accent"
              />
            </div>

            <input
              ref={localFileInputRef}
              type="file"
              accept="audio/*,.mp3,.ogg,.oga,.wav,.m4a,.flac,.aac,.opus"
              multiple
              onChange={(e) => {
                handleImportLocalFiles(e.target.files);
                e.target.value = '';
              }}
              className="hidden"
            />

            <button
              type="button"
              disabled={localImporting}
              onClick={() => localFileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                handleImportLocalFiles(e.dataTransfer.files);
              }}
              className="w-full min-h-[112px] rounded-xl border border-dashed border-accent/45 bg-canvas/60 hover:bg-accent/10 hover:border-accent px-4 py-4 flex flex-col items-center justify-center gap-2 text-center transition"
            >
              {localImporting ? (
                <>
                  <Loader2 className="w-6 h-6 animate-spin text-accent" />
                  <span className="text-xs text-[#F2F0EB]">
                    Guardando sonidos en el dispositivo...
                  </span>
                </>
              ) : (
                <>
                  <HardDriveUpload className="w-6 h-6 text-accent" />
                  <div className="text-sm font-medium text-[#F2F0EB]">
                    Seleccionar o arrastrar audios locales
                  </div>
                  <div className="text-[11px] text-[#8C887E]">
                    MP3, OGG, WAV, M4A · Puedes elegir varios sonidos a la vez (100% offline)
                  </div>
                </>
              )}
            </button>

            {localError && <p className="text-xs text-rose-400">{localError}</p>}
            {localNotice && (
              <p className="text-xs text-accent-light flex items-center gap-1.5">
                <Check className="w-4 h-4 shrink-0" />
                <span>{localNotice}</span>
              </p>
            )}
          </div>

          {localPads.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-medium text-[#C7C2B6]">
                Sonidos locales en el Soundboard ({localPads.length})
              </div>
              <div className="rounded-2xl border border-white/10 bg-surface divide-y divide-white/6 overflow-hidden">
                {localPads.map((pad) => {
                  const isPreviewing = previewId === pad.id;
                  return (
                    <div
                      key={pad.id}
                      className="flex items-center justify-between gap-2.5 px-3 py-2.5 min-h-[56px]"
                    >
                      <button
                        type="button"
                        onClick={() => togglePreviewUrl(pad.id, pad.url)}
                        aria-label={isPreviewing ? 'Detener prueba' : 'Probar sonido'}
                        className={`min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center shrink-0 border transition ${
                          isPreviewing
                            ? 'bg-accent text-accent-contrast border-accent'
                            : 'bg-elevated text-[#D6D2C8] border-white/8 hover:text-accent-light'
                        }`}
                      >
                        {isPreviewing ? (
                          <Pause className="w-4 h-4 fill-current" />
                        ) : (
                          <Play className="w-4 h-4 fill-current ml-0.5" />
                        )}
                      </button>

                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-[#F2F0EB] truncate">
                          {pad.name}
                        </div>
                        <div className="text-[11px] text-[#8C887E] truncate">
                          {pad.category} · {pad.loop ? 'En bucle' : 'Un disparo'}
                        </div>
                      </div>

                      {onRemovePad && (
                        <button
                          type="button"
                          onClick={() => onRemovePad(pad.id)}
                          aria-label="Eliminar sonido"
                          className="min-w-[40px] min-h-[40px] rounded-xl border border-white/10 bg-elevated text-[#9C988E] hover:text-rose-400 flex items-center justify-center shrink-0 transition"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {mode === 'url' && (
        <form
          onSubmit={handleAddCustomUrl}
          className="rounded-2xl border border-white/8 bg-surface p-4 space-y-3"
        >
          <div>
            <label className="block text-xs text-[#9C988E] mb-1.5">
              Nombre del botón en el Soundboard
            </label>
            <input
              type="text"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="Ej. Rugido de dragón"
              className="w-full min-h-[44px] px-3.5 rounded-xl bg-canvas border border-white/12 text-sm text-[#F2F0EB] placeholder:text-[#78746C] focus:outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="block text-xs text-[#9C988E] mb-1.5">
              Enlace directo de audio (.mp3 / .ogg / .wav)
            </label>
            <div className="relative">
              <Link2 className="w-4 h-4 text-[#8C887E] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                placeholder="https://.../efecto.mp3"
                className="w-full min-h-[44px] pl-10 pr-3 rounded-xl bg-canvas border border-white/12 text-sm text-[#F2F0EB] placeholder:text-[#78746C] focus:outline-none focus:border-accent"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full min-h-[44px] px-4 rounded-xl bg-accent text-accent-contrast text-xs font-semibold hover:bg-accent-light transition"
          >
            Añadir al Soundboard
          </button>

          {urlError && <p className="text-xs text-rose-400">{urlError}</p>}
          {urlNotice && (
            <p className="text-xs text-accent-light flex items-center gap-1.5">
              <Check className="w-4 h-4 shrink-0" />
              <span>{urlNotice}</span>
            </p>
          )}
        </form>
      )}

      {onGoToSoundboard && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-surface px-3.5 py-2.5">
          <span className="text-xs text-[#9C988E]">
            Tu Soundboard tiene <strong className="text-[#F2F0EB]">{pads.length}</strong>{' '}
            {pads.length === 1 ? 'sonido' : 'sonidos'} listos para disparar.
          </span>
          <button
            type="button"
            onClick={onGoToSoundboard}
            className="min-h-[38px] px-3 rounded-lg border border-accent/40 bg-accent/12 text-xs font-semibold text-accent-light hover:bg-accent/20 inline-flex items-center gap-1.5 shrink-0 transition"
          >
            <span>Ir al Soundboard</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};
