import { useCallback, useEffect, useRef, useState } from 'react';
import { audioFilterEngine, DEFAULT_EQ_BANDS } from '../services/audioFilters';
import {
  checkBackendAvailable,
  getYouTubeAuthStatus,
  invalidateYouTubeAudioStream,
  logoutYouTubeAuth,
  resolveYouTubeAudioStream,
  startYouTubeDeviceAuth,
  YouTubeAuthStatus,
} from '../services/freeMusicApi';
import {
  cacheTrackIntro,
  clearIntroFailureCooldowns,
  getCachedIntroSync,
  hydrateIntroCache,
  warmTracksIntroCache,
} from '../services/introCache';
import { getLocalMediaUrlSync, isLocalMediaUrl, resolveLocalMediaUrl } from '../services/localMedia';
import { requestAndroidPersistentStorage } from '../services/persistence';
import { AudioFilterId, CrossfadeStatus, EqualizerBands, LoopMode, Track } from '../types/audio';

interface YTPlayer {
  loadVideoById: (videoId: string, startSeconds?: number) => void;
  cueVideoById: (videoId: string, startSeconds?: number) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  stopVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead?: boolean) => void;
  setVolume: (volume: number) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  destroy: () => void;
}

interface YTGlobal {
  Player: new (
    elementId: string,
    options: {
      height?: string | number;
      width?: string | number;
      host?: string;
      videoId?: string;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: () => void;
        onStateChange?: (event: { data: number }) => void;
        onError?: (event: { data: number }) => void;
      };
    }
  ) => YTPlayer;
  PlayerState: {
    ENDED: number;
    PLAYING: number;
    PAUSED: number;
    BUFFERING: number;
    CUED: number;
  };
}

declare global {
  interface Window {
    YT?: YTGlobal;
    onYouTubeIframeAPIReady?: () => void;
  }
}

type DeckMode = 'idle' | 'audio' | 'youtube';
type YTHost = 'https://www.youtube.com' | 'https://www.youtube-nocookie.com';

interface DeckInstance {
  audio: HTMLAudioElement;
  fullAudio: HTMLAudioElement | null;
  introBlobUrl: string | null;
  usingCachedIntro: boolean;
  introCachedDuration: number;
  reportedFullDuration: number;
  pendingHandoff: boolean;
  handoffInFlight: boolean;
  pendingYTFallback: boolean;
  ytPlayer: YTPlayer | null;
  ytHost: YTHost;
  ytRetryCount: number;
  ytLastStartSeconds: number;
  ytTargetVolume: number;
  ytRetryTimer: number | null;
  ytStallTimer: number | null;
  currentVolume: number;
  ownerSessionId: number;
  activeAudioSrc: string;
  mode: DeckMode;
  track: Track | null;
}

function getYtFallbackGainFactor(filterId: AudioFilterId, intensity = 1): number {
  let target = 1;
  switch (filterId) {
    case 'far_away':
      target = 0.45;
      break;
    case 'behind_door':
      target = 0.65;
      break;
    case 'muffled_house':
      target = 0.78;
      break;
    default:
      target = 1;
  }
  const s = Math.max(0, Math.min(1, intensity));
  return 1 + (target - 1) * s;
}

const PREFS_KEY = 'rfa_dnd_player_prefs_v1';
const LEGACY_PREFS_KEY = 'bardo_dnd_player_prefs_v1';
const PLAYBACK_SNAPSHOT_KEY = 'rfa_dnd_playback_snapshot_v1';
const MAX_YT_RETRIES = 3;
const SILENT_WAV_DATA_URI =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

interface PlayerPrefs {
  crossfadeSeconds: number;
  introCacheSeconds: number;
  audioFilter: AudioFilterId;
  filterIntensity: number;
  equalizer: EqualizerBands;
  masterVolume: number;
  loopMode: LoopMode;
  shuffle: boolean;
}

interface PlaybackSnapshot {
  track: Track;
  queue: Track[];
  queueName: string;
  currentTime: number;
  duration: number;
  wasPlaying: boolean;
  savedAt: number;
}

function clampEqVal(v: unknown): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : 0;
  return Math.max(-12, Math.min(12, Math.round(n)));
}

function clampFilterIntensity(v: unknown): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : 1;
  return Math.max(0, Math.min(1, n));
}

function loadPrefs(): PlayerPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY) || localStorage.getItem(LEGACY_PREFS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        crossfadeSeconds:
          typeof parsed.crossfadeSeconds === 'number' ? parsed.crossfadeSeconds : 4,
        introCacheSeconds:
          typeof parsed.introCacheSeconds === 'number' && parsed.introCacheSeconds >= 5
            ? Math.min(15, parsed.introCacheSeconds)
            : 8,
        audioFilter:
          typeof parsed.audioFilter === 'string' ? (parsed.audioFilter as AudioFilterId) : 'none',
        filterIntensity: clampFilterIntensity(parsed.filterIntensity),
        equalizer: parsed.equalizer
          ? {
              bassDb: clampEqVal(parsed.equalizer.bassDb),
              midDb: clampEqVal(parsed.equalizer.midDb),
              trebleDb: clampEqVal(parsed.equalizer.trebleDb),
            }
          : { ...DEFAULT_EQ_BANDS },
        masterVolume:
          typeof parsed.masterVolume === 'number' ? parsed.masterVolume : 0.85,
        loopMode:
          parsed.loopMode === 'none' || parsed.loopMode === 'folder' || parsed.loopMode === 'track'
            ? parsed.loopMode
            : 'folder',
        shuffle: Boolean(parsed.shuffle),
      };
    }
  } catch {
    // fallback
  }
  return {
    crossfadeSeconds: 4,
    introCacheSeconds: 8,
    audioFilter: 'none',
    filterIntensity: 1,
    equalizer: { ...DEFAULT_EQ_BANDS },
    masterVolume: 0.85,
    loopMode: 'folder',
    shuffle: false,
  };
}

function loadPlaybackSnapshot(): PlaybackSnapshot | null {
  try {
    const raw = localStorage.getItem(PLAYBACK_SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PlaybackSnapshot;
    if (parsed && parsed.track && typeof parsed.track.url === 'string') {
      return parsed;
    }
  } catch {
    // ignore
  }
  return null;
}

let ytApiPromise: Promise<void> | null = null;

function loadYouTubeIframeAPI(forceReload = false): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (!forceReload && window.YT && window.YT.Player) return Promise.resolve();
  if (!forceReload && ytApiPromise) return ytApiPromise;

  if (forceReload) {
    ytApiPromise = null;
  }

  ytApiPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector('script[src*="youtube.com/iframe_api"]');
    if (forceReload && existing) {
      existing.remove();
    }
    const prevCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (prevCallback) prevCallback();
      resolve();
    };
    if (forceReload || !existing) {
      const script = document.createElement('script');
      script.src = forceReload
        ? `https://www.youtube.com/iframe_api?t=${Date.now()}`
        : 'https://www.youtube.com/iframe_api';
      script.async = true;
      script.onerror = () => {
        ytApiPromise = null;
        reject(new Error('No se pudo cargar YouTube API'));
      };
      document.head.appendChild(script);
    }
    setTimeout(() => {
      if (window.YT && window.YT.Player) {
        resolve();
      } else {
        ytApiPromise = null;
      }
    }, 4500);
  });

  return ytApiPromise;
}

function createEmptyDeck(): DeckInstance {
  const audio = new Audio();
  audio.preload = 'auto';
  return {
    audio,
    fullAudio: null,
    introBlobUrl: null,
    usingCachedIntro: false,
    introCachedDuration: 0,
    reportedFullDuration: 0,
    pendingHandoff: false,
    handoffInFlight: false,
    pendingYTFallback: false,
    ytPlayer: null,
    ytHost: 'https://www.youtube.com',
    ytRetryCount: 0,
    ytLastStartSeconds: 0,
    ytTargetVolume: 0.85,
    ytRetryTimer: null,
    ytStallTimer: null,
    currentVolume: 0.85,
    ownerSessionId: 0,
    activeAudioSrc: '',
    mode: 'idle',
    track: null,
  };
}

export function useDualDeckPlayer() {
  const initialPrefs = useRef(loadPrefs()).current;
  const initialSnapshot = useRef(loadPlaybackSnapshot()).current;

  const [currentTrack, setCurrentTrack] = useState<Track | null>(
    initialSnapshot?.track || null
  );
  const [queue, setQueue] = useState<Track[]>(initialSnapshot?.queue || []);
  const [queueName, setQueueName] = useState<string>(
    initialSnapshot?.queueName || 'Biblioteca'
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [currentTime, setCurrentTime] = useState(initialSnapshot?.currentTime || 0);
  const [duration, setDuration] = useState(
    initialSnapshot?.duration || initialSnapshot?.track?.duration || 0
  );
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [filterStatusNote, setFilterStatusNote] = useState<string | null>(null);
  const [activeDeckIndex, setActiveDeckIndex] = useState<0 | 1>(0);
  const [activeDeckMode, setActiveDeckMode] = useState<DeckMode>('idle');
  const [pendingResumeTime, setPendingResumeTime] = useState<number | null>(
    initialSnapshot && initialSnapshot.wasPlaying ? initialSnapshot.currentTime : null
  );

  const [crossfadeSeconds, setCrossfadeSeconds] = useState<number>(initialPrefs.crossfadeSeconds);
  const [introCacheSeconds, setIntroCacheSeconds] = useState<number>(
    initialPrefs.introCacheSeconds
  );
  const [audioFilter, setAudioFilterState] = useState<AudioFilterId>(initialPrefs.audioFilter);
  const [filterIntensity, setFilterIntensityState] = useState<number>(initialPrefs.filterIntensity);
  const [equalizer, setEqualizerState] = useState<EqualizerBands>(initialPrefs.equalizer);
  const [ytAuthStatus, setYtAuthStatus] = useState<YouTubeAuthStatus>({
    available: false,
    authenticated: false,
  });
  const [ytLoginSuggested, setYtLoginSuggested] = useState(false);
  const [ytAuthBusy, setYtAuthBusy] = useState(false);
  const [masterVolume, setMasterVolume] = useState<number>(initialPrefs.masterVolume);
  const [loopMode, setLoopMode] = useState<LoopMode>(initialPrefs.loopMode);
  const [shuffle, setShuffle] = useState<boolean>(initialPrefs.shuffle);
  const [keepScreenAwake, setKeepScreenAwake] = useState<boolean>(false);

  const [crossfadeStatus, setCrossfadeStatus] = useState<CrossfadeStatus>({
    active: false,
    progress: 0,
    durationSec: initialPrefs.crossfadeSeconds,
  });

  useEffect(() => {
    hydrateIntroCache();
    requestAndroidPersistentStorage();
    getYouTubeAuthStatus().then(setYtAuthStatus).catch(() => {});
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        PREFS_KEY,
        JSON.stringify({
          crossfadeSeconds,
          introCacheSeconds,
          audioFilter,
          filterIntensity,
          equalizer,
          masterVolume,
          loopMode,
          shuffle,
        })
      );
    } catch {
      // ignore
    }
  }, [
    crossfadeSeconds,
    introCacheSeconds,
    audioFilter,
    filterIntensity,
    equalizer,
    masterVolume,
    loopMode,
    shuffle,
  ]);

  const decksRef = useRef<[DeckInstance, DeckInstance] | null>(null);
  if (!decksRef.current && typeof Audio !== 'undefined') {
    decksRef.current = [createEmptyDeck(), createEmptyDeck()];
  }

  const activeDeckRef = useRef<0 | 1>(0);
  const isPlayingRef = useRef(false);
  const masterVolumeRef = useRef(masterVolume);
  const crossfadeSecRef = useRef(crossfadeSeconds);
  const introCacheSecRef = useRef(introCacheSeconds);
  const audioFilterRef = useRef<AudioFilterId>(audioFilter);
  const filterIntensityRef = useRef<number>(filterIntensity);
  const equalizerRef = useRef<EqualizerBands>(equalizer);
  const loopModeRef = useRef(loopMode);
  const shuffleRef = useRef(shuffle);
  const queueRef = useRef<Track[]>(queue);
  const queueNameRef = useRef<string>(queueName);
  const currentTrackRef = useRef<Track | null>(currentTrack);
  const currentTimeRef = useRef<number>(currentTime);
  const durationRef = useRef<number>(duration);
  const pendingResumeTimeRef = useRef<number | null>(pendingResumeTime);
  const fadeIntervalRef = useRef<number | null>(null);
  const autoCrossfadedRef = useRef(false);
  const playSessionIdRef = useRef(0);
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);

  const ytWaitersRef = useRef<[(() => void) | null, (() => void) | null]>([null, null]);
  const ytErrorWaitersRef = useRef<[((msg: string) => void) | null, ((msg: string) => void) | null]>([
    null,
    null,
  ]);

  masterVolumeRef.current = masterVolume;
  crossfadeSecRef.current = crossfadeSeconds;
  introCacheSecRef.current = introCacheSeconds;
  audioFilterRef.current = audioFilter;
  filterIntensityRef.current = filterIntensity;
  equalizerRef.current = equalizer;
  loopModeRef.current = loopMode;
  shuffleRef.current = shuffle;
  queueRef.current = queue;
  queueNameRef.current = queueName;
  currentTrackRef.current = currentTrack;
  currentTimeRef.current = currentTime;
  durationRef.current = duration;
  pendingResumeTimeRef.current = pendingResumeTime;

  const hasCustomEq = (bands: EqualizerBands) =>
    bands.bassDb !== 0 || bands.midDb !== 0 || bands.trebleDb !== 0;

  // Keep AudioFilterEngine synced & auto-resume suspended Web Audio on Android visibility restore
  useEffect(() => {
    audioFilterEngine.setPlaybackActive(isPlaying);
    const onRecover = () => {
      if (isPlayingRef.current) {
        audioFilterEngine.resume();
      }
    };
    document.addEventListener('visibilitychange', onRecover);
    window.addEventListener('pageshow', onRecover);
    return () => {
      document.removeEventListener('visibilitychange', onRecover);
      window.removeEventListener('pageshow', onRecover);
    };
  }, [isPlaying]);

  // Hold a Web Lock while playing to prevent low-end Android background throttling/freezing
  useEffect(() => {
    if (!isPlaying || typeof navigator === 'undefined' || !('locks' in navigator)) {
      return;
    }
    let releaseLock: (() => void) | null = null;
    let released = false;

    try {
      navigator.locks
        .request('rfa-audio-playback-active', () => {
          return new Promise<void>((resolve) => {
            if (released) {
              resolve();
            } else {
              releaseLock = resolve;
            }
          });
        })
        .catch(() => {});
    } catch {
      // ignore unsupported locks
    }

    return () => {
      released = true;
      releaseLock?.();
    };
  }, [isPlaying]);

  // Poll YouTube OAuth status while device verification is pending
  useEffect(() => {
    if (!ytAuthStatus.available || ytAuthStatus.authenticated || !ytAuthStatus.pending) {
      return;
    }
    const timer = window.setInterval(async () => {
      const next = await getYouTubeAuthStatus();
      setYtAuthStatus(next);
      if (next.authenticated) {
        setYtLoginSuggested(false);
        setFilterStatusNote('Cuenta de YouTube vinculada. Filtros y ecualizador listos.');
      }
    }, 3000);
    return () => window.clearInterval(timer);
  }, [ytAuthStatus.available, ytAuthStatus.authenticated, ytAuthStatus.pending]);

  const warmTracks = useCallback((tracks: Track[]) => {
    const sec = Math.max(5, introCacheSecRef.current);
    if (tracks.length === 0) return;
    warmTracksIntroCache(tracks, sec);
  }, []);

  // Automatically warm queue intros when queue or introCacheSeconds changes
  useEffect(() => {
    if (queue.length > 0) {
      warmTracksIntroCache(queue, Math.max(5, introCacheSeconds));
    }
  }, [queue, introCacheSeconds]);

  // Clear retry cooldowns whenever internet connectivity returns
  useEffect(() => {
    const onOnline = () => {
      clearIntroFailureCooldowns();
      if (queueRef.current.length > 0) {
        warmTracksIntroCache(queueRef.current, Math.max(5, introCacheSecRef.current));
      }
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, []);

  const saveSnapshot = useCallback((forcePlaying?: boolean) => {
    const track = currentTrackRef.current;
    if (!track) return;
    try {
      const snap: PlaybackSnapshot = {
        track,
        queue: queueRef.current,
        queueName: queueNameRef.current,
        currentTime: currentTimeRef.current,
        duration: durationRef.current,
        wasPlaying: forcePlaying !== undefined ? forcePlaying : isPlayingRef.current,
        savedAt: Date.now(),
      };
      localStorage.setItem(PLAYBACK_SNAPSHOT_KEY, JSON.stringify(snap));
    } catch {
      // ignore
    }
  }, []);

  const clearDeckIntroArtifacts = useCallback((deck: DeckInstance) => {
    if (deck.fullAudio) {
      deck.fullAudio.oncanplay = null;
      deck.fullAudio.onloadedmetadata = null;
      deck.fullAudio.onerror = null;
      deck.fullAudio.pause();
      deck.fullAudio.removeAttribute('src');
      deck.fullAudio.load();
      deck.fullAudio = null;
    }
    if (deck.introBlobUrl) {
      URL.revokeObjectURL(deck.introBlobUrl);
      deck.introBlobUrl = null;
    }
    deck.usingCachedIntro = false;
    deck.introCachedDuration = 0;
    deck.pendingHandoff = false;
    deck.handoffInFlight = false;
    deck.pendingYTFallback = false;
  }, []);

  const clearDeckYTTimers = useCallback((deck: DeckInstance) => {
    if (deck.ytRetryTimer !== null) {
      window.clearTimeout(deck.ytRetryTimer);
      deck.ytRetryTimer = null;
    }
    if (deck.ytStallTimer !== null) {
      window.clearTimeout(deck.ytStallTimer);
      deck.ytStallTimer = null;
    }
  }, []);

  const routeElementWithFilterIfNeeded = useCallback(
    (audioEl: HTMLAudioElement, reloadSrc?: string, alwaysAttachCors = false) => {
      const needsEqOrFilter =
        audioFilterRef.current !== 'none' || hasCustomEq(equalizerRef.current);

      if (
        !needsEqOrFilter &&
        !alwaysAttachCors &&
        !audioFilterEngine.isElementAttached(audioEl)
      ) {
        return;
      }
      audioFilterEngine.applyEqualizer(equalizerRef.current);
      audioFilterEngine.applyPreset(audioFilterRef.current, filterIntensityRef.current);

      const src = audioEl.currentSrc || audioEl.src || '';
      const isBlob = src.startsWith('blob:');
      const isSameOriginApi = src.includes('/api/youtube/');
      const needsCorsReload =
        !isBlob && !isSameOriginApi && audioEl.crossOrigin !== 'anonymous';

      if (needsCorsReload && reloadSrc) {
        const savedPos = audioEl.currentTime || 0;
        const wasPlaying = !audioEl.paused;
        audioEl.crossOrigin = 'anonymous';
        audioEl.src = reloadSrc;
        audioEl.load();
        const onMeta = () => {
          audioEl.removeEventListener('loadedmetadata', onMeta);
          if (savedPos > 0.2) {
            try {
              audioEl.currentTime = savedPos;
            } catch {
              // ignore
            }
          }
          if (wasPlaying) {
            audioEl.play().catch(() => {});
          }
        };
        audioEl.addEventListener('loadedmetadata', onMeta);
      }

      audioFilterEngine.attachAudioElement(audioEl);
    },
    []
  );

  const setDeckVolume = useCallback((deckIdx: 0 | 1, linearVol: number) => {
    const deck = decksRef.current?.[deckIdx];
    if (!deck) return;
    const clamped = Math.max(0, Math.min(1, linearVol));
    deck.currentVolume = clamped;
    deck.audio.volume = clamped;
    const ytAdjusted =
      clamped * getYtFallbackGainFactor(audioFilterRef.current, filterIntensityRef.current);
    deck.ytTargetVolume = ytAdjusted;
    if (deck.ytPlayer) {
      try {
        deck.ytPlayer.setVolume(Math.round(ytAdjusted * 100));
      } catch {
        // ignore
      }
    }
  }, []);

  const stopDeck = useCallback(
    (deckIdx: 0 | 1) => {
      const deck = decksRef.current?.[deckIdx];
      if (!deck) return;
      ytWaitersRef.current[deckIdx] = null;
      ytErrorWaitersRef.current[deckIdx] = null;
      clearDeckYTTimers(deck);
      clearDeckIntroArtifacts(deck);

      deck.audio.onplaying = null;
      deck.audio.onwaiting = null;
      deck.audio.oncanplay = null;
      deck.audio.onended = null;
      deck.audio.onerror = null;
      deck.audio.onloadedmetadata = null;
      deck.audio.pause();
      deck.audio.removeAttribute('src');
      deck.audio.load();
      deck.activeAudioSrc = '';
      deck.reportedFullDuration = 0;
      deck.currentVolume = 0;

      if (deck.ytPlayer) {
        try {
          deck.ytPlayer.stopVideo();
        } catch {
          // ignore
        }
      }
      deck.mode = 'idle';
      deck.track = null;
      deck.ytRetryCount = 0;
      if (activeDeckRef.current === deckIdx) {
        setActiveDeckMode('idle');
      }
    },
    [clearDeckIntroArtifacts, clearDeckYTTimers]
  );

  const cancelCrossfade = useCallback(() => {
    if (fadeIntervalRef.current !== null) {
      window.clearInterval(fadeIntervalRef.current);
      fadeIntervalRef.current = null;
    }
    setCrossfadeStatus({
      active: false,
      progress: 0,
      durationSec: crossfadeSecRef.current,
    });
  }, []);

  const handleTrackEndedRef = useRef<(deckIdx: 0 | 1) => void>(() => {});
  const retryYouTubeDeckRef = useRef<(deckIdx: 0 | 1, reason?: string) => void>(() => {});
  const fallbackYouTubeToIframeRef = useRef<
    (deckIdx: 0 | 1, track: Track, posSeconds: number, initialVol?: number) => Promise<void>
  >(async () => {});
  const promoteFullAudioRef = useRef<(deckIdx: 0 | 1, seekOverride?: number) => Promise<boolean>>(
    async () => false
  );

  const attachAudioElementListeners = useCallback(
    (deckIdx: 0 | 1, audioEl: HTMLAudioElement, isIntroChunk: boolean) => {
      audioEl.onwaiting = () => {
        if (activeDeckRef.current === deckIdx) setIsBuffering(true);
      };
      audioEl.onplaying = () => {
        if (activeDeckRef.current === deckIdx) {
          setIsBuffering(false);
          setIsPlaying(true);
          isPlayingRef.current = true;
          setPendingResumeTime(null);
          setPlayerError(null);
        }
      };
      audioEl.oncanplay = () => {
        if (activeDeckRef.current === deckIdx) setIsBuffering(false);
      };
      audioEl.onloadedmetadata = () => {
        const deck = decksRef.current?.[deckIdx];
        if (!deck || isIntroChunk) return;
        if (Number.isFinite(audioEl.duration) && audioEl.duration > 0) {
          deck.reportedFullDuration = audioEl.duration;
          if (activeDeckRef.current === deckIdx) {
            setDuration(audioEl.duration);
            durationRef.current = audioEl.duration;
          }
        }
      };
      audioEl.onended = () => {
        const deck = decksRef.current?.[deckIdx];
        if (isIntroChunk && deck && deck.usingCachedIntro) {
          if (deck.fullAudio) {
            // Intro cache chunk ended before full stream took over: wait & swap seamlessly
            deck.pendingHandoff = true;
            if (activeDeckRef.current === deckIdx) {
              setIsBuffering(true);
            }
            promoteFullAudioRef.current(deckIdx, deck.introCachedDuration);
            return;
          }
          if (deck.pendingYTFallback && deck.track?.source === 'youtube' && deck.track.youtubeId) {
            const savedTrack = deck.track;
            const resumeAt = deck.introCachedDuration;
            const vol = deck.currentVolume;
            deck.usingCachedIntro = false;
            fallbackYouTubeToIframeRef.current(deckIdx, savedTrack, resumeAt, vol);
            return;
          }
          // Background stream resolution is still in flight; hand off as soon as it resolves
          deck.pendingHandoff = true;
          if (activeDeckRef.current === deckIdx) {
            setIsBuffering(true);
          }
          return;
        }
        // Guard against unexpected stream truncation early in a long track (never treat 10s cutoff as track end)
        if (deck && !isIntroChunk) {
          const expectedDur = Math.max(
            deck.reportedFullDuration || 0,
            deck.track?.duration || 0
          );
          const pos = audioEl.currentTime || 0;
          const retries = Number(audioEl.dataset.recoveryCount || '0');
          if (expectedDur > 25 && pos > 1 && pos < expectedDur * 0.65 && deck.track && retries < 2) {
            audioEl.dataset.recoveryCount = String(retries + 1);
            if (activeDeckRef.current === deckIdx) {
              setIsBuffering(true);
            }
            const base = deck.activeAudioSrc || deck.track.url;
            const sep = base.includes('?') ? '&' : '?';
            const resumeUrl = /^https?:/i.test(base) ? `${base}${sep}_r=${Date.now()}` : base;
            audioEl.src = resumeUrl;
            audioEl.load();
            const seekResume = () => {
              audioEl.removeEventListener('loadedmetadata', seekResume);
              try {
                audioEl.currentTime = pos;
              } catch {
                // ignore
              }
              if (isPlayingRef.current) {
                audioEl.play().catch(() => {});
              }
            };
            audioEl.addEventListener('loadedmetadata', seekResume);
            return;
          }
        }
        if (activeDeckRef.current === deckIdx) {
          handleTrackEndedRef.current(deckIdx);
        }
      };
      audioEl.onerror = () => {
        if (isIntroChunk) return;
        const deck = decksRef.current?.[deckIdx];
        if (deck && deck.track?.source === 'youtube' && deck.track.youtubeId) {
          const videoId = deck.track.youtubeId;
          const pos = audioEl.currentTime || currentTimeRef.current || 0;
          const savedTrack = deck.track;
          const vol = deck.currentVolume;
          invalidateYouTubeAudioStream(videoId);
          setFilterStatusNote(
            'Se ha vuelto al reproductor de YouTube estándar (solo atenuación de volumen).'
          );
          fallbackYouTubeToIframeRef.current(deckIdx, savedTrack, pos, vol);
          return;
        }
        if (activeDeckRef.current === deckIdx) {
          setIsBuffering(false);
          setIsPlaying(false);
          isPlayingRef.current = false;
          setPlayerError('No se pudo reproducir este enlace de audio.');
        }
      };
    },
    []
  );

  promoteFullAudioRef.current = async (deckIdx: 0 | 1, seekOverride?: number): Promise<boolean> => {
    const deck = decksRef.current?.[deckIdx];
    if (!deck || !deck.usingCachedIntro || !deck.fullAudio || deck.handoffInFlight) {
      return false;
    }

    const full = deck.fullAudio;
    const targetTime =
      seekOverride !== undefined ? seekOverride : Math.max(0, deck.audio.currentTime || 0);
    const forcedHandoff = seekOverride !== undefined || deck.pendingHandoff;

    // Require full audio to be ready & actually longer than the intro chunk before early swap
    if (!forcedHandoff) {
      if (full.readyState < 3) return false;
      const fullDur = Number.isFinite(full.duration) ? full.duration : 0;
      const expectedTrackDur = deck.track?.duration || 0;
      if (fullDur > 0 && expectedTrackDur > deck.introCachedDuration + 3 && fullDur <= deck.introCachedDuration + 1) {
        // Avoid swapping to a truncated/cached response shorter than the real song
        return false;
      }
      const hasSeekable =
        full.seekable.length > 0 && full.seekable.end(full.seekable.length - 1) >= targetTime + 0.5;
      const hasBuffered =
        full.buffered.length > 0 && full.buffered.end(full.buffered.length - 1) >= targetTime + 0.5;
      if (!hasSeekable && !hasBuffered) {
        return false;
      }
    }

    deck.handoffInFlight = true;
    try {
      const waitPlayable =
        full.readyState >= 2
          ? Promise.resolve()
          : new Promise<void>((resolve, reject) => {
              const t = window.setTimeout(() => reject(new Error('timeout')), 12000);
              full.oncanplay = () => {
                window.clearTimeout(t);
                resolve();
              };
              full.onerror = () => {
                window.clearTimeout(t);
                reject(new Error('error'));
              };
            });

      await waitPlayable;

      if (deck.fullAudio !== full || deck.mode !== 'audio') {
        return false;
      }

      // Perform seek and wait briefly for 'seeked' so playback resumes at exact timestamp without hitting EOF
      if (targetTime > 0.2) {
        await new Promise<void>((resolve) => {
          let done = false;
          const finish = () => {
            if (done) return;
            done = true;
            window.clearTimeout(t);
            full.removeEventListener('seeked', finish);
            resolve();
          };
          const t = window.setTimeout(finish, 1500);
          full.addEventListener('seeked', finish);
          try {
            full.currentTime = targetTime;
          } catch {
            finish();
          }
        });
      }

      // If full.ended happened immediately after seek, rewind safely instead of skipping track
      if (full.ended) {
        try {
          full.currentTime = 0;
        } catch {
          // ignore
        }
      }

      full.volume = deck.audio.volume;
      full.loop = loopModeRef.current === 'track';

      // Route through EQ/filter BEFORE starting playback so transition is glitch-free
      routeElementWithFilterIfNeeded(full, deck.activeAudioSrc || deck.track?.url);

      if (isPlayingRef.current || deck.pendingHandoff || seekOverride !== undefined) {
        await full.play();
      }

      const oldIntro = deck.audio;
      oldIntro.onplaying = null;
      oldIntro.onwaiting = null;
      oldIntro.oncanplay = null;
      oldIntro.onended = null;
      oldIntro.onerror = null;
      oldIntro.pause();
      oldIntro.removeAttribute('src');
      oldIntro.load();

      if (deck.introBlobUrl) {
        URL.revokeObjectURL(deck.introBlobUrl);
        deck.introBlobUrl = null;
      }

      deck.audio = full;
      deck.fullAudio = null;
      deck.usingCachedIntro = false;
      deck.pendingHandoff = false;
      deck.pendingYTFallback = false;
      if (Number.isFinite(full.duration) && full.duration > 0) {
        deck.reportedFullDuration = full.duration;
      }
      attachAudioElementListeners(deckIdx, full, false);

      if (activeDeckRef.current === deckIdx) {
        setIsBuffering(false);
        if (deck.reportedFullDuration > 0) {
          setDuration(deck.reportedFullDuration);
          durationRef.current = deck.reportedFullDuration;
        }
      }
      return true;
    } catch {
      return false;
    } finally {
      deck.handoffInFlight = false;
    }
  };

  const createYouTubePlayerForDeck = useCallback(
    async (idx: 0 | 1, host: YTHost, forceReloadApi = false): Promise<YTPlayer | null> => {
      const decks = decksRef.current;
      if (!decks) return null;

      await loadYouTubeIframeAPI(forceReloadApi);
      if (!window.YT || !window.YT.Player) {
        throw new Error('La API de YouTube no está disponible');
      }

      const deck = decks[idx];
      if (deck.ytPlayer) {
        try {
          deck.ytPlayer.destroy();
        } catch {
          // ignore
        }
        deck.ytPlayer = null;
      }

      // Ensure mount element is a clean <div> inside its wrapper container
      const elId = `yt-deck-${idx}`;
      const existingEl = document.getElementById(elId);
      if (existingEl && existingEl.tagName === 'IFRAME' && existingEl.parentElement) {
        const freshDiv = document.createElement('div');
        freshDiv.id = elId;
        freshDiv.className = 'w-full h-full';
        existingEl.parentElement.replaceChild(freshDiv, existingEl);
      }

      deck.ytHost = host;

      return new Promise<YTPlayer | null>((resolve) => {
        const targetEl = document.getElementById(elId);
        if (!targetEl) {
          resolve(null);
          return;
        }

        let resolved = false;
        const done = (p: YTPlayer | null) => {
          if (!resolved) {
            resolved = true;
            resolve(p);
          }
        };

        const playerVars: Record<string, string | number> = {
          autoplay: 0,
          controls: 1,
          playsinline: 1,
          rel: 0,
          modestbranding: 1,
          enablejsapi: 1,
        };
        if (host === 'https://www.youtube.com') {
          playerVars.origin = window.location.origin;
        }

        const player = new window.YT!.Player(elId, {
          height: '100%',
          width: '100%',
          host,
          playerVars,
          events: {
            onReady: () => {
              decks[idx].ytPlayer = player;
              done(player);
            },
            onStateChange: (event) => {
              const YTState = window.YT?.PlayerState;
              if (!YTState) return;

              if (event.data === YTState.PLAYING) {
                decks[idx].ytRetryCount = 0;
                clearDeckYTTimers(decks[idx]);

                const waiter = ytWaitersRef.current[idx];
                if (waiter) {
                  ytWaitersRef.current[idx] = null;
                  ytErrorWaitersRef.current[idx] = null;
                  waiter();
                }
              }

              if (activeDeckRef.current !== idx) return;
              if (event.data === YTState.PLAYING) {
                isPlayingRef.current = true;
                setIsPlaying(true);
                setIsBuffering(false);
                setPendingResumeTime(null);
                setPlayerError(null);
              } else if (event.data === YTState.PAUSED) {
                isPlayingRef.current = false;
                setIsPlaying(false);
                setIsBuffering(false);
              } else if (event.data === YTState.BUFFERING) {
                setIsBuffering(true);
              } else if (event.data === YTState.ENDED) {
                clearDeckYTTimers(decks[idx]);
                handleTrackEndedRef.current(idx);
              }
            },
            onError: () => {
              retryYouTubeDeckRef.current(idx, 'error');
            },
          },
        });

        window.setTimeout(() => done(decks[idx].ytPlayer), 3500);
      });
    },
    [clearDeckYTTimers]
  );

  const ensureYouTubePlayers = useCallback(async () => {
    const decks = decksRef.current;
    if (!decks) return;
    if (decks[0].ytPlayer && decks[1].ytPlayer) return;

    await Promise.all([
      decks[0].ytPlayer
        ? Promise.resolve(decks[0].ytPlayer)
        : createYouTubePlayerForDeck(0, decks[0].ytHost),
      decks[1].ytPlayer
        ? Promise.resolve(decks[1].ytPlayer)
        : createYouTubePlayerForDeck(1, decks[1].ytHost),
    ]);
  }, [createYouTubePlayerForDeck]);

  // Immediate automatic retry when YouTube blocks/drops or stalls connection
  retryYouTubeDeckRef.current = (deckIdx: 0 | 1, reason = 'error') => {
    const deck = decksRef.current?.[deckIdx];
    if (!deck || deck.mode !== 'youtube' || !deck.track?.youtubeId) return;

    clearDeckYTTimers(deck);
    const nextAttempt = deck.ytRetryCount + 1;

    if (nextAttempt > MAX_YT_RETRIES) {
      const msg =
        'YouTube bloqueó la conexión tras varios reintentos inmediatos. Prueba otra URL o abre el vídeo.';
      const errWaiter = ytErrorWaitersRef.current[deckIdx];
      if (errWaiter) {
        ytWaitersRef.current[deckIdx] = null;
        ytErrorWaitersRef.current[deckIdx] = null;
        errWaiter(msg);
      }
      if (activeDeckRef.current === deckIdx) {
        setIsBuffering(false);
        setPlayerError(msg);
      }
      return;
    }

    deck.ytRetryCount = nextAttempt;
    const videoId = deck.track.youtubeId;
    const resumePos =
      activeDeckRef.current === deckIdx
        ? Math.max(deck.ytLastStartSeconds, currentTimeRef.current || 0)
        : deck.ytLastStartSeconds;

    if (activeDeckRef.current === deckIdx) {
      setIsBuffering(true);
      setPlayerError(
        `Conexión con YouTube bloqueada (${reason === 'stall' ? 'sin respuesta' : 'error'}). Reintentando al instante (${nextAttempt}/${MAX_YT_RETRIES})...`
      );
    }

    const alternateHost: YTHost =
      deck.ytHost === 'https://www.youtube.com'
        ? 'https://www.youtube-nocookie.com'
        : 'https://www.youtube.com';

    const delayMs = nextAttempt === 1 ? 100 : nextAttempt === 2 ? 300 : 600;

    deck.ytRetryTimer = window.setTimeout(async () => {
      deck.ytRetryTimer = null;
      if (deck.mode !== 'youtube' || deck.track?.youtubeId !== videoId) return;

      try {
        const yt = await createYouTubePlayerForDeck(
          deckIdx,
          alternateHost,
          nextAttempt === MAX_YT_RETRIES
        );
        if (!yt || deck.mode !== 'youtube' || deck.track?.youtubeId !== videoId) return;

        yt.setVolume(Math.round(Math.max(0, Math.min(1, deck.ytTargetVolume)) * 100));
        yt.loadVideoById(videoId, resumePos);
        yt.playVideo();

        // Arm stall guard for this retry attempt
        deck.ytStallTimer = window.setTimeout(() => {
          const curState = yt.getPlayerState?.();
          if (
            deck.mode === 'youtube' &&
            deck.track?.youtubeId === videoId &&
            curState !== window.YT?.PlayerState.PLAYING
          ) {
            retryYouTubeDeckRef.current(deckIdx, 'stall');
          }
        }, 4500);
      } catch {
        retryYouTubeDeckRef.current(deckIdx, 'error');
      }
    }, delayMs);
  };

  useEffect(() => {
    if (navigator.onLine) {
      loadYouTubeIframeAPI().catch(() => {});
    }
  }, []);

  const startYouTubeIframeOnDeck = useCallback(
    async (
      deckIdx: 0 | 1,
      track: Track,
      initialVolume: number,
      waitForPlaybackStart: boolean,
      startSeconds = 0,
      expectedSessionId?: number
    ) => {
      const deck = decksRef.current?.[deckIdx];
      if (!deck || !track.youtubeId) return;

      deck.mode = 'youtube';
      if (activeDeckRef.current === deckIdx) {
        setActiveDeckMode('youtube');
      }
      deck.ytRetryCount = 0;
      deck.ytLastStartSeconds = startSeconds;
      const clampedVol = Math.max(0, Math.min(1, initialVolume));
      deck.currentVolume = clampedVol;
      const ytAdjusted =
        clampedVol * getYtFallbackGainFactor(audioFilterRef.current, filterIntensityRef.current);
      deck.ytTargetVolume = ytAdjusted;

      await ensureYouTubePlayers();
      if (expectedSessionId !== undefined && deck.ownerSessionId !== expectedSessionId) {
        return;
      }
      const yt = decksRef.current?.[deckIdx]?.ytPlayer;
      if (!yt) {
        throw new Error('No se pudo inicializar el reproductor de YouTube');
      }

      const waitPromise = waitForPlaybackStart
        ? new Promise<void>((resolve, reject) => {
            const timeout = window.setTimeout(() => {
              ytWaitersRef.current[deckIdx] = null;
              ytErrorWaitersRef.current[deckIdx] = null;
              resolve();
            }, 16000);

            ytWaitersRef.current[deckIdx] = () => {
              window.clearTimeout(timeout);
              resolve();
            };
            ytErrorWaitersRef.current[deckIdx] = (msg: string) => {
              window.clearTimeout(timeout);
              reject(new Error(msg));
            };
          })
        : Promise.resolve();

      yt.setVolume(Math.round(ytAdjusted * 100));
      yt.loadVideoById(track.youtubeId, startSeconds);
      yt.playVideo();

      // Guard against silent connection blocks / stalls
      deck.ytStallTimer = window.setTimeout(() => {
        try {
          const state = yt.getPlayerState?.();
          if (
            deck.mode === 'youtube' &&
            deck.track?.youtubeId === track.youtubeId &&
            state !== window.YT?.PlayerState.PLAYING
          ) {
            retryYouTubeDeckRef.current(deckIdx, 'stall');
          }
        } catch {
          retryYouTubeDeckRef.current(deckIdx, 'stall');
        }
      }, 4500);

      await waitPromise;
    },
    [ensureYouTubePlayers]
  );

  fallbackYouTubeToIframeRef.current = async (
    deckIdx: 0 | 1,
    track: Track,
    posSeconds: number,
    initialVol?: number
  ) => {
    const deck = decksRef.current?.[deckIdx];
    if (!deck || deck.track?.id !== track.id) return;
    deck.audio.onplaying = null;
    deck.audio.onwaiting = null;
    deck.audio.oncanplay = null;
    deck.audio.onended = null;
    deck.audio.onerror = null;
    deck.audio.onloadedmetadata = null;
    deck.audio.pause();
    deck.audio.removeAttribute('src');
    deck.audio.load();
    deck.activeAudioSrc = '';

    try {
      await startYouTubeIframeOnDeck(
        deckIdx,
        track,
        initialVol ?? masterVolumeRef.current,
        false,
        posSeconds,
        deck.ownerSessionId
      );
      if (activeDeckRef.current === deckIdx && !isPlayingRef.current) {
        deck.ytPlayer?.pauseVideo();
      }
    } catch {
      if (activeDeckRef.current === deckIdx) {
        setIsBuffering(false);
        setPlayerError('No se pudo cargar este vídeo de YouTube.');
      }
    }
  };

  const playResolvedAudioUrlOnDeck = useCallback(
    async (
      deckIdx: 0 | 1,
      track: Track,
      streamUrl: string,
      initialVolume: number,
      waitForPlaybackStart: boolean,
      startSeconds = 0,
      expectedSessionId?: number,
      forceCors = false
    ) => {
      const deck = decksRef.current?.[deckIdx];
      if (!deck) return;

      deck.mode = 'audio';
      deck.activeAudioSrc = streamUrl;
      if (activeDeckRef.current === deckIdx) {
        setActiveDeckMode('audio');
      }

      const isBlobUrl = streamUrl.startsWith('blob:');
      const supportsCorsNaturally =
        forceCors ||
        isBlobUrl ||
        track.source === 'local' ||
        track.source === 'audius' ||
        streamUrl.includes('/api/youtube/') ||
        streamUrl.includes('archive.org') ||
        streamUrl.includes('wikimedia.org');
      const eqOrFilterActive =
        audioFilterRef.current !== 'none' || hasCustomEq(equalizerRef.current);
      const shouldSetCors = !isBlobUrl && (supportsCorsNaturally || eqOrFilterActive);

      if (!shouldSetCors && audioFilterEngine.isElementAttached(deck.audio)) {
        deck.audio.onplaying = null;
        deck.audio.onwaiting = null;
        deck.audio.oncanplay = null;
        deck.audio.onended = null;
        deck.audio.onerror = null;
        deck.audio.onloadedmetadata = null;
        deck.audio.pause();
        deck.audio.removeAttribute('src');
        deck.audio.load();
        const freshAudio = new Audio();
        freshAudio.preload = 'auto';
        deck.audio = freshAudio;
      }

      const audio = deck.audio;
      if (shouldSetCors) {
        audio.crossOrigin = 'anonymous';
      } else {
        audio.removeAttribute('crossorigin');
      }
      audio.src = streamUrl;
      audio.volume = Math.max(0, Math.min(1, initialVolume));
      audio.loop = loopModeRef.current === 'track';

      if (startSeconds > 0) {
        const applySeek = () => {
          try {
            audio.currentTime = startSeconds;
          } catch {
            // ignore
          }
          audio.removeEventListener('loadedmetadata', applySeek);
        };
        audio.addEventListener('loadedmetadata', applySeek);
      }

      const readyPromise = waitForPlaybackStart
        ? new Promise<void>((resolve, reject) => {
            let settled = false;
            const cleanup = () => {
              audio.removeEventListener('playing', onPlaying);
              audio.removeEventListener('canplay', onCanPlay);
              audio.removeEventListener('error', onErr);
              window.clearTimeout(timeout);
            };
            const onPlaying = () => {
              if (settled) return;
              settled = true;
              cleanup();
              resolve();
            };
            const onCanPlay = () => {
              if (settled || audio.paused) return;
              settled = true;
              cleanup();
              resolve();
            };
            const onErr = () => {
              if (settled) return;
              settled = true;
              cleanup();
              reject(new Error('No se pudo cargar este enlace de audio.'));
            };
            const timeout = window.setTimeout(() => {
              if (settled) return;
              settled = true;
              cleanup();
              resolve();
            }, 12000);

            audio.addEventListener('playing', onPlaying);
            audio.addEventListener('canplay', onCanPlay);
            audio.addEventListener('error', onErr);
          })
        : Promise.resolve();

      attachAudioElementListeners(deckIdx, audio, false);
      routeElementWithFilterIfNeeded(audio, streamUrl, supportsCorsNaturally);

      if (expectedSessionId !== undefined && deck.ownerSessionId !== expectedSessionId) {
        return;
      }
      await audio.play();
      await readyPromise;
    },
    [attachAudioElementListeners, routeElementWithFilterIfNeeded]
  );

  const upgradeYoutubeDeckToLocalAudio = useCallback(
    async (idx: 0 | 1) => {
      const d = decksRef.current?.[idx];
      if (!d || d.mode !== 'youtube' || d.track?.source !== 'youtube' || !d.track.youtubeId) {
        return;
      }
      const track = d.track;
      const videoId = track.youtubeId!;
      const trackId = track.id;
      const initialPos = d.ytPlayer?.getCurrentTime() || currentTimeRef.current || 0;
      const wasPlaying = isPlayingRef.current;
      const deckVol = d.currentVolume;

      if (wasPlaying) {
        try {
          d.audio.removeAttribute('crossorigin');
          d.audio.src = SILENT_WAV_DATA_URI;
          d.audio.volume = 0;
          await d.audio.play();
          d.audio.pause();
        } catch {
          // ignore
        }
      }

      if (activeDeckRef.current === idx) {
        setIsBuffering(true);
        setFilterStatusNote('Conectando flujo de audio local para ecualizador...');
      }

      const resolved = await resolveYouTubeAudioStream(videoId);
      const stillNeedsAudio =
        audioFilterRef.current !== 'none' || hasCustomEq(equalizerRef.current);

      if (d.track?.id !== trackId || d.mode !== 'youtube' || !stillNeedsAudio) {
        if (activeDeckRef.current === idx) setIsBuffering(false);
        return;
      }

      if (!resolved || !resolved.url) {
        if (resolved?.requiresLogin) {
          setYtLoginSuggested(true);
        }
        if (activeDeckRef.current === idx) {
          setIsBuffering(false);
          setFilterStatusNote(
            resolved?.requiresLogin
              ? 'YouTube pide vincular cuenta en este vídeo para ecualizarlo (puedes seguir escuchándolo en modo estándar).'
              : 'YouTube bloqueó el flujo directo en este vídeo (el reproductor estándar solo ajusta volumen).'
          );
        }
        setDeckVolume(idx, deckVol);
        return;
      }

      if (resolved.duration && !d.reportedFullDuration) {
        d.reportedFullDuration = resolved.duration;
        if (activeDeckRef.current === idx) {
          setDuration(resolved.duration);
          durationRef.current = resolved.duration;
        }
      }

      const audio = d.audio;
      audio.onplaying = null;
      audio.onwaiting = null;
      audio.oncanplay = null;
      audio.onended = null;
      audio.onerror = null;
      audio.onloadedmetadata = null;

      try {
        audio.crossOrigin = 'anonymous';
        audio.src = resolved.url;
        audio.volume = Math.max(0, Math.min(1, deckVol));
        audio.loop = loopModeRef.current === 'track';
        audio.load();

        await new Promise<void>((resolve, reject) => {
          let settled = false;
          const finish = (err?: Error) => {
            if (settled) return;
            settled = true;
            window.clearTimeout(t);
            audio.removeEventListener('canplay', onReady);
            audio.removeEventListener('loadedmetadata', onReady);
            audio.removeEventListener('error', onErr);
            if (err) reject(err);
            else resolve();
          };
          const t = window.setTimeout(() => finish(new Error('timeout')), 10000);
          const onReady = () => finish();
          const onErr = () => finish(new Error('stream error'));
          audio.addEventListener('canplay', onReady);
          audio.addEventListener('loadedmetadata', onReady);
          audio.addEventListener('error', onErr);
        });

        const stillActive =
          audioFilterRef.current !== 'none' || hasCustomEq(equalizerRef.current);
        if (d.track?.id !== trackId || d.mode !== 'youtube' || !stillActive) {
          if (activeDeckRef.current === idx) setIsBuffering(false);
          return;
        }

        const livePos = d.ytPlayer?.getCurrentTime() || initialPos;
        if (livePos > 0.2) {
          try {
            audio.currentTime = livePos;
          } catch {
            // ignore
          }
        }

        routeElementWithFilterIfNeeded(audio, resolved.url, true);
        audioFilterEngine.applyEqualizer(equalizerRef.current);
        audioFilterEngine.applyPreset(audioFilterRef.current, filterIntensityRef.current);

        if (wasPlaying) {
          await audio.play();
        }

        clearDeckYTTimers(d);
        if (d.ytPlayer) {
          try {
            d.ytPlayer.stopVideo();
          } catch {
            // ignore
          }
        }

        d.mode = 'audio';
        d.activeAudioSrc = resolved.url;
        attachAudioElementListeners(idx, audio, false);
        if (activeDeckRef.current === idx) {
          setActiveDeckMode('audio');
          setIsBuffering(false);
          setFilterStatusNote(null);
        }
      } catch (err) {
        const name = err instanceof Error ? err.name : '';
        if (name === 'NotAllowedError') {
          clearDeckYTTimers(d);
          if (d.ytPlayer) {
            try {
              d.ytPlayer.stopVideo();
            } catch {
              // ignore
            }
          }
          d.mode = 'audio';
          d.activeAudioSrc = resolved.url;
          attachAudioElementListeners(idx, audio, false);
          if (activeDeckRef.current === idx) {
            setActiveDeckMode('audio');
            isPlayingRef.current = false;
            setIsPlaying(false);
            setIsBuffering(false);
            setPendingResumeTime(initialPos);
            setFilterStatusNote('Pulsa Reproducir para escuchar el audio con el ecualizador.');
          }
          return;
        }

        invalidateYouTubeAudioStream(videoId);
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
        if (activeDeckRef.current === idx) {
          setIsBuffering(false);
          setFilterStatusNote(
            'YouTube bloqueó el flujo directo en este vídeo (el reproductor estándar solo ajusta volumen).'
          );
        }
        setDeckVolume(idx, deckVol);
      }
    },
    [
      attachAudioElementListeners,
      clearDeckYTTimers,
      routeElementWithFilterIfNeeded,
      setDeckVolume,
    ]
  );

  const setAudioFilter = useCallback(
    async (filterId: AudioFilterId) => {
      audioFilterRef.current = filterId;
      setAudioFilterState(filterId);
      const eqActive = filterId !== 'none' || hasCustomEq(equalizerRef.current);
      if (eqActive) {
        audioFilterEngine.resume();
      }
      audioFilterEngine.applyPreset(filterId, filterIntensityRef.current);
      if (filterId === 'none' && !hasCustomEq(equalizerRef.current)) {
        setFilterStatusNote(null);
      }

      const decks = decksRef.current;
      if (!decks) return;

      for (const idx of [0, 1] as const) {
        const d = decks[idx];
        if (d.mode === 'audio' && d.track) {
          // Instant 0ms local filter update on any audio deck (including server-streamed YouTube!)
          if (eqActive) {
            routeElementWithFilterIfNeeded(d.audio, d.activeAudioSrc || d.track.url);
            if (d.fullAudio) {
              routeElementWithFilterIfNeeded(d.fullAudio, d.activeAudioSrc || d.track.url);
            }
          }
          continue;
        }

        if (d.mode === 'youtube' && d.track?.source === 'youtube' && d.track.youtubeId) {
          if (!eqActive) {
            setDeckVolume(idx, d.currentVolume);
            continue;
          }
          upgradeYoutubeDeckToLocalAudio(idx);
        }
      }
    },
    [routeElementWithFilterIfNeeded, setDeckVolume, upgradeYoutubeDeckToLocalAudio]
  );

  const setFilterIntensity = useCallback(
    (nextIntensity: number) => {
      const clamped = clampFilterIntensity(nextIntensity);
      filterIntensityRef.current = clamped;
      setFilterIntensityState(clamped);
      if (audioFilterRef.current !== 'none') {
        audioFilterEngine.resume();
      }
      audioFilterEngine.applyFilterIntensity(clamped);

      const decks = decksRef.current;
      if (!decks) return;
      for (const idx of [0, 1] as const) {
        const d = decks[idx];
        if (d.mode === 'youtube') {
          setDeckVolume(idx, d.currentVolume);
        }
      }
    },
    [setDeckVolume]
  );

  const setEqualizer = useCallback(
    (next: EqualizerBands) => {
      const normalized: EqualizerBands = {
        bassDb: clampEqVal(next.bassDb),
        midDb: clampEqVal(next.midDb),
        trebleDb: clampEqVal(next.trebleDb),
      };
      equalizerRef.current = normalized;
      setEqualizerState(normalized);
      const eqActive = audioFilterRef.current !== 'none' || hasCustomEq(normalized);
      if (eqActive) {
        audioFilterEngine.resume();
      }
      audioFilterEngine.applyEqualizer(normalized);

      const decks = decksRef.current;
      if (!decks) return;

      for (const idx of [0, 1] as const) {
        const d = decks[idx];
        if (d.mode === 'audio' && d.track && eqActive) {
          routeElementWithFilterIfNeeded(d.audio, d.activeAudioSrc || d.track.url);
          if (d.fullAudio) {
            routeElementWithFilterIfNeeded(d.fullAudio, d.activeAudioSrc || d.track.url);
          }
        } else if (d.mode === 'youtube' && d.track?.source === 'youtube' && eqActive) {
          upgradeYoutubeDeckToLocalAudio(idx);
        }
      }
    },
    [routeElementWithFilterIfNeeded, upgradeYoutubeDeckToLocalAudio]
  );

  const resetEqualizer = useCallback(() => {
    setEqualizer({ ...DEFAULT_EQ_BANDS });
  }, [setEqualizer]);

  const startYtAuth = useCallback(async () => {
    setYtAuthBusy(true);
    try {
      const status = await startYouTubeDeviceAuth();
      setYtAuthStatus(status);
    } finally {
      setYtAuthBusy(false);
    }
  }, []);

  const logoutYtAuth = useCallback(async () => {
    setYtAuthBusy(true);
    try {
      await logoutYouTubeAuth();
      const status = await getYouTubeAuthStatus();
      setYtAuthStatus(status);
    } finally {
      setYtAuthBusy(false);
    }
  }, []);

  const startAndAwaitDeckLoaded = useCallback(
    async (
      deckIdx: 0 | 1,
      track: Track,
      initialVolume: number,
      waitForPlaybackStart: boolean,
      startSeconds = 0,
      expectedSessionId?: number
    ) => {
      const deck = decksRef.current?.[deckIdx];
      if (!deck) return;

      ytWaitersRef.current[deckIdx] = null;
      ytErrorWaitersRef.current[deckIdx] = null;
      clearDeckYTTimers(deck);
      clearDeckIntroArtifacts(deck);

      deck.audio.pause();
      if (deck.ytPlayer) {
        try {
          deck.ytPlayer.stopVideo();
        } catch {
          // ignore
        }
      }

      deck.track = track;
      deck.activeAudioSrc = '';
      deck.reportedFullDuration = track.duration || 0;
      deck.currentVolume = Math.max(0, Math.min(1, initialVolume));
      if (expectedSessionId !== undefined) {
        deck.ownerSessionId = expectedSessionId;
      }
      setPlayerError(null);
      setFilterStatusNote(null);

      if (track.source === 'youtube' && track.youtubeId) {
        const videoId = track.youtubeId;
        const introSec = Math.max(5, introCacheSecRef.current);
        const cachedIntro = getCachedIntroSync(track.id, 1);
        const needsFilterOrEq =
          audioFilterRef.current !== 'none' || hasCustomEq(equalizerRef.current);

        // FAST PATH: Play cached intro immediately in 0ms WITHOUT waiting for backend health or YouTube API!
        if (cachedIntro && startSeconds < Math.max(1, cachedIntro.cachedDuration - 1.2)) {
          audioFilterEngine.resume();
          deck.mode = 'audio';
          deck.activeAudioSrc = '';
          if (activeDeckRef.current === deckIdx) {
            setActiveDeckMode('audio');
          }

          const blobUrl = URL.createObjectURL(cachedIntro.blob);
          deck.introBlobUrl = blobUrl;
          deck.usingCachedIntro = true;
          deck.introCachedDuration = cachedIntro.cachedDuration;
          deck.pendingHandoff = false;
          deck.handoffInFlight = false;
          deck.pendingYTFallback = false;

          const introAudio = deck.audio;
          introAudio.removeAttribute('crossorigin');
          introAudio.src = blobUrl;
          introAudio.volume = Math.max(0, Math.min(1, initialVolume));
          introAudio.loop = false;

          if (startSeconds > 0) {
            const applySeek = () => {
              try {
                introAudio.currentTime = startSeconds;
              } catch {
                // ignore
              }
              introAudio.removeEventListener('loadedmetadata', applySeek);
            };
            introAudio.addEventListener('loadedmetadata', applySeek);
          }

          attachAudioElementListeners(deckIdx, introAudio, true);
          routeElementWithFilterIfNeeded(introAudio, blobUrl, true);

          if (expectedSessionId !== undefined && deck.ownerSessionId !== expectedSessionId) {
            return;
          }

          await introAudio.play();

          // Resolve full YouTube audio stream in the background while intro is already playing!
          const sessionAtStart = expectedSessionId ?? deck.ownerSessionId;
          (async () => {
            const resolved = await resolveYouTubeAudioStream(videoId);
            if (
              deck.ownerSessionId !== sessionAtStart ||
              deck.audio !== introAudio ||
              !deck.usingCachedIntro ||
              deck.track?.id !== track.id
            ) {
              return;
            }

            if (resolved && resolved.url) {
              setYtLoginSuggested(false);
              if (resolved.duration && !deck.reportedFullDuration) {
                deck.reportedFullDuration = resolved.duration;
                if (activeDeckRef.current === deckIdx) {
                  setDuration(resolved.duration);
                  durationRef.current = resolved.duration;
                }
              }
              deck.activeAudioSrc = resolved.url;

              const fullAudio = new Audio();
              fullAudio.preload = 'auto';
              fullAudio.crossOrigin = 'anonymous';
              fullAudio.loop = loopModeRef.current === 'track';
              fullAudio.onloadedmetadata = () => {
                if (Number.isFinite(fullAudio.duration) && fullAudio.duration > 0) {
                  deck.reportedFullDuration = fullAudio.duration;
                  if (activeDeckRef.current === deckIdx) {
                    setDuration(fullAudio.duration);
                    durationRef.current = fullAudio.duration;
                  }
                }
              };
              fullAudio.oncanplay = () => {
                if (deck.pendingHandoff) {
                  promoteFullAudioRef.current(deckIdx);
                }
              };
              fullAudio.onerror = () => {
                if (deck.fullAudio === fullAudio) {
                  deck.fullAudio = null;
                  deck.pendingYTFallback = true;
                  if (deck.pendingHandoff) {
                    deck.usingCachedIntro = false;
                    fallbackYouTubeToIframeRef.current(
                      deckIdx,
                      track,
                      deck.introCachedDuration,
                      deck.currentVolume
                    );
                  }
                }
              };
              fullAudio.src = resolved.url;
              fullAudio.load();
              deck.fullAudio = fullAudio;

              if (deck.pendingHandoff) {
                promoteFullAudioRef.current(deckIdx, deck.introCachedDuration);
              }
            } else {
              deck.pendingYTFallback = true;
              if (resolved?.requiresLogin) {
                setYtLoginSuggested(true);
              }
              if (deck.pendingHandoff) {
                deck.usingCachedIntro = false;
                fallbackYouTubeToIframeRef.current(
                  deckIdx,
                  track,
                  deck.introCachedDuration,
                  deck.currentVolume
                );
              }
            }
          })();

          return;
        }

        const hasBackend = await checkBackendAvailable();
        if (expectedSessionId !== undefined && deck.ownerSessionId !== expectedSessionId) {
          return;
        }

        // Always prefer local same-origin audio stream when backend is running OR when any filter/EQ is active,
        // so the local equalizer works instantaneously with 0 reloads!
        if (hasBackend || needsFilterOrEq) {
          audioFilterEngine.resume();
          try {
            deck.audio.removeAttribute('crossorigin');
            deck.audio.src = SILENT_WAV_DATA_URI;
            deck.audio.volume = 0;
            await deck.audio.play();
            deck.audio.pause();
          } catch {
            // ignore
          }
          if (expectedSessionId !== undefined && deck.ownerSessionId !== expectedSessionId) {
            return;
          }

          if (hasBackend) {
            cacheTrackIntro(track, introSec);
          }

          const resolved = await resolveYouTubeAudioStream(videoId);
          if (expectedSessionId !== undefined && deck.ownerSessionId !== expectedSessionId) {
            return;
          }

          if (resolved && resolved.url) {
            setYtLoginSuggested(false);
            if (resolved.duration && !deck.reportedFullDuration) {
              deck.reportedFullDuration = resolved.duration;
              if (activeDeckRef.current === deckIdx) {
                setDuration(resolved.duration);
                durationRef.current = resolved.duration;
              }
            }

            try {
              await playResolvedAudioUrlOnDeck(
                deckIdx,
                track,
                resolved.url,
                initialVolume,
                waitForPlaybackStart,
                startSeconds,
                expectedSessionId,
                true
              );
              return;
            } catch {
              invalidateYouTubeAudioStream(videoId);
              deck.audio.pause();
              deck.audio.removeAttribute('src');
              deck.audio.load();
              deck.activeAudioSrc = '';
              if (needsFilterOrEq) {
                setFilterStatusNote(
                  'YouTube bloqueó el flujo directo en este vídeo (el reproductor estándar solo ajusta volumen).'
                );
              }
            }
          } else {
            if (resolved?.requiresLogin) {
              setYtLoginSuggested(true);
            }
            if (needsFilterOrEq) {
              setFilterStatusNote(
                resolved?.requiresLogin
                  ? 'YouTube pide vincular cuenta en este vídeo para ecualizarlo (puedes seguir escuchándolo en modo estándar).'
                  : 'YouTube bloqueó el flujo directo en este vídeo (el reproductor estándar solo ajusta volumen).'
              );
            }
          }
        }

        await startYouTubeIframeOnDeck(
          deckIdx,
          track,
          initialVolume,
          waitForPlaybackStart,
          startSeconds,
          expectedSessionId
        );
        return;
      }

      if (track.source === 'local' || isLocalMediaUrl(track.url)) {
        const syncUrl = getLocalMediaUrlSync(track.url);
        const playableUrl = syncUrl || (await resolveLocalMediaUrl(track.url));
        if (expectedSessionId !== undefined && deck.ownerSessionId !== expectedSessionId) {
          return;
        }
        await playResolvedAudioUrlOnDeck(
          deckIdx,
          track,
          playableUrl,
          initialVolume,
          waitForPlaybackStart,
          startSeconds,
          expectedSessionId,
          true
        );
        return;
      }

      deck.mode = 'audio';
      deck.activeAudioSrc = track.url;
      if (activeDeckRef.current === deckIdx) {
        setActiveDeckMode('audio');
      }
      const supportsCorsNaturally =
        track.source === 'audius' ||
        track.url.includes('archive.org') ||
        track.url.includes('wikimedia.org');
      const shouldSetCors =
        supportsCorsNaturally ||
        audioFilterRef.current !== 'none' ||
        hasCustomEq(equalizerRef.current);

      // Check if we have a cached X-second intro in IndexedDB/memory for instant 0ms start!
      const introSec = Math.max(5, introCacheSecRef.current);
      const cachedIntro = getCachedIntroSync(track.id, 1);

      if (cachedIntro && startSeconds < Math.max(1, cachedIntro.cachedDuration - 1.2)) {
        const blobUrl = URL.createObjectURL(cachedIntro.blob);
        deck.introBlobUrl = blobUrl;
        deck.usingCachedIntro = true;
        deck.introCachedDuration = cachedIntro.cachedDuration;
        deck.pendingHandoff = false;
        deck.handoffInFlight = false;

        const introAudio = deck.audio;
        introAudio.removeAttribute('crossorigin');
        introAudio.src = blobUrl;
        introAudio.volume = Math.max(0, Math.min(1, initialVolume));
        introAudio.loop = false;

        if (startSeconds > 0) {
          const applySeek = () => {
            try {
              introAudio.currentTime = startSeconds;
            } catch {
              // ignore
            }
            introAudio.removeEventListener('loadedmetadata', applySeek);
          };
          introAudio.addEventListener('loadedmetadata', applySeek);
        }

        attachAudioElementListeners(deckIdx, introAudio, true);
        routeElementWithFilterIfNeeded(introAudio, track.url, supportsCorsNaturally);

        // Simultaneously preload the full remote song in the background
        const fullAudio = new Audio();
        fullAudio.preload = 'auto';
        if (shouldSetCors) {
          fullAudio.crossOrigin = 'anonymous';
        }
        fullAudio.loop = loopModeRef.current === 'track';
        fullAudio.onloadedmetadata = () => {
          if (Number.isFinite(fullAudio.duration) && fullAudio.duration > 0) {
            deck.reportedFullDuration = fullAudio.duration;
            if (activeDeckRef.current === deckIdx) {
              setDuration(fullAudio.duration);
              durationRef.current = fullAudio.duration;
            }
          }
        };
        fullAudio.oncanplay = () => {
          if (deck.pendingHandoff) {
            promoteFullAudioRef.current(deckIdx);
          }
        };
        fullAudio.src = track.url;
        fullAudio.load();
        deck.fullAudio = fullAudio;

        if (expectedSessionId !== undefined && deck.ownerSessionId !== expectedSessionId) {
          return;
        }
        await introAudio.play();
        return;
      }

      // No cached intro yet: play remote stream directly and cache its first X seconds in background
      if (introSec > 0) {
        cacheTrackIntro(track, introSec);
      }

      await playResolvedAudioUrlOnDeck(
        deckIdx,
        track,
        track.url,
        initialVolume,
        waitForPlaybackStart,
        startSeconds,
        expectedSessionId,
        supportsCorsNaturally
      );
    },
    [
      attachAudioElementListeners,
      clearDeckIntroArtifacts,
      clearDeckYTTimers,
      playResolvedAudioUrlOnDeck,
      routeElementWithFilterIfNeeded,
      startYouTubeIframeOnDeck,
    ]
  );

  const playTrack = useCallback(
    async (
      track: Track,
      options?: {
        queue?: Track[];
        queueName?: string;
        skipCrossfade?: boolean;
        startSeconds?: number;
      }
    ) => {
      if (options?.queue) {
        setQueue(options.queue);
        queueRef.current = options.queue;
      }
      if (options?.queueName) {
        setQueueName(options.queueName);
        queueNameRef.current = options.queueName;
      }

      setPendingResumeTime(null);
      const sessionId = ++playSessionIdRef.current;
      const decks = decksRef.current;
      if (!decks) return;

      // Cancel any active fade cleanly, pick the loudest active deck as the single outgoing source,
      // and stop any older background deck immediately so rapid song switches always prioritize the newest track!
      const wasFading = fadeIntervalRef.current !== null;
      cancelCrossfade();
      autoCrossfadedRef.current = false;

      let outgoingIdx: 0 | 1 = activeDeckRef.current;
      if (wasFading || (decks[0].mode !== 'idle' && decks[1].mode !== 'idle')) {
        const vol0 = decks[0].mode !== 'idle' ? decks[0].currentVolume : -1;
        const vol1 = decks[1].mode !== 'idle' ? decks[1].currentVolume : -1;
        outgoingIdx = vol0 >= vol1 ? 0 : 1;
        const staleIdx: 0 | 1 = outgoingIdx === 0 ? 1 : 0;
        if (decks[staleIdx].mode !== 'idle') {
          stopDeck(staleIdx);
        }
        activeDeckRef.current = outgoingIdx;
      }

      const outgoingDeck = decks[outgoingIdx];
      const shouldCrossfade =
        !options?.skipCrossfade &&
        crossfadeSecRef.current > 0 &&
        isPlayingRef.current &&
        outgoingDeck &&
        outgoingDeck.mode !== 'idle' &&
        outgoingDeck.track?.id !== track.id;

      if (shouldCrossfade) {
        const incomingIdx: 0 | 1 = outgoingIdx === 0 ? 1 : 0;
        const fromTitle = outgoingDeck.track?.title;
        // Preserve outgoing deck's current gain so interrupting an active fade never jumps volume back up!
        const initialMasterVol = Math.max(0.01, masterVolumeRef.current);
        const outVolumeRatio = Math.min(
          1,
          Math.max(0.05, outgoingDeck.currentVolume) / initialMasterVol
        );

        // Immediately mark incoming deck ownership for this session so aborted older loads never kill it
        decks[incomingIdx].ownerSessionId = sessionId;

        setCrossfadeStatus({
          active: true,
          phase: 'loading',
          progress: 0,
          durationSec: crossfadeSecRef.current,
          fromTitle,
          toTitle: track.title,
        });

        try {
          await startAndAwaitDeckLoaded(
            incomingIdx,
            track,
            0,
            true,
            options?.startSeconds || 0,
            sessionId
          );
        } catch (err) {
          if (playSessionIdRef.current !== sessionId) {
            if (decks[incomingIdx].ownerSessionId === sessionId) {
              stopDeck(incomingIdx);
            }
            return;
          }
          stopDeck(incomingIdx);
          cancelCrossfade();
          setPlayerError(
            err instanceof Error ? err.message : 'No se pudo cargar la siguiente canción.'
          );
          return;
        }

        if (playSessionIdRef.current !== sessionId) {
          if (decks[incomingIdx].ownerSessionId === sessionId) {
            stopDeck(incomingIdx);
          }
          return;
        }

        activeDeckRef.current = incomingIdx;
        setActiveDeckIndex(incomingIdx);
        setActiveDeckMode(decks[incomingIdx].mode);
        setCurrentTrack(track);
        currentTrackRef.current = track;
        setCurrentTime(options?.startSeconds || 0);
        currentTimeRef.current = options?.startSeconds || 0;
        setDuration(track.duration || 0);
        durationRef.current = track.duration || 0;
        setIsPlaying(true);
        isPlayingRef.current = true;
        setIsBuffering(false);
        saveSnapshot(true);

        const totalMs = crossfadeSecRef.current * 1000;
        const startTime = performance.now();
        setCrossfadeStatus({
          active: true,
          phase: 'fading',
          progress: 0,
          durationSec: crossfadeSecRef.current,
          fromTitle,
          toTitle: track.title,
        });

        fadeIntervalRef.current = window.setInterval(() => {
          if (playSessionIdRef.current !== sessionId) {
            if (fadeIntervalRef.current !== null) {
              window.clearInterval(fadeIntervalRef.current);
              fadeIntervalRef.current = null;
            }
            return;
          }

          const elapsed = performance.now() - startTime;
          const t = Math.min(1, elapsed / totalMs);
          const gainOut = Math.cos(t * Math.PI * 0.5);
          const gainIn = Math.sin(t * Math.PI * 0.5);
          const vol = masterVolumeRef.current;

          setDeckVolume(outgoingIdx, gainOut * outVolumeRatio * vol);
          setDeckVolume(incomingIdx, gainIn * vol);

          setCrossfadeStatus({
            active: t < 1,
            phase: 'fading',
            progress: t,
            durationSec: crossfadeSecRef.current,
            fromTitle,
            toTitle: track.title,
          });

          if (t >= 1) {
            if (fadeIntervalRef.current !== null) {
              window.clearInterval(fadeIntervalRef.current);
              fadeIntervalRef.current = null;
            }
            stopDeck(outgoingIdx);
          }
        }, 50);
      } else {
        const otherIdx: 0 | 1 = outgoingIdx === 0 ? 1 : 0;
        stopDeck(otherIdx);
        decks[outgoingIdx].ownerSessionId = sessionId;
        activeDeckRef.current = outgoingIdx;
        setActiveDeckIndex(outgoingIdx);
        setActiveDeckMode('audio');
        setCurrentTrack(track);
        currentTrackRef.current = track;
        const startAt = options?.startSeconds || 0;
        setCurrentTime(startAt);
        currentTimeRef.current = startAt;
        setDuration(track.duration || 0);
        durationRef.current = track.duration || 0;
        setIsPlaying(true);
        isPlayingRef.current = true;
        setIsBuffering(true);
        saveSnapshot(true);

        try {
          await startAndAwaitDeckLoaded(
            outgoingIdx,
            track,
            masterVolumeRef.current,
            false,
            startAt,
            sessionId
          );
          if (playSessionIdRef.current === sessionId) {
            const deck = decksRef.current?.[outgoingIdx];
            if (deck?.usingCachedIntro) {
              setIsBuffering(false);
            }
          }
        } catch {
          if (playSessionIdRef.current !== sessionId) return;
          setIsPlaying(false);
          isPlayingRef.current = false;
          setIsBuffering(false);
          if (startAt > 0) {
            setPendingResumeTime(startAt);
          } else {
            setPlayerError('Toca reproducir de nuevo para activar el audio en tu navegador.');
          }
        }
      }
    },
    [cancelCrossfade, saveSnapshot, setDeckVolume, startAndAwaitDeckLoaded, stopDeck]
  );

  // Attempt automatic resume if page was refreshed while music was playing
  useEffect(() => {
    if (!initialSnapshot || !initialSnapshot.wasPlaying) return;
    const ageMs = Date.now() - initialSnapshot.savedAt;
    if (ageMs > 30 * 60 * 1000) {
      setPendingResumeTime(null);
      return;
    }
    const timer = window.setTimeout(async () => {
      await hydrateIntroCache();
      playTrack(initialSnapshot.track, {
        queue: initialSnapshot.queue,
        queueName: initialSnapshot.queueName,
        skipCrossfade: true,
        startSeconds: initialSnapshot.currentTime || 0,
      });
    }, 150);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resumePending = useCallback(async () => {
    if (!currentTrackRef.current) return;
    const resumeAt = pendingResumeTimeRef.current ?? currentTimeRef.current ?? 0;
    await playTrack(currentTrackRef.current, {
      skipCrossfade: true,
      startSeconds: resumeAt,
    });
  }, [playTrack]);

  const getNextTrack = useCallback((): Track | null => {
    const q = queueRef.current;
    const curr = currentTrackRef.current;
    if (!q.length) return null;

    if (shuffleRef.current && q.length > 1) {
      const candidates = q.filter((t) => t.id !== curr?.id);
      return candidates[Math.floor(Math.random() * candidates.length)] || q[0];
    }

    const idx = curr ? q.findIndex((t) => t.id === curr.id) : -1;
    if (idx === -1) return q[0];
    if (idx + 1 < q.length) return q[idx + 1];
    if (loopModeRef.current === 'folder') return q[0];
    return null;
  }, []);

  const getPrevTrack = useCallback((): Track | null => {
    const q = queueRef.current;
    const curr = currentTrackRef.current;
    if (!q.length) return null;

    const idx = curr ? q.findIndex((t) => t.id === curr.id) : -1;
    if (idx <= 0) {
      return loopModeRef.current === 'folder' ? q[q.length - 1] : q[0];
    }
    return q[idx - 1];
  }, []);

  const nextTrack = useCallback(async () => {
    const next = getNextTrack();
    if (!next) {
      cancelCrossfade();
      stopDeck(0);
      stopDeck(1);
      setIsPlaying(false);
      isPlayingRef.current = false;
      saveSnapshot(false);
      return;
    }
    await playTrack(next);
  }, [cancelCrossfade, getNextTrack, playTrack, saveSnapshot, stopDeck]);

  const prevTrack = useCallback(async () => {
    const deck = decksRef.current?.[activeDeckRef.current];
    if (deck && deck.mode !== 'idle') {
      const pos =
        deck.mode === 'youtube'
          ? deck.ytPlayer?.getCurrentTime() || 0
          : deck.audio.currentTime || 0;
      if (pos > 4) {
        if (deck.mode === 'youtube') {
          deck.ytPlayer?.seekTo(0, true);
        } else {
          deck.audio.currentTime = 0;
        }
        setCurrentTime(0);
        return;
      }
    }
    const prev = getPrevTrack();
    if (prev) {
      await playTrack(prev);
    }
  }, [getPrevTrack, playTrack]);

  handleTrackEndedRef.current = (deckIdx: 0 | 1) => {
    if (activeDeckRef.current !== deckIdx) return;
    const deck = decksRef.current?.[deckIdx];
    if (!deck) return;

    if (loopModeRef.current === 'track') {
      if (deck.mode === 'youtube' && deck.ytPlayer) {
        deck.ytPlayer.seekTo(0, true);
        deck.ytPlayer.playVideo();
      } else {
        deck.audio.currentTime = 0;
        deck.audio.play().catch(() => {});
      }
      autoCrossfadedRef.current = false;
      return;
    }

    nextTrack();
  };

  const togglePlay = useCallback(async () => {
    const deck = decksRef.current?.[activeDeckRef.current];
    if (!deck || deck.mode === 'idle') {
      if (currentTrackRef.current) {
        await playTrack(currentTrackRef.current, {
          skipCrossfade: true,
          startSeconds: pendingResumeTimeRef.current ?? currentTimeRef.current ?? 0,
        });
        return;
      }
      if (queueRef.current.length > 0) {
        await playTrack(queueRef.current[0], { skipCrossfade: true });
      }
      return;
    }

    if (isPlayingRef.current) {
      if (deck.mode === 'youtube' && deck.ytPlayer) {
        deck.ytPlayer.pauseVideo();
      } else {
        deck.audio.pause();
      }
      isPlayingRef.current = false;
      setIsPlaying(false);
      saveSnapshot(false);
    } else {
      try {
        if (deck.mode === 'youtube' && deck.ytPlayer) {
          deck.ytPlayer.playVideo();
        } else {
          await deck.audio.play();
        }
        isPlayingRef.current = true;
        setIsPlaying(true);
        setPendingResumeTime(null);
        saveSnapshot(true);
      } catch {
        setPlayerError('No se pudo reanudar la reproducción.');
      }
    }
  }, [playTrack, saveSnapshot]);

  const seekTo = useCallback(
    (seconds: number) => {
      const idx = activeDeckRef.current;
      const deck = decksRef.current?.[idx];
      const clamped = Math.max(0, seconds);
      if (!deck || deck.mode === 'idle') {
        setCurrentTime(clamped);
        currentTimeRef.current = clamped;
        if (pendingResumeTimeRef.current !== null) {
          setPendingResumeTime(clamped);
        }
        saveSnapshot();
        return;
      }

      if (deck.mode === 'youtube' && deck.ytPlayer) {
        deck.ytLastStartSeconds = clamped;
        deck.ytPlayer.seekTo(clamped, true);
      } else if (deck.usingCachedIntro && clamped >= Math.max(0, deck.introCachedDuration - 0.8)) {
        // Jumping past cached intro: promote full stream or hand off to YouTube IFrame if needed
        if (deck.pendingYTFallback && deck.track?.source === 'youtube') {
          deck.usingCachedIntro = false;
          fallbackYouTubeToIframeRef.current(idx, deck.track, clamped, deck.currentVolume);
        } else {
          deck.pendingHandoff = true;
          setIsBuffering(true);
          promoteFullAudioRef.current(idx, clamped);
        }
      } else {
        deck.audio.currentTime = clamped;
      }

      setCurrentTime(clamped);
      currentTimeRef.current = clamped;
      autoCrossfadedRef.current = false;
      saveSnapshot();
    },
    [saveSnapshot]
  );

  const skipBy = useCallback(
    (deltaSeconds: number) => {
      const deck = decksRef.current?.[activeDeckRef.current];
      if (!deck || deck.mode === 'idle') return;
      const pos =
        deck.mode === 'youtube'
          ? deck.ytPlayer?.getCurrentTime() || 0
          : deck.audio.currentTime || 0;
      const dur =
        deck.mode === 'youtube'
          ? deck.ytPlayer?.getDuration() || currentTrackRef.current?.duration || 0
          : deck.reportedFullDuration || deck.audio.duration || currentTrackRef.current?.duration || 0;
      const target =
        dur > 0
          ? Math.min(dur - 0.5, Math.max(0, pos + deltaSeconds))
          : Math.max(0, pos + deltaSeconds);
      seekTo(target);
    },
    [seekTo]
  );

  useEffect(() => {
    if (fadeIntervalRef.current === null) {
      setDeckVolume(activeDeckRef.current, masterVolume);
    }
  }, [masterVolume, setDeckVolume]);

  useEffect(() => {
    const deck = decksRef.current?.[activeDeckRef.current];
    if (deck && deck.mode === 'audio' && !deck.usingCachedIntro) {
      deck.audio.loop = loopMode === 'track';
    }
    if (deck && deck.fullAudio) {
      deck.fullAudio.loop = loopMode === 'track';
    }
  }, [loopMode]);

  // Poll progress, handoff cached intro -> full stream seamlessly, save snapshot, and auto-crossfade
  useEffect(() => {
    let tickCount = 0;
    const timer = window.setInterval(() => {
      const idx = activeDeckRef.current;
      const deck = decksRef.current?.[idx];
      if (!deck || deck.mode === 'idle') return;

      let pos = 0;
      let dur = 0;
      if (deck.mode === 'youtube' && deck.ytPlayer) {
        try {
          pos = deck.ytPlayer.getCurrentTime() || 0;
          dur = deck.ytPlayer.getDuration() || deck.track?.duration || 0;
        } catch {
          return;
        }
      } else {
        pos = deck.audio.currentTime || 0;
        if (deck.usingCachedIntro) {
          // Never report introCachedDuration as full track duration, or auto-crossfade could trigger early!
          dur =
            deck.reportedFullDuration ||
            (deck.fullAudio && Number.isFinite(deck.fullAudio.duration)
              ? deck.fullAudio.duration
              : 0) ||
            deck.track?.duration ||
            0;

          // Hand off seamlessly to background-loaded full stream well before cached intro ends
          const handoffThreshold = Math.max(
            1.5,
            Math.min(deck.introCachedDuration - 1.2, deck.introCachedDuration * 0.65)
          );
          if (
            pos >= handoffThreshold &&
            deck.fullAudio &&
            deck.fullAudio.readyState >= 3 &&
            !deck.handoffInFlight
          ) {
            promoteFullAudioRef.current(idx);
          }
        } else {
          dur = Number.isFinite(deck.audio.duration)
            ? deck.audio.duration
            : deck.track?.duration || 0;
        }
      }

      if (Math.abs(pos - currentTimeRef.current) >= 0.25) {
        setCurrentTime(pos);
        currentTimeRef.current = pos;
      }
      if (dur > 0 && Math.abs(dur - durationRef.current) >= 0.5) {
        setDuration(dur);
        durationRef.current = dur;
      }

      tickCount += 1;
      if (tickCount % 20 === 0 && isPlayingRef.current) {
        saveSnapshot(true);
      }

      const cf = crossfadeSecRef.current;
      const triggerLead = cf + 1.5;
      if (
        isPlayingRef.current &&
        !deck.usingCachedIntro &&
        cf > 0 &&
        dur > triggerLead + 3 &&
        pos > 2 &&
        dur - pos <= triggerLead &&
        loopModeRef.current !== 'track' &&
        !autoCrossfadedRef.current
      ) {
        const hasNext = getNextTrack();
        if (hasNext) {
          autoCrossfadedRef.current = true;
          nextTrack();
        }
      }
    }, 250);

    return () => window.clearInterval(timer);
  }, [getNextTrack, nextTrack, saveSnapshot]);

  // Flush snapshot right before page unloads/reloads or hides on Android
  useEffect(() => {
    const onPageHide = () => {
      saveSnapshot();
    };
    const onVisSave = () => {
      if (document.visibilityState === 'hidden') {
        saveSnapshot();
      }
    };
    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('visibilitychange', onVisSave);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('visibilitychange', onVisSave);
    };
  }, [saveSnapshot]);

  useEffect(() => {
    if (!('mediaSession' in navigator) || !currentTrack) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentTrack.title,
        artist: currentTrack.artist,
        album: queueName,
        artwork: currentTrack.artworkUrl
          ? [{ src: currentTrack.artworkUrl, sizes: '256x256', type: 'image/jpeg' }]
          : [{ src: './pwa-192x192.png', sizes: '192x192', type: 'image/png' }],
      });
      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';

      navigator.mediaSession.setActionHandler('play', () => togglePlay());
      navigator.mediaSession.setActionHandler('pause', () => togglePlay());
      navigator.mediaSession.setActionHandler('previoustrack', () => prevTrack());
      navigator.mediaSession.setActionHandler('nexttrack', () => nextTrack());
      navigator.mediaSession.setActionHandler('seekbackward', () => skipBy(-10));
      navigator.mediaSession.setActionHandler('seekforward', () => skipBy(10));
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (typeof details.seekTime === 'number') {
          seekTo(details.seekTime);
        }
      });
    } catch {
      // Ignore
    }
  }, [currentTrack, isPlaying, queueName, togglePlay, prevTrack, nextTrack, skipBy, seekTo]);

  useEffect(() => {
    let cancelled = false;

    const acquire = async () => {
      if (!keepScreenAwake || !('wakeLock' in navigator)) return;
      try {
        const wl = await (
          navigator as unknown as {
            wakeLock: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> };
          }
        ).wakeLock.request('screen');
        if (!cancelled) {
          wakeLockRef.current = wl;
        } else {
          wl.release().catch(() => {});
        }
      } catch {
        // ignore
      }
    };

    if (keepScreenAwake) {
      acquire();
    } else if (wakeLockRef.current) {
      wakeLockRef.current.release().catch(() => {});
      wakeLockRef.current = null;
    }

    const onVis = () => {
      if (document.visibilityState === 'visible' && keepScreenAwake) {
        acquire();
      }
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVis);
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
    };
  }, [keepScreenAwake]);

  useEffect(() => {
    return () => {
      cancelCrossfade();
      stopDeck(0);
      stopDeck(1);
    };
  }, [cancelCrossfade, stopDeck]);

  const switchActiveYoutubeToIframe = useCallback(async () => {
    const idx = activeDeckRef.current;
    const deck = decksRef.current?.[idx];
    if (!deck || deck.track?.source !== 'youtube' || !deck.track.youtubeId) return;
    if (deck.mode === 'youtube') return;

    const pos = deck.audio.currentTime || currentTimeRef.current || 0;
    const vol = deck.currentVolume || masterVolumeRef.current;
    const savedTrack = deck.track;

    clearDeckIntroArtifacts(deck);
    await fallbackYouTubeToIframeRef.current(idx, savedTrack, pos, vol);
  }, [clearDeckIntroArtifacts]);

  return {
    currentTrack,
    queue,
    queueName,
    isPlaying,
    isBuffering,
    currentTime,
    duration,
    playerError,
    filterStatusNote,
    activeDeckIndex,
    activeDeckMode,
    pendingResumeTime,
    resumePending,
    dismissPendingResume: () => setPendingResumeTime(null),
    crossfadeSeconds,
    setCrossfadeSeconds,
    introCacheSeconds,
    setIntroCacheSeconds,
    audioFilter,
    setAudioFilter,
    filterIntensity,
    setFilterIntensity,
    equalizer,
    setEqualizer,
    resetEqualizer,
    ytAuthStatus,
    ytLoginSuggested,
    ytAuthBusy,
    startYtAuth,
    logoutYtAuth,
    switchActiveYoutubeToIframe,
    warmTracks,
    crossfadeStatus,
    masterVolume,
    setMasterVolume,
    loopMode,
    setLoopMode,
    shuffle,
    setShuffle,
    keepScreenAwake,
    setKeepScreenAwake,
    playTrack,
    togglePlay,
    seekTo,
    skipBy,
    nextTrack,
    prevTrack,
  };
}
