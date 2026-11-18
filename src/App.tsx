import { useEffect, useRef, useState } from 'react';
import { FolderOpen, Play, Search, Settings, Volume2, WifiOff, X } from 'lucide-react';
import { FolderPickerModal } from './components/FolderPickerModal';
import { LibraryView } from './components/LibraryView';
import { MiniPlayer } from './components/MiniPlayer';
import { PlayerDeck } from './components/PlayerDeck';
import { PWAInstallButton } from './components/PWAInstallButton';
import { SearchView } from './components/SearchView';
import { SettingsView } from './components/SettingsView';
import { SoundboardView } from './components/SoundboardView';
import { useAppearance } from './hooks/useAppearance';
import { useDualDeckPlayer } from './hooks/useDualDeckPlayer';
import { useLibraryStore } from './hooks/useLibraryStore';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { useSoundboard } from './hooks/useSoundboard';
import { formatDuration } from './services/freeMusicApi';
import { isLocalMediaUrl } from './services/localMedia';
import {
  notifyServiceWorkerPlaybackState,
  warmSoundboardInServiceWorker,
} from './services/swController';
import { LoopMode, Track } from './types/audio';

type MainTab = 'library' | 'search' | 'soundboard' | 'settings';
const ACTIVE_TAB_KEY = 'rfa_dnd_active_tab_v1';

export default function App() {
  const [activeTab, setActiveTab] = useState<MainTab>(() => {
    try {
      const saved = localStorage.getItem(ACTIVE_TAB_KEY);
      if (
        saved === 'library' ||
        saved === 'search' ||
        saved === 'soundboard' ||
        saved === 'settings'
      ) {
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
  const appearance = useAppearance();
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

  // Keep canonical & social card URLs synchronized with the active public deployment origin
  useEffect(() => {
    try {
      const cleanUrl = `${window.location.origin}${window.location.pathname}`;
      const canonical = document.querySelector('link[rel="canonical"]');
      if (canonical) canonical.setAttribute('href', cleanUrl);
      const ogUrl = document.querySelector('meta[property="og:url"]');
      if (ogUrl) ogUrl.setAttribute('content', cleanUrl);
      const twUrl = document.querySelector('meta[name="twitter:url"]');
      if (twUrl) twUrl.setAttribute('content', cleanUrl);
    } catch {
      // ignore
    }
  }, []);

  // Notify Service Worker of active audio so updates never force-reload mid-playback and SW stays warm
  useEffect(() => {
    const active = player.isPlaying || soundboard.activeCount > 0;
    notifyServiceWorkerPlaybackState(active);
  }, [player.isPlaying, soundboard.activeCount]);

  // Pre-warm soundboard SFX clips into SW cache for instant playback on low-end Android
  useEffect(() => {
    const remoteUrls = soundboard.pads
      .map((p) => p.url)
      .filter((u) => !isLocalMediaUrl(u));
    if (remoteUrls.length > 0) {
      warmSoundboardInServiceWorker(remoteUrls);
    }
  }, [soundboard.pads]);

  // Keep Android hardware Back button inside the SPA when overlays or non-default tabs are open
  // so pressing Back never exits or reloads the app while music is playing.
  const navStateRef = useRef({
    activeTab,
    playerSheetOpen,
    hasPicker: Boolean(pickerTrack),
    showYoutubeFrame,
  });
  navStateRef.current = {
    activeTab,
    playerSheetOpen,
    hasPicker: Boolean(pickerTrack),
    showYoutubeFrame,
  };

  const pushGuardHistoryIfNeeded = () => {
    try {
      if (window.history.state?.rfaSpaGuard !== true) {
        window.history.pushState({ rfaSpaGuard: true }, '');
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (
      activeTab !== 'library' ||
      playerSheetOpen ||
      Boolean(pickerTrack) ||
      showYoutubeFrame
    ) {
      pushGuardHistoryIfNeeded();
    }
  }, [activeTab, playerSheetOpen, pickerTrack, showYoutubeFrame]);

  useEffect(() => {
    const onPopState = () => {
      const s = navStateRef.current;
      if (s.hasPicker) {
        setPickerTrack(null);
        return;
      }
      if (s.showYoutubeFrame) {
        setShowYoutubeFrame(false);
        return;
      }
      if (s.playerSheetOpen) {
        setPlayerSheetOpen(false);
        return;
      }
      if (s.activeTab !== 'library') {
        setActiveTab('library');
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

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
  const allTracksSignature = library.allTracks.map((t) => `${t.id}:${t.url}`).join('|');

  // Always keep the first X seconds of EVERY song across all folders pre-cached,
  // prioritizing the active folder first for instantaneous track switching.
  useEffect(() => {
    if (library.allTracks.length > 0) {
      player.warmTracks([...currentFolderTracks, ...library.allTracks]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [library.selectedFolderId, allTracksSignature, player.introCacheSeconds, isOnline]);

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
    <div className="min-h-dvh bg-canvas text-[#F2F0EB] flex flex-col">
      {/* Top Bar: 3-zone contract, scrolls cleanly on mobile */}
      <header className="border-b border-white/8 bg-canvas/90 backdrop-blur-md">
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
                  ? 'text-accent-light border-accent'
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
                  ? 'text-accent-light border-accent'
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
                  ? 'text-accent-light border-accent'
                  : 'text-[#9C988E] border-transparent hover:text-[#F2F0EB]'
              }`}
            >
              Soundboard
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              className={`py-1 whitespace-nowrap shrink-0 transition border-b-2 ${
                activeTab === 'settings'
                  ? 'text-accent-light border-accent'
                  : 'text-[#9C988E] border-transparent hover:text-[#F2F0EB]'
              }`}
            >
              Ajustes
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
        <div className="bg-accent/15 border-b border-accent/35 px-4 py-2.5">
          <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={player.resumePending}
              className="flex-1 min-w-0 flex items-center gap-2.5 text-left min-h-[40px]"
            >
              <span className="w-8 h-8 rounded-lg bg-accent text-accent-contrast flex items-center justify-center shrink-0">
                <Play className="w-4 h-4 fill-current ml-0.5" />
              </span>
              <span className="text-xs text-[#F2F0EB] truncate">
                Continuar <strong>{player.currentTrack.title}</strong> en{' '}
                <span className="font-mono-tabular text-accent-light">
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
                soundPads={soundboard.pads}
                onAddSoundPad={soundboard.addPad}
                onRemoveSoundPad={soundboard.removePad}
                onGoToSoundboard={() => setActiveTab('soundboard')}
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

            {activeTab === 'settings' && (
              <SettingsView
                settings={appearance.settings}
                onUpdate={appearance.updateSettings}
                onReset={appearance.resetAppearance}
              />
            )}
          </section>

          {/* Desktop Persistent Studio Player Deck */}
          <aside className="hidden lg:block lg:col-span-5 sticky top-6">
            <div className="rounded-2xl border border-white/10 bg-surface p-5 shadow-xl">
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
                filterIntensity={player.filterIntensity}
                onChangeFilterIntensity={player.setFilterIntensity}
                equalizer={player.equalizer}
                onChangeEqualizer={player.setEqualizer}
                onResetEqualizer={player.resetEqualizer}
                ytAuthStatus={player.ytAuthStatus}
                ytLoginSuggested={player.ytLoginSuggested}
                ytAuthBusy={player.ytAuthBusy}
                onStartYtAuth={player.startYtAuth}
                onLogoutYtAuth={player.logoutYtAuth}
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

        <footer className="mt-10 pt-4 border-t border-white/6 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#78746C]">
          <span>
            RFA — Roll For Ambience (Roll-For-Ambience) · DnD soundboard y música para rol
          </span>
          <span>Creado por NizaTF (Nico Talens)</span>
        </footer>
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
          className="bg-canvas/95 backdrop-blur-md border-t border-white/10 grid grid-cols-4 h-14 pb-safe"
        >
          <button
            type="button"
            onClick={() => setActiveTab('library')}
            className={`flex flex-col items-center justify-center gap-0.5 transition ${
              activeTab === 'library' ? 'text-accent-light' : 'text-[#8C887E]'
            }`}
          >
            <FolderOpen className="w-5 h-5" />
            <span className="text-[11px] font-medium">Carpetas</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('search')}
            className={`flex flex-col items-center justify-center gap-0.5 transition ${
              activeTab === 'search' ? 'text-accent-light' : 'text-[#8C887E]'
            }`}
          >
            <Search className="w-5 h-5" />
            <span className="text-[11px] font-medium">Buscar</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('soundboard')}
            className={`relative flex flex-col items-center justify-center gap-0.5 transition ${
              activeTab === 'soundboard' ? 'text-accent-light' : 'text-[#8C887E]'
            }`}
          >
            <Volume2 className="w-5 h-5" />
            <span className="text-[11px] font-medium">
              Sonidos{soundboard.activeCount > 0 ? ` (${soundboard.activeCount})` : ''}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            className={`flex flex-col items-center justify-center gap-0.5 transition ${
              activeTab === 'settings' ? 'text-accent-light' : 'text-[#8C887E]'
            }`}
          >
            <Settings className="w-5 h-5" />
            <span className="text-[11px] font-medium">Ajustes</span>
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
            className="w-full rounded-t-3xl border-t border-white/10 bg-surface p-5 pb-safe max-h-[92dvh] overflow-y-auto shadow-2xl"
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
              filterIntensity={player.filterIntensity}
              onChangeFilterIntensity={player.setFilterIntensity}
              equalizer={player.equalizer}
              onChangeEqualizer={player.setEqualizer}
              onResetEqualizer={player.resetEqualizer}
              ytAuthStatus={player.ytAuthStatus}
              ytLoginSuggested={player.ytLoginSuggested}
              ytAuthBusy={player.ytAuthBusy}
              onStartYtAuth={player.startYtAuth}
              onLogoutYtAuth={player.logoutYtAuth}
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
            ? 'fixed top-4 right-4 left-4 sm:left-auto sm:w-96 z-[60] rounded-2xl border border-white/15 bg-canvas p-2 shadow-2xl'
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
          <div className="mb-2 rounded-xl border border-accent/35 bg-accent/10 px-3 py-2 text-xs text-accent-light flex items-center justify-between gap-2">
            <span>
              Reproduciendo flujo de audio local con ecualizador (vídeo pausado).
            </span>
            <button
              type="button"
              onClick={() => player.switchActiveYoutubeToIframe()}
              className="shrink-0 rounded-lg bg-accent px-2.5 py-1 text-[11px] font-semibold text-accent-contrast"
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
