import React, { useMemo, useState } from 'react';
import {
  Check,
  ExternalLink,
  FolderPlus,
  Globe,
  Link2,
  Loader2,
  Pause,
  Play,
  Search,
  Youtube,
} from 'lucide-react';
import {
  fetchYouTubeMeta,
  formatDuration,
  parseYouTubeId,
  searchArchiveOrgTracks,
  searchAudiusTracks,
} from '../services/freeMusicApi';
import { Folder, Track } from '../types/audio';
import { FolderIcon } from './FolderIcon';

interface SearchViewProps {
  allTracks: Track[];
  folders: Folder[];
  selectedFolderId: string;
  currentTrack: Track | null;
  isPlaying: boolean;
  isTrackSaved: (trackId: string) => boolean;
  getFoldersContainingTrack: (trackId: string) => string[];
  onSaveTrackToFolders: (track: Track, folderIds: string[]) => void;
  onPlayTrack: (track: Track, queue: Track[], queueName: string) => void;
  onTogglePlay: () => void;
  onOpenFolderPicker: (track: Track) => void;
}

type SearchTab = 'internet' | 'youtube' | 'library';

const QUICK_DND_QUERIES = [
  'Ivan Duch',
  'Tavern',
  'Dungeon ambient',
  'Fantasy battle',
  'Medieval',
  'Dark forest',
];

export const SearchView: React.FC<SearchViewProps> = ({
  allTracks,
  folders,
  selectedFolderId,
  currentTrack,
  isPlaying,
  isTrackSaved,
  getFoldersContainingTrack,
  onSaveTrackToFolders,
  onPlayTrack,
  onTogglePlay,
  onOpenFolderPicker,
}) => {
  const [tab, setTab] = useState<SearchTab>('internet');

  // Internet free search state
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Track[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  // YouTube / Direct URL paste state
  const [urlInput, setUrlInput] = useState('');
  const [customTitle, setCustomTitle] = useState('');
  const [targetFolderIds, setTargetFolderIds] = useState<string[]>(() => {
    if (selectedFolderId !== 'all') return [selectedFolderId];
    return folders[0] ? [folders[0].id] : [];
  });
  const [ytSearchHelper, setYtSearchHelper] = useState('dnd tavern ambience');
  const [urlLoading, setUrlLoading] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  const validTargetFolderIds = useMemo(() => {
    const existing = new Set(folders.map((f) => f.id));
    return targetFolderIds.filter((id) => existing.has(id));
  }, [folders, targetFolderIds]);

  const toggleTargetFolder = (folderId: string) => {
    setTargetFolderIds((prev) =>
      prev.includes(folderId)
        ? prev.filter((id) => id !== folderId)
        : [...prev, folderId]
    );
  };

  // Local library search
  const [libQuery, setLibQuery] = useState('');

  const savedYoutubeTracks = useMemo(
    () => allTracks.filter((t) => t.source === 'youtube'),
    [allTracks]
  );

  const runInternetSearch = async (term: string) => {
    const q = term.trim();
    if (!q) return;
    setQuery(q);
    setLoading(true);
    setError(null);
    setHasSearched(true);

    try {
      const [audiusRes, archiveRes] = await Promise.allSettled([
        searchAudiusTracks(q),
        searchArchiveOrgTracks(q),
      ]);

      const combined: Track[] = [];
      if (audiusRes.status === 'fulfilled') combined.push(...audiusRes.value);
      if (archiveRes.status === 'fulfilled') combined.push(...archiveRes.value);

      if (
        combined.length === 0 &&
        audiusRes.status === 'rejected' &&
        archiveRes.status === 'rejected'
      ) {
        setError('No se pudo conectar con los catálogos gratuitos. Revisa tu conexión.');
      }

      setResults(combined);
    } catch {
      setError('Ocurrió un error al buscar canciones.');
    } finally {
      setLoading(false);
    }
  };

  const handleResolveAndSaveUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    const raw = urlInput.trim();
    if (!raw) return;

    setUrlError(null);
    setSavedNotice(null);
    setUrlLoading(true);

    try {
      const ytId = parseYouTubeId(raw);
      let track: Track;

      if (ytId) {
        const meta = await fetchYouTubeMeta(ytId);
        track = {
          id: `yt-${ytId}`,
          title: customTitle.trim() || meta.title,
          artist: meta.author,
          source: 'youtube',
          url: `https://www.youtube.com/watch?v=${ytId}`,
          youtubeId: ytId,
          artworkUrl: meta.thumbnail,
          addedAt: Date.now(),
        };
      } else {
        const parsed = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
        track = {
          id: `url-${Date.now()}`,
          title:
            customTitle.trim() ||
            decodeURIComponent(parsed.pathname.split('/').pop() || 'Pista de audio'),
          artist: parsed.hostname.replace(/^www\./, ''),
          source: 'direct',
          url: parsed.toString(),
          addedAt: Date.now(),
        };
      }

      // Immediately persist the track in all selected folders (and in All Tracks)
      onSaveTrackToFolders(track, validTargetFolderIds);
      const chosenNames = folders
        .filter((f) => validTargetFolderIds.includes(f.id))
        .map((f) => f.name);

      const destinationText =
        chosenNames.length > 0 ? chosenNames.join(', ') : 'Todas las canciones';

      setSavedNotice(`"${track.title}" guardada en ${destinationText}`);
      setUrlInput('');
      setCustomTitle('');
      onPlayTrack(track, [track, ...savedYoutubeTracks], 'YouTube guardadas');
    } catch {
      setUrlError(
        'Enlace no válido. Pega una URL de YouTube (youtube.com / youtu.be) o un enlace directo .mp3/.ogg.'
      );
    } finally {
      setUrlLoading(false);
    }
  };

  const localResults = useMemo(() => {
    const q = libQuery.trim().toLowerCase();
    if (!q) return allTracks;
    return allTracks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q)
    );
  }, [allTracks, libQuery]);

  const renderTrackRow = (track: Track, list: Track[], listName: string) => {
    const isCurrent = currentTrack?.id === track.id;
    const saved = isTrackSaved(track.id);
    const folderCount = getFoldersContainingTrack(track.id).length;

    return (
      <div
        key={track.id}
        className={`flex items-center gap-3 px-3 py-2.5 min-h-[64px] transition ${
          isCurrent ? 'bg-[#D99B38]/10' : 'hover:bg-white/[0.03]'
        }`}
      >
        <button
          type="button"
          onClick={() =>
            isCurrent ? onTogglePlay() : onPlayTrack(track, list, listName)
          }
          className="flex-1 min-w-0 flex items-center gap-3 text-left min-h-[44px]"
        >
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 overflow-hidden border ${
              isCurrent
                ? 'bg-[#D99B38] text-[#0D0E11] border-[#D99B38]'
                : 'bg-[#1E2128] text-[#D6D2C8] border-white/8'
            }`}
          >
            {isCurrent && isPlaying ? (
              <Pause className="w-4 h-4 fill-current" />
            ) : (
              <Play className="w-4 h-4 fill-current ml-0.5" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div
              className={`text-sm font-medium truncate ${
                isCurrent ? 'text-[#F2BE63]' : 'text-[#F2F0EB]'
              }`}
            >
              {track.title}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-[#9C988E] truncate mt-0.5">
              <span className="truncate">{track.artist}</span>
              <span aria-hidden="true">·</span>
              <span className="shrink-0">
                {track.source === 'youtube'
                  ? 'YouTube'
                  : track.source === 'audius'
                  ? 'Audius'
                  : 'Archivo libre'}
              </span>
              {track.duration ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono-tabular shrink-0">
                    {formatDuration(track.duration)}
                  </span>
                </>
              ) : null}
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onOpenFolderPicker(track)}
          aria-label="Elegir una o varias carpetas para guardar"
          className={`min-h-[44px] px-3 rounded-xl border text-xs font-medium inline-flex items-center gap-1.5 shrink-0 transition ${
            saved
              ? 'border-[#D99B38]/50 bg-[#D99B38]/12 text-[#F2BE63]'
              : 'border-white/10 bg-[#1E2128] text-[#F2F0EB] hover:border-[#D99B38]/60 hover:text-[#F2BE63]'
          }`}
        >
          {saved ? <Check className="w-4 h-4" /> : <FolderPlus className="w-4 h-4" />}
          <span>
            {folderCount > 0
              ? `${folderCount} ${folderCount === 1 ? 'carpeta' : 'carpetas'}`
              : saved
              ? 'Guardada'
              : 'Guardar'}
          </span>
        </button>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-xl sm:text-2xl font-semibold text-[#F2F0EB]">
          Buscar música
        </h2>
        <p className="text-xs text-[#9C988E] mt-0.5">
          Catálogos gratuitos sin límites y enlaces de YouTube guardados en tu dispositivo
        </p>
      </div>

      {/* Mode segmented tabs */}
      <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-[#16181D] border border-white/8">
        <button
          type="button"
          onClick={() => setTab('internet')}
          className={`min-h-[42px] px-2 py-2 rounded-lg text-xs font-medium inline-flex items-center justify-center gap-1.5 transition whitespace-nowrap ${
            tab === 'internet'
              ? 'bg-[#D99B38] text-[#0D0E11] font-semibold'
              : 'text-[#C7C2B6] hover:text-[#F2F0EB]'
          }`}
        >
          <Globe className="w-4 h-4 shrink-0" />
          <span>Música libre</span>
        </button>
        <button
          type="button"
          onClick={() => setTab('youtube')}
          className={`min-h-[42px] px-2 py-2 rounded-lg text-xs font-medium inline-flex items-center justify-center gap-1.5 transition whitespace-nowrap ${
            tab === 'youtube'
              ? 'bg-[#D99B38] text-[#0D0E11] font-semibold'
              : 'text-[#C7C2B6] hover:text-[#F2F0EB]'
          }`}
        >
          <Youtube className="w-4 h-4 shrink-0" />
          <span>YouTube / URL</span>
        </button>
        <button
          type="button"
          onClick={() => setTab('library')}
          className={`min-h-[42px] px-2 py-2 rounded-lg text-xs font-medium inline-flex items-center justify-center gap-1.5 transition whitespace-nowrap ${
            tab === 'library'
              ? 'bg-[#D99B38] text-[#0D0E11] font-semibold'
              : 'text-[#C7C2B6] hover:text-[#F2F0EB]'
          }`}
        >
          <Search className="w-4 h-4 shrink-0" />
          <span>Guardadas</span>
        </button>
      </div>

      {tab === 'internet' && (
        <div className="space-y-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              runInternetSearch(query);
            }}
            className="flex items-center gap-2"
          >
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-[#8C887E] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar ej. medieval tavern, boss fight, ambient..."
                className="w-full min-h-[46px] pl-10 pr-3 rounded-xl bg-[#16181D] border border-white/10 text-sm text-[#F2F0EB] placeholder:text-[#78746C] focus:outline-none focus:border-[#D99B38]"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="min-h-[46px] px-4 rounded-xl bg-[#D99B38] text-[#0D0E11] text-sm font-semibold hover:bg-[#F2BE63] disabled:opacity-60 transition shrink-0"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Buscar'}
            </button>
          </form>

          {/* Quick D&D search suggestions */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {QUICK_DND_QUERIES.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => runInternetSearch(preset)}
                className="min-h-[36px] px-3 py-1.5 rounded-lg border border-white/8 bg-[#16181D] text-xs text-[#C7C2B6] hover:border-[#D99B38]/50 hover:text-[#F2BE63] whitespace-nowrap shrink-0 transition"
              >
                {preset}
              </button>
            ))}
          </div>

          {error && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">
              {error}
            </div>
          )}

          {loading ? (
            <div className="rounded-2xl border border-white/8 bg-[#16181D] p-8 flex flex-col items-center justify-center gap-2 text-xs text-[#9C988E]">
              <Loader2 className="w-5 h-5 animate-spin text-[#D99B38]" />
              <span>Buscando en Audius e Internet Archive...</span>
            </div>
          ) : hasSearched && results.length === 0 ? (
            <div className="rounded-2xl border border-white/8 bg-[#16181D] p-6 text-center text-sm text-[#9C988E]">
              No se encontraron resultados para "{query}". Prueba con términos en inglés como
              "fantasy", "tavern" o "dungeon", o pega un enlace en la pestaña YouTube / URL.
            </div>
          ) : results.length > 0 ? (
            <div className="rounded-2xl border border-white/8 bg-[#16181D] divide-y divide-white/6 overflow-hidden">
              {results.map((track) =>
                renderTrackRow(track, results, `Búsqueda: ${query}`)
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-white/8 bg-[#16181D] p-5 text-sm text-[#9C988E]">
              Busca música ambiental, medieval, orquestal o electrónica gratuita desde Audius e
              Internet Archive y guárdala en tus carpetas para futuras sesiones.
            </div>
          )}
        </div>
      )}

      {tab === 'youtube' && (
        <div className="space-y-4">
          <form
            onSubmit={handleResolveAndSaveUrl}
            className="rounded-2xl border border-white/8 bg-[#16181D] p-4 space-y-3"
          >
            <div>
              <label className="block text-xs text-[#9C988E] mb-1.5">
                Enlace de YouTube o URL directa de audio (.mp3 / .ogg)
              </label>
              <div className="relative">
                <Link2 className="w-4 h-4 text-[#8C887E] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=... o youtu.be/..."
                  className="w-full min-h-[46px] pl-10 pr-3 rounded-xl bg-[#0D0E11] border border-white/12 text-sm text-[#F2F0EB] placeholder:text-[#78746C] focus:outline-none focus:border-[#D99B38]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-[#9C988E] mb-1.5">
                Título personalizado (opcional)
              </label>
              <input
                type="text"
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                placeholder="Ej. Emboscada en el camino"
                className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#0D0E11] border border-white/12 text-sm text-[#F2F0EB] placeholder:text-[#78746C] focus:outline-none focus:border-[#D99B38]"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs text-[#9C988E]">
                  Guardar en carpetas ({validTargetFolderIds.length}{' '}
                  {validTargetFolderIds.length === 1 ? 'seleccionada' : 'seleccionadas'})
                </label>
                {folders.length > 0 && (
                  <div className="flex items-center gap-2 text-[11px]">
                    {validTargetFolderIds.length < folders.length ? (
                      <button
                        type="button"
                        onClick={() => setTargetFolderIds(folders.map((f) => f.id))}
                        className="text-[#F2BE63] hover:underline"
                      >
                        Todas
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setTargetFolderIds([])}
                        className="text-[#9C988E] hover:text-[#F2F0EB]"
                      >
                        Ninguna
                      </button>
                    )}
                  </div>
                )}
              </div>

              {folders.length === 0 ? (
                <p className="text-xs text-[#8C887E] rounded-xl bg-[#0D0E11] border border-white/8 px-3 py-2.5">
                  No tienes carpetas creadas todavía. Se guardará en Todas.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {folders.map((folder) => {
                    const selected = validTargetFolderIds.includes(folder.id);
                    return (
                      <button
                        key={folder.id}
                        type="button"
                        onClick={() => toggleTargetFolder(folder.id)}
                        className={`min-h-[40px] px-3 py-1.5 rounded-xl border text-xs font-medium inline-flex items-center gap-2 transition ${
                          selected
                            ? 'border-[#D99B38] bg-[#D99B38]/15 text-[#F2BE63]'
                            : 'border-white/10 bg-[#0D0E11] text-[#C7C2B6] hover:border-white/25 hover:text-[#F2F0EB]'
                        }`}
                      >
                        <FolderIcon name={folder.icon} className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate max-w-[140px]">{folder.name}</span>
                        <span
                          className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${
                            selected
                              ? 'bg-[#D99B38] text-[#0D0E11]'
                              : 'border border-white/20 text-transparent'
                          }`}
                        >
                          <Check className="w-2.5 h-2.5" />
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {folders.length > 0 && validTargetFolderIds.length === 0 && (
                <p className="text-[11px] text-[#8C887E]">
                  Sin carpetas marcadas: se guardará únicamente en Todas.
                </p>
              )}
            </div>

            {urlError && <p className="text-xs text-rose-400">{urlError}</p>}
            {savedNotice && (
              <p className="text-xs text-[#F2BE63] flex items-center gap-1.5">
                <Check className="w-4 h-4 shrink-0" />
                <span>{savedNotice}</span>
              </p>
            )}

            <button
              type="submit"
              disabled={urlLoading}
              className="w-full min-h-[46px] rounded-xl bg-[#D99B38] text-[#0D0E11] text-sm font-semibold hover:bg-[#F2BE63] transition flex items-center justify-center gap-2"
            >
              {urlLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <span>Guardar y reproducir</span>
              )}
            </button>
          </form>

          {/* Saved YouTube tracks list */}
          {savedYoutubeTracks.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-medium text-[#C7C2B6]">
                  Pistas de YouTube guardadas ({savedYoutubeTracks.length})
                </h3>
              </div>
              <div className="rounded-2xl border border-white/8 bg-[#16181D] divide-y divide-white/6 overflow-hidden">
                {savedYoutubeTracks.map((track) =>
                  renderTrackRow(track, savedYoutubeTracks, 'YouTube guardadas')
                )}
              </div>
            </div>
          )}

          {/* Helper to jump to YouTube search without API limits */}
          <div className="rounded-2xl border border-white/8 bg-[#16181D] p-4 space-y-2.5">
            <p className="text-xs font-medium text-[#D6D2C8]">
              Buscador rápido en YouTube (gratis, con reproducción estándar)
            </p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={ytSearchHelper}
                onChange={(e) => setYtSearchHelper(e.target.value)}
                placeholder="Ej. dnd boss battle music"
                className="flex-1 min-h-[44px] px-3 rounded-xl bg-[#0D0E11] border border-white/12 text-sm text-[#F2F0EB]"
              />
              <a
                href={`https://www.youtube.com/results?search_query=${encodeURIComponent(
                  ytSearchHelper || 'dnd music'
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[44px] px-3.5 rounded-xl border border-white/12 bg-[#1E2128] text-xs font-medium text-[#F2F0EB] hover:border-[#D99B38]/60 inline-flex items-center gap-1.5 shrink-0"
              >
                <span>Abrir</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
            <p className="text-xs text-[#8C887E] leading-relaxed">
              Copia cualquier enlace de vídeo en YouTube y pégalo arriba: queda guardado
              automáticamente en tu dispositivo y en la carpeta que elijas.
            </p>
          </div>
        </div>
      )}

      {tab === 'library' && (
        <div className="space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 text-[#8C887E] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={libQuery}
              onChange={(e) => setLibQuery(e.target.value)}
              placeholder="Buscar entre todas tus canciones guardadas..."
              className="w-full min-h-[46px] pl-10 pr-3 rounded-xl bg-[#16181D] border border-white/10 text-sm text-[#F2F0EB] placeholder:text-[#78746C] focus:outline-none focus:border-[#D99B38]"
            />
          </div>

          <div className="rounded-2xl border border-white/8 bg-[#16181D] divide-y divide-white/6 overflow-hidden">
            {localResults.length === 0 ? (
              <p className="p-6 text-center text-sm text-[#9C988E]">
                No hay canciones guardadas que coincidan.
              </p>
            ) : (
              localResults.map((track) =>
                renderTrackRow(track, localResults, 'Biblioteca guardada')
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
};
