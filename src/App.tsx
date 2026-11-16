import { useEffect, useState } from 'react';
import { FolderOpen, Play, Search, Volume2, WifiOff, X } from 'lucide-react';
import { FolderPickerModal } from './components/FolderPickerModal';
import { LibraryView } from './components/LibraryView';
import { MiniPlayer } from './components/MiniPlayer';
import { PlayerDeck } from './components/PlayerDeck';
import { PWAInstallButton } from './components/PWAInstallButton';
import { SearchView } from './components/SearchView';
import { SoundboardView } from './components/SoundboardView';
import { useDualDeckPlayer } from './hooks/useDualDeckPlayer';
import { useLibraryStore } from './hooks/useLibraryStore';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { useSoundboard } from './hooks/useSoundboard';
import { formatDuration } from './services/freeMusicApi';
import { LoopMode, Track } from './types/audio';

type MainTab = 'library' | 'search' | 'soundboard';
const ACTIVE_TAB_KEY = 'rfa_dnd_active_tab_v1';

export default function App() {
  const [activeTab, setActiveTab] = useState<MainTab>(() => {
    try {
      const saved = localStorage.getItem(ACTIVE_TAB_KEY);
      if (saved === 'library' || saved === 'search' || saved === 'soundboard') {
        return saved;
      }
    } catch {
      // ignore
    }
    return 'library';
  });
  const [playerSheetOpen, setPlayerSheetOpen] = useState(false);
  const [showYoutubeFrame, setShowYoutubeFrame] = useState(false);
  const [pickerTrack, setPickerTrack] = useState<Track | null>(null);

  const isOnline = useOnlineStatus();
  const library = useLibraryStore();
  const player = useDualDeckPlayer();
  const soundboard = useSoundboard();

  useEffect(() => {
    try {
      localStorage.setItem(ACTIVE_TAB_KEY, activeTab);
    } catch {
      // ignore
    }
  }, [activeTab]);

  // Prevent accidental page refresh / tab close while music or soundboard audio is active
  useEffect(() => {
    const hasActiveAudio = player.isPlaying || soundboard.activeCount > 0;
    if (!hasActiveAudio) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [player.isPlaying, soundboard.activeCount]);

  const currentFolderTracks = library.getFolderTracks(library.selectedFolderId);

  // Pre-warm first X seconds of tracks in the active folder so playback starts instantaneously
  useEffect(() => {
    if (player.introCacheSeconds > 0 && currentFolderTracks.length > 0) {
      player.warmTracks(currentFolderTracks);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [library.selectedFolderId, currentFolderTracks.length, player.introCacheSeconds]);

  const cycleLoopMode = () => {
    const order: LoopMode[] = ['folder', 'track', 'none'];
    const next = order[(order.indexOf(player.loopMode) + 1) % order.length];
    player.setLoopMode(next);
  };

  const handlePlayTrack = (track: Track, queue: Track[], queueName: string) => {
    player.playTrack(track, { queue, queueName });
  };

  const showYtOverlay =
    showYoutubeFrame && player.currentTrack?.source === 'youtube';

  return (
    <div className="min-h-dvh bg-[#0D0E11] text-[#F2F0EB] flex flex-col">
      {/* Top Bar: 3-zone contract, scrolls cleanly on mobile */}
      <header className="border-b border-white/8 bg-[#0D0E11]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4 sm:gap-8">
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('library');
            }}
            className="font-display text-base sm:text-xl font-semibold tracking-tight text-[#F2F0EB] whitespace-nowrap shrink-0"
          >
            RFA (Roll For Ambience)
          </a>

          <nav className="hidden lg:flex items-center gap-6 text-sm font-medium">
            <button
              type="button"
              onClick={() => setActiveTab('library')}
              className={`py-1 whitespace-nowrap shrink-0 transition border-b-2 ${
                activeTab === 'library'
                  ? 'text-[#F2BE63] border-[#D99B38]'
                  : 'text-[#9C988E] border-transparent hover:text-[#F2F0EB]'
              }`}
            >
              Carpetas
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('search')}
              className={`py-1 whitespace-nowrap shrink-0 transition border-b-2 ${
                activeTab === 'search'
                  ? 'text-[#F2BE63] border-[#D99B38]'
                  : 'text-[#9C988E] border-transparent hover:text-[#F2F0EB]'
              }`}
            >
              Buscar
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('soundboard')}
              className={`py-1 whitespace-nowrap shrink-0 transition border-b-2 ${
                activeTab === 'soundboard'
                  ? 'text-[#F2BE63] border-[#D99B38]'
                  : 'text-[#9C988E] border-transparent hover:text-[#F2F0EB]'
              }`}
            >
              Soundboard
            </button>
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            <PWAInstallButton />
          </div>
        </div>
      </header>

      {/* Offline status banner */}
      {!isOnline && (
        <div className="bg-amber-500/15 border-b border-amber-500/30 px-4 py-2 text-xs text-amber-200 flex items-center justify-center gap-2">
          <WifiOff className="w-3.5 h-3.5 shrink-0" />
          <span>Sin conexión a internet — reproduciendo datos guardados</span>
        </div>
      )}

      {/* Resume session banner if browser blocked autoplay right after a reload */}
      {player.pendingResumeTime !== null && player.currentTrack && !player.isPlaying && (
        <div className="bg-[#D99B38]/15 border-b border-[#D99B38]/35 px-4 py-2.5">
          <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={player.resumePending}
              className="flex-1 min-w-0 flex items-center gap-2.5 text-left min-h-[40px]"
            >
              <span className="w-8 h-8 rounded-lg bg-[#D99B38] text-[#0D0E11] flex items-center justify-center shrink-0">
                <Play className="w-4 h-4 fill-current ml-0.5" />
              </span>
              <span className="text-xs text-[#F2F0EB] truncate">
                Continuar <strong>{player.currentTrack.title}</strong> en{' '}
                <span className="font-mono-tabular text-[#F2BE63]">
                  {formatDuration(player.pendingResumeTime)}
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={player.dismissPendingResume}
              aria-label="Cerrar aviso"
              className="min-w-[36px] min-h-[36px] flex items-center justify-center text-[#9C988E] hover:text-[#F2F0EB] shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 pt-4 pb-36 lg:pb-10">
        <div className="lg:grid lg:grid-cols-12 lg:gap-8 items-start">
          {/* Primary Workspace */}
          <section className="lg:col-span-7 min-w-0">
            {activeTab === 'library' && (
              <LibraryView
                folders={library.folders}
                selectedFolderId={library.selectedFolderId}
                onSelectFolder={library.setSelectedFolderId}
                activeFolder={library.activeFolder}
                tracks={currentFolderTracks}
                currentTrack={player.currentTrack}
                isPlaying={player.isPlaying}
                getFoldersContainingTrack={library.getFoldersContainingTrack}
                onPlayTrack={handlePlayTrack}
                onTogglePlay={player.togglePlay}
                onCreateFolder={library.createFolder}
                onUpdateFolder={library.updateFolder}
                onDeleteFolder={library.deleteFolder}
                onOpenFolderPicker={(t) => setPickerTrack(t)}
                onRemoveTrackFromFolder={library.removeTrackFromFolder}
                onMoveTrack={library.moveTrackInFolder}
                onExportPlaylist={library.exportPlaylist}
                onExportBackup={library.exportBackup}
                onImportListOrBackup={library.importListOrBackup}
                onResetStarter={library.resetToStarter}
                onGoToSearch={() => setActiveTab('search')}
              />
            )}

            {activeTab === 'search' && (
              <SearchView
                allTracks={library.allTracks}
                folders={library.folders}
                selectedFolderId={library.selectedFolderId}
                currentTrack={player.currentTrack}
                isPlaying={player.isPlaying}
                isTrackSaved={library.isTrackSaved}
                getFoldersContainingTrack={library.getFoldersContainingTrack}
                onSaveTrackToFolders={library.addTrackToFolders}
                onPlayTrack={handlePlayTrack}
                onTogglePlay={player.togglePlay}
                onOpenFolderPicker={(t) => setPickerTrack(t)}
              />
            )}

            {activeTab === 'soundboard' && (
              <SoundboardView
                pads={soundboard.pads}
                activePadIds={soundboard.activePadIds}
                loadingPadIds={soundboard.loadingPadIds}
                padErrors={soundboard.padErrors}
                activeCount={soundboard.activeCount}
                onTogglePad={soundboard.togglePad}
                onToggleLoop={soundboard.togglePadLoop}
                onSetPadVolume={soundboard.setPadVolume}
                onStopAll={soundboard.stopAll}
                onAddPad={soundboard.addPad}
                onRemovePad={soundboard.removePad}
                onResetStarterPads={soundboard.resetStarterPads}
              />
            )}
          </section>

          {/* Desktop Persistent Studio Player Deck */}
          <aside className="hidden lg:block lg:col-span-5 sticky top-6">
            <div className="rounded-2xl border border-white/10 bg-[#16181D] p-5 shadow-xl">
              <PlayerDeck
                currentTrack={player.currentTrack}
                queueName={player.queueName}
                isPlaying={player.isPlaying}
                isBuffering={player.isBuffering}
                currentTime={player.currentTime}
                duration={player.duration}
                playerError={player.playerError}
                crossfadeSeconds={player.crossfadeSeconds}
                onChangeCrossfade={player.setCrossfadeSeconds}
                introCacheSeconds={player.introCacheSeconds}
                onChangeIntroCache={player.setIntroCacheSeconds}
                audioFilter={player.audioFilter}
                onChangeAudioFilter={player.setAudioFilter}
                activeDeckMode={player.activeDeckMode}
                filterStatusNote={player.filterStatusNote}
                crossfadeStatus={player.crossfadeStatus}
                masterVolume={player.masterVolume}
                onChangeVolume={player.setMasterVolume}
                loopMode={player.loopMode}
                onCycleLoopMode={cycleLoopMode}
                shuffle={player.shuffle}
                onToggleShuffle={() => player.setShuffle((s) => !s)}
                keepScreenAwake={player.keepScreenAwake}
                onToggleWakeLock={() => player.setKeepScreenAwake((v) => !v)}
                showYoutubeFrame={showYoutubeFrame}
                onToggleYoutubeFrame={() => setShowYoutubeFrame((v) => !v)}
                onTogglePlay={player.togglePlay}
                onSeek={player.seekTo}
                onSkipBy={player.skipBy}
                onNext={player.nextTrack}
                onPrev={player.prevTrack}
                onOpenFolderPicker={(t) => setPickerTrack(t)}
              />
            </div>
          </aside>
        </div>
      </main>

      {/* Mobile Bottom Dock (MiniPlayer + 3-Tab Thumb Navigation <= 112px total) */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40">
        {player.currentTrack && (
          <MiniPlayer
            currentTrack={player.currentTrack}
            isPlaying={player.isPlaying}
            isBuffering={player.isBuffering}
            currentTime={player.currentTime}
            duration={player.duration}
            crossfadeStatus={player.crossfadeStatus}
            onTogglePlay={player.togglePlay}
            onNext={player.nextTrack}
            onExpand={() => setPlayerSheetOpen(true)}
          />
        )}

        <nav
          aria-label="Navegación principal"
          className="bg-[#0D0E11]/95 backdrop-blur-md border-t border-white/10 grid grid-cols-3 h-14 pb-safe"
        >
          <button
            type="button"
            onClick={() => setActiveTab('library')}
            className={`flex flex-col items-center justify-center gap-0.5 transition ${
              activeTab === 'library' ? 'text-[#F2BE63]' : 'text-[#8C887E]'
            }`}
          >
            <FolderOpen className="w-5 h-5" />
            <span className="text-[11px] font-medium">Carpetas</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('search')}
            className={`flex flex-col items-center justify-center gap-0.5 transition ${
              activeTab === 'search' ? 'text-[#F2BE63]' : 'text-[#8C887E]'
            }`}
          >
            <Search className="w-5 h-5" />
            <span className="text-[11px] font-medium">Buscar</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('soundboard')}
            className={`relative flex flex-col items-center justify-center gap-0.5 transition ${
              activeTab === 'soundboard' ? 'text-[#F2BE63]' : 'text-[#8C887E]'
            }`}
          >
            <Volume2 className="w-5 h-5" />
            <span className="text-[11px] font-medium">
              Soundboard{soundboard.activeCount > 0 ? ` (${soundboard.activeCount})` : ''}
            </span>
          </button>
        </nav>
      </div>

      {/* Mobile Full Player Bottom Sheet */}
      {playerSheetOpen && (
        <div
          className="lg:hidden fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end"
          onClick={() => setPlayerSheetOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full rounded-t-3xl border-t border-white/10 bg-[#16181D] p-5 pb-safe max-h-[92dvh] overflow-y-auto shadow-2xl"
          >
            <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-3" />
            <PlayerDeck
              currentTrack={player.currentTrack}
              queueName={player.queueName}
              isPlaying={player.isPlaying}
              isBuffering={player.isBuffering}
              currentTime={player.currentTime}
              duration={player.duration}
              playerError={player.playerError}
              crossfadeSeconds={player.crossfadeSeconds}
              onChangeCrossfade={player.setCrossfadeSeconds}
              introCacheSeconds={player.introCacheSeconds}
              onChangeIntroCache={player.setIntroCacheSeconds}
              audioFilter={player.audioFilter}
              onChangeAudioFilter={player.setAudioFilter}
              activeDeckMode={player.activeDeckMode}
              filterStatusNote={player.filterStatusNote}
              crossfadeStatus={player.crossfadeStatus}
              masterVolume={player.masterVolume}
              onChangeVolume={player.setMasterVolume}
              loopMode={player.loopMode}
              onCycleLoopMode={cycleLoopMode}
              shuffle={player.shuffle}
              onToggleShuffle={() => player.setShuffle((s) => !s)}
              keepScreenAwake={player.keepScreenAwake}
              onToggleWakeLock={() => player.setKeepScreenAwake((v) => !v)}
              showYoutubeFrame={showYoutubeFrame}
              onToggleYoutubeFrame={() => setShowYoutubeFrame((v) => !v)}
              onTogglePlay={player.togglePlay}
              onSeek={player.seekTo}
              onSkipBy={player.skipBy}
              onNext={player.nextTrack}
              onPrev={player.prevTrack}
              onOpenFolderPicker={(t) => setPickerTrack(t)}
              onCloseSheet={() => setPlayerSheetOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Save Track to Folder Modal */}
      <FolderPickerModal
        track={pickerTrack}
        folders={library.folders}
        containingFolderIds={
          pickerTrack ? library.getFoldersContainingTrack(pickerTrack.id) : []
        }
        isSaved={pickerTrack ? library.isTrackSaved(pickerTrack.id) : false}
        onClose={() => setPickerTrack(null)}
        onSaveTrackOnly={library.saveTrack}
        onAddTrackToFolder={library.addTrackToFolder}
        onAddTrackToFolders={library.addTrackToFolders}
        onRemoveTrackFromFolder={library.removeTrackFromFolder}
        onCreateFolder={library.createFolder}
      />

      {/* Persistent Dual YouTube IFrame Mount (never unmounted so crossfade stays seamless) */}
      <div
        className={
          showYtOverlay
            ? 'fixed top-4 right-4 left-4 sm:left-auto sm:w-96 z-[60] rounded-2xl border border-white/15 bg-[#0D0E11] p-2 shadow-2xl'
            : 'fixed bottom-0 left-0 w-px h-px opacity-0 pointer-events-none overflow-hidden'
        }
      >
        {showYtOverlay && (
          <div className="flex items-center justify-between px-2 pb-2">
            <span className="text-xs font-medium text-[#D6D2C8]">
              Reproductor de YouTube
            </span>
            <button
              type="button"
              onClick={() => setShowYoutubeFrame(false)}
              aria-label="Ocultar vídeo"
              className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg text-[#9C988E] hover:text-[#F2F0EB]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        {showYtOverlay && player.activeDeckMode !== 'youtube' && (
          <div className="mb-2 rounded-xl border border-[#D99B38]/35 bg-[#D99B38]/10 px-3 py-2 text-xs text-[#F2BE63] flex items-center justify-between gap-2">
            <span>
              Reproduciendo audio directo con filtro acústico (vídeo pausado).
            </span>
            <button
              type="button"
              onClick={() => {
                player.setAudioFilter('none');
                if (player.currentTrack) {
                  player.playTrack(player.currentTrack, {
                    skipCrossfade: true,
                    startSeconds: player.currentTime,
                  });
                }
              }}
              className="shrink-0 rounded-lg bg-[#D99B38] px-2.5 py-1 text-[11px] font-semibold text-[#0D0E11]"
            >
              Ver vídeo
            </button>
          </div>
        )}
        <div
          className={
            showYtOverlay
              ? `aspect-video w-full rounded-xl overflow-hidden bg-black ${
                  player.activeDeckMode === 'youtube' && player.activeDeckIndex === 0
                    ? 'block'
                    : 'hidden'
                }`
              : 'w-full h-full'
          }
        >
          <div id="yt-deck-0" className="w-full h-full" />
        </div>
        <div
          className={
            showYtOverlay
              ? `aspect-video w-full rounded-xl overflow-hidden bg-black ${
                  player.activeDeckMode === 'youtube' && player.activeDeckIndex === 1
                    ? 'block'
                    : 'hidden'
                }`
              : 'w-full h-full'
          }
        >
          <div id="yt-deck-1" className="w-full h-full" />
        </div>
      </div>
    </div>
  );
}
