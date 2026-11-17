import React, { useMemo, useRef, useState } from 'react';
import {
  Check,
  ExternalLink,
  FolderPlus,
  Globe,
  HardDriveUpload,
  Link2,
  Loader2,
  Music,
  Pause,
  Play,
  Search,
  Volume2,
  Youtube,
} from 'lucide-react';
import {
  fetchYouTubeMeta,
  formatDuration,
  parseYouTubeId,
  searchArchiveOrgTracks,
  searchAudiusTracks,
} from '../services/freeMusicApi';
import {
  formatBytes,
  isSupportedAudioFile,
  saveLocalAudioFile,
} from '../services/localMedia';
import { Folder, SoundCategory, SoundPad, Track } from '../types/audio';
import { FolderIcon } from './FolderIcon';
import { SoundFinderPanel } from './SoundFinderPanel';

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
  soundPads: SoundPad[];
  onAddSoundPad: (input: {
    name: string;
    url: string;
    category: SoundCategory;
    loop: boolean;
    sourceLabel: string;
  }) => void;
  onRemoveSoundPad: (padId: string) => void;
  onGoToSoundboard: () => void;
}

type MainSearchSection = 'music' | 'sounds';
type SearchTab = 'internet' | 'youtube' | 'local' | 'library';

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
  soundPads,
  onAddSoundPad,
  onRemoveSoundPad,
  onGoToSoundboard,
}) => {
  const [section, setSection] = useState<MainSearchSection>('music');
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

  // Local audio file import state
  const localFileInputRef = useRef<HTMLInputElement | null>(null);
  const [localTitle, setLocalTitle] = useState('');
  const [localArtist, setLocalArtist] = useState('');
  const [localImporting, setLocalImporting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [localNotice, setLocalNotice] = useState<string | null>(null);

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

  const savedLocalTracks = useMemo(
    () => allTracks.filter((t) => t.source === 'local'),
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

  const handleImportLocalMusic = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    const validFiles = files.filter(isSupportedAudioFile);

    setLocalError(null);
    setLocalNotice(null);

    if (validFiles.length === 0) {
      setLocalError(
        'Formato no compatible. Elige archivos .mp3, .ogg, .wav, .m4a o .flac.'
      );
      return;
    }

    setLocalImporting(true);
    const importedTracks: Track[] = [];
    let totalBytes = 0;

    try {
      for (const file of validFiles) {
        const titleOverride =
          validFiles.length === 1 && localTitle.trim() ? localTitle.trim() : undefined;
        const saved = await saveLocalAudioFile(file, 'music', titleOverride);
        const track: Track = {
          id: `local-${saved.id}`,
          title: saved.title,
          artist: localArtist.trim() || 'Archivo local',
          source: 'local',
          url: saved.mediaUrl,
          duration: saved.duration,
          addedAt: Date.now(),
        };
        onSaveTrackToFolders(track, validTargetFolderIds);
        importedTracks.push(track);
        totalBytes += saved.size;
      }

      const chosenNames = folders
        .filter((f) => validTargetFolderIds.includes(f.id))
        .map((f) => f.name);
      const destinationText =
        chosenNames.length > 0 ? chosenNames.join(', ') : 'Todas las canciones';

      setLocalNotice(
        importedTracks.length === 1
          ? `"${importedTracks[0].title}" guardada en ${destinationText} (${formatBytes(totalBytes)})`
          : `${importedTracks.length} pistas guardadas en ${destinationText} (${formatBytes(totalBytes)})`
      );
      setLocalTitle('');

      if (importedTracks.length === 1) {
        onPlayTrack(
          importedTracks[0],
          [...importedTracks, ...savedLocalTracks],
          'Música local'
        );
      }
    } catch (err) {
      setLocalError(
        err instanceof Error ? err.message : 'No se pudieron importar los archivos locales.'
      );
    } finally {
      setLocalImporting(false);
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

  const renderFolderTargetPicker = () => (
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
                className="text-accent-light hover:underline"
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
        <p className="text-xs text-[#8C887E] rounded-xl bg-canvas border border-white/8 px-3 py-2.5">
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
                    ? 'border-accent bg-accent/15 text-accent-light'
                    : 'border-white/10 bg-canvas text-[#C7C2B6] hover:border-white/25 hover:text-[#F2F0EB]'
                }`}
              >
                <FolderIcon name={folder.icon} className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate max-w-[140px]">{folder.name}</span>
                <span
                  className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${
                    selected
                      ? 'bg-accent text-accent-contrast'
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
  );

  const renderTrackRow = (track: Track, list: Track[], listName: string) => {
    const isCurrent = currentTrack?.id === track.id;
    const saved = isTrackSaved(track.id);
    const folderCount = getFoldersContainingTrack(track.id).length;

    return (
      <div
        key={track.id}
        className={`flex items-center gap-3 px-3 py-2.5 min-h-[64px] transition ${
          isCurrent ? 'bg-accent/10' : 'hover:bg-white/[0.03]'
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
                ? 'bg-accent text-accent-contrast border-accent'
                : 'bg-elevated text-[#D6D2C8] border-white/8'
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
                isCurrent ? 'text-accent-light' : 'text-[#F2F0EB]'
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
                  : track.source === 'local'
                  ? 'Archivo local'
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
              ? 'border-accent/50 bg-accent/12 text-accent-light'
              : 'border-white/10 bg-elevated text-[#F2F0EB] hover:border-accent/60 hover:text-accent-light'
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
          Buscar
        </h2>
        <p className="text-xs text-[#9C988E] mt-0.5">
          Música para tus carpetas y buscador de sonidos para tu soundboard
        </p>
      </div>

      {/* Top-level Música / Sonidos tabs */}
      <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-surface border border-white/10">
        <button
          type="button"
          onClick={() => setSection('music')}
          className={`min-h-[44px] px-3 py-2 rounded-lg text-sm font-medium inline-flex items-center justify-center gap-2 transition ${
            section === 'music'
              ? 'bg-accent text-accent-contrast font-semibold'
              : 'text-[#C7C2B6] hover:text-[#F2F0EB]'
          }`}
        >
          <Music className="w-4 h-4 shrink-0" />
          <span>Música</span>
        </button>
        <button
          type="button"
          onClick={() => setSection('sounds')}
          className={`min-h-[44px] px-3 py-2 rounded-lg text-sm font-medium inline-flex items-center justify-center gap-2 transition ${
            section === 'sounds'
              ? 'bg-accent text-accent-contrast font-semibold'
              : 'text-[#C7C2B6] hover:text-[#F2F0EB]'
          }`}
        >
          <Volume2 className="w-4 h-4 shrink-0" />
          <span>Sonidos</span>
        </button>
      </div>

      {section === 'sounds' ? (
        <SoundFinderPanel
          pads={soundPads}
          onAddPad={onAddSoundPad}
          onRemovePad={onRemoveSoundPad}
          onGoToSoundboard={onGoToSoundboard}
        />
      ) : (
        <div className="space-y-4">
          {/* Music mode segmented tabs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 p-1 rounded-xl bg-surface border border-white/8">
            <button
              type="button"
              onClick={() => setTab('internet')}
              className={`min-h-[40px] px-2 py-1.5 rounded-lg text-xs font-medium inline-flex items-center justify-center gap-1.5 transition whitespace-nowrap ${
                tab === 'internet'
                  ? 'bg-accent text-accent-contrast font-semibold'
                  : 'text-[#C7C2B6] hover:text-[#F2F0EB]'
              }`}
            >
              <Globe className="w-3.5 h-3.5 shrink-0" />
              <span>Música libre</span>
            </button>
            <button
              type="button"
              onClick={() => setTab('youtube')}
              className={`min-h-[40px] px-2 py-1.5 rounded-lg text-xs font-medium inline-flex items-center justify-center gap-1.5 transition whitespace-nowrap ${
                tab === 'youtube'
                  ? 'bg-accent text-accent-contrast font-semibold'
                  : 'text-[#C7C2B6] hover:text-[#F2F0EB]'
              }`}
            >
              <Youtube className="w-3.5 h-3.5 shrink-0" />
              <span>YouTube / URL</span>
            </button>
            <button
              type="button"
              onClick={() => setTab('local')}
              className={`min-h-[40px] px-2 py-1.5 rounded-lg text-xs font-medium inline-flex items-center justify-center gap-1.5 transition whitespace-nowrap ${
                tab === 'local'
                  ? 'bg-accent text-accent-contrast font-semibold'
                  : 'text-[#C7C2B6] hover:text-[#F2F0EB]'
              }`}
            >
              <HardDriveUpload className="w-3.5 h-3.5 shrink-0" />
              <span>Archivo local</span>
            </button>
            <button
              type="button"
              onClick={() => setTab('library')}
              className={`min-h-[40px] px-2 py-1.5 rounded-lg text-xs font-medium inline-flex items-center justify-center gap-1.5 transition whitespace-nowrap ${
                tab === 'library'
                  ? 'bg-accent text-accent-contrast font-semibold'
                  : 'text-[#C7C2B6] hover:text-[#F2F0EB]'
              }`}
            >
              <Search className="w-3.5 h-3.5 shrink-0" />
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
                    className="w-full min-h-[46px] pl-10 pr-3 rounded-xl bg-surface border border-white/10 text-sm text-[#F2F0EB] placeholder:text-[#78746C] focus:outline-none focus:border-accent"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="min-h-[46px] px-4 rounded-xl bg-accent text-accent-contrast text-sm font-semibold hover:bg-accent-light disabled:opacity-60 transition shrink-0"
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
                    className="min-h-[36px] px-3 py-1.5 rounded-lg border border-white/8 bg-surface text-xs text-[#C7C2B6] hover:border-accent/50 hover:text-accent-light whitespace-nowrap shrink-0 transition"
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
                <div className="rounded-2xl border border-white/8 bg-surface p-8 flex flex-col items-center justify-center gap-2 text-xs text-[#9C988E]">
                  <Loader2 className="w-5 h-5 animate-spin text-accent" />
                  <span>Buscando en Audius e Internet Archive...</span>
                </div>
              ) : hasSearched && results.length === 0 ? (
                <div className="rounded-2xl border border-white/8 bg-surface p-6 text-center text-sm text-[#9C988E]">
                  No se encontraron resultados para "{query}". Prueba con términos en inglés como
                  "fantasy", "tavern" o "dungeon", o pega un enlace en la pestaña YouTube / URL.
                </div>
              ) : results.length > 0 ? (
                <div className="rounded-2xl border border-white/8 bg-surface divide-y divide-white/6 overflow-hidden">
                  {results.map((track) =>
                    renderTrackRow(track, results, `Búsqueda: ${query}`)
                  )}
                </div>
              ) : (
                <div className="rounded-2xl border border-white/8 bg-surface p-5 text-sm text-[#9C988E]">
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
                className="rounded-2xl border border-white/8 bg-surface p-4 space-y-3"
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
                      className="w-full min-h-[46px] pl-10 pr-3 rounded-xl bg-canvas border border-white/12 text-sm text-[#F2F0EB] placeholder:text-[#78746C] focus:outline-none focus:border-accent"
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
                    className="w-full min-h-[44px] px-3.5 rounded-xl bg-canvas border border-white/12 text-sm text-[#F2F0EB] placeholder:text-[#78746C] focus:outline-none focus:border-accent"
                  />
                </div>

                {renderFolderTargetPicker()}

                {urlError && <p className="text-xs text-rose-400">{urlError}</p>}
                {savedNotice && (
                  <p className="text-xs text-accent-light flex items-center gap-1.5">
                    <Check className="w-4 h-4 shrink-0" />
                    <span>{savedNotice}</span>
                  </p>
                )}

                <button
                  type="submit"
                  disabled={urlLoading}
                  className="w-full min-h-[46px] rounded-xl bg-accent text-accent-contrast text-sm font-semibold hover:bg-accent-light transition flex items-center justify-center gap-2"
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
                  <div className="rounded-2xl border border-white/8 bg-surface divide-y divide-white/6 overflow-hidden">
                    {savedYoutubeTracks.map((track) =>
                      renderTrackRow(track, savedYoutubeTracks, 'YouTube guardadas')
                    )}
                  </div>
                </div>
              )}

              {/* Helper to jump to YouTube search without API limits */}
              <div className="rounded-2xl border border-white/8 bg-surface p-4 space-y-2.5">
                <p className="text-xs font-medium text-[#D6D2C8]">
                  Buscador rápido en YouTube (gratis, con reproducción estándar)
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={ytSearchHelper}
                    onChange={(e) => setYtSearchHelper(e.target.value)}
                    placeholder="Ej. dnd boss battle music"
                    className="flex-1 min-h-[44px] px-3 rounded-xl bg-canvas border border-white/12 text-sm text-[#F2F0EB]"
                  />
                  <a
                    href={`https://www.youtube.com/results?search_query=${encodeURIComponent(
                      ytSearchHelper || 'dnd music'
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[44px] px-3.5 rounded-xl border border-white/12 bg-elevated text-xs font-medium text-[#F2F0EB] hover:border-accent/60 inline-flex items-center gap-1.5 shrink-0"
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

          {tab === 'local' && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-white/8 bg-surface p-4 space-y-3.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-[#9C988E] mb-1.5">
                      Título personalizado (opcional si subes 1 pista)
                    </label>
                    <input
                      type="text"
                      value={localTitle}
                      onChange={(e) => setLocalTitle(e.target.value)}
                      placeholder="Ej. Música de posada"
                      className="w-full min-h-[44px] px-3.5 rounded-xl bg-canvas border border-white/12 text-sm text-[#F2F0EB] placeholder:text-[#78746C] focus:outline-none focus:border-accent"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[#9C988E] mb-1.5">
                      Autor o etiqueta (opcional)
                    </label>
                    <input
                      type="text"
                      value={localArtist}
                      onChange={(e) => setLocalArtist(e.target.value)}
                      placeholder="Ej. Banda sonora campaña"
                      className="w-full min-h-[44px] px-3.5 rounded-xl bg-canvas border border-white/12 text-sm text-[#F2F0EB] placeholder:text-[#78746C] focus:outline-none focus:border-accent"
                    />
                  </div>
                </div>

                {renderFolderTargetPicker()}

                <input
                  ref={localFileInputRef}
                  type="file"
                  accept="audio/*,.mp3,.ogg,.oga,.wav,.m4a,.flac,.aac,.opus"
                  multiple
                  onChange={(e) => {
                    handleImportLocalMusic(e.target.files);
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
                    handleImportLocalMusic(e.dataTransfer.files);
                  }}
                  className="w-full min-h-[120px] rounded-xl border border-dashed border-accent/45 bg-canvas/60 hover:bg-accent/10 hover:border-accent px-4 py-4 flex flex-col items-center justify-center gap-2 text-center transition"
                >
                  {localImporting ? (
                    <>
                      <Loader2 className="w-6 h-6 animate-spin text-accent" />
                      <span className="text-xs text-[#F2F0EB]">
                        Guardando música en tu dispositivo...
                      </span>
                    </>
                  ) : (
                    <>
                      <HardDriveUpload className="w-6 h-6 text-accent" />
                      <div className="text-sm font-medium text-[#F2F0EB]">
                        Importar canciones desde tu dispositivo
                      </div>
                      <div className="text-[11px] text-[#8C887E]">
                        MP3, OGG, WAV, M4A, FLAC · Puedes seleccionar varios archivos a la vez
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

              {savedLocalTracks.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-medium text-[#C7C2B6]">
                    Música local guardada ({savedLocalTracks.length})
                  </h3>
                  <div className="rounded-2xl border border-white/8 bg-surface divide-y divide-white/6 overflow-hidden">
                    {savedLocalTracks.map((track) =>
                      renderTrackRow(track, savedLocalTracks, 'Música local')
                    )}
                  </div>
                </div>
              )}
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
                  className="w-full min-h-[46px] pl-10 pr-3 rounded-xl bg-surface border border-white/10 text-sm text-[#F2F0EB] placeholder:text-[#78746C] focus:outline-none focus:border-accent"
                />
              </div>

              <div className="rounded-2xl border border-white/8 bg-surface divide-y divide-white/6 overflow-hidden">
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
      )}
    </div>
  );
};
