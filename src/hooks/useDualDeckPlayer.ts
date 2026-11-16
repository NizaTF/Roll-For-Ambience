import { useCallback, useEffect, useRef, useState } from 'react';
import { CrossfadeStatus, LoopMode, Track } from '../types/audio';

interface YTPlayer {
  loadVideoById: (videoId: string, startSeconds?: number) => void;
  cueVideoById: (videoId: string) => void;
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

interface DeckInstance {
  audio: HTMLAudioElement;
  ytPlayer: YTPlayer | null;
  mode: DeckMode;
  track: Track | null;
}

const PREFS_KEY = 'bardo_dnd_player_prefs_v1';

interface PlayerPrefs {
  crossfadeSeconds: number;
  masterVolume: number;
  loopMode: LoopMode;
  shuffle: boolean;
}

function loadPrefs(): PlayerPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        crossfadeSeconds:
          typeof parsed.crossfadeSeconds === 'number' ? parsed.crossfadeSeconds : 4,
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
    masterVolume: 0.85,
    loopMode: 'folder',
    shuffle: false,
  };
}

let ytApiPromise: Promise<void> | null = null;

function loadYouTubeIframeAPI(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.YT && window.YT.Player) return Promise.resolve();
  if (ytApiPromise) return ytApiPromise;

  ytApiPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector('script[src="https://www.youtube.com/iframe_api"]');
    const prevCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (prevCallback) prevCallback();
      resolve();
    };
    if (!existing) {
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      script.onerror = () => reject(new Error('No se pudo cargar YouTube API'));
      document.head.appendChild(script);
    }
    setTimeout(() => {
      if (window.YT && window.YT.Player) resolve();
    }, 4000);
  });

  return ytApiPromise;
}

export function useDualDeckPlayer() {
  const initialPrefs = useRef(loadPrefs()).current;

  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [queue, setQueue] = useState<Track[]>([]);
  const [queueName, setQueueName] = useState<string>('Biblioteca');
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [activeDeckIndex, setActiveDeckIndex] = useState<0 | 1>(0);

  const [crossfadeSeconds, setCrossfadeSeconds] = useState<number>(initialPrefs.crossfadeSeconds);
  const [masterVolume, setMasterVolume] = useState<number>(initialPrefs.masterVolume);
  const [loopMode, setLoopMode] = useState<LoopMode>(initialPrefs.loopMode);
  const [shuffle, setShuffle] = useState<boolean>(initialPrefs.shuffle);
  const [keepScreenAwake, setKeepScreenAwake] = useState<boolean>(false);

  const [crossfadeStatus, setCrossfadeStatus] = useState<CrossfadeStatus>({
    active: false,
    progress: 0,
    durationSec: initialPrefs.crossfadeSeconds,
  });

  // Persist preferences
  useEffect(() => {
    try {
      localStorage.setItem(
        PREFS_KEY,
        JSON.stringify({
          crossfadeSeconds,
          masterVolume,
          loopMode,
          shuffle,
        })
      );
    } catch {
      // ignore
    }
  }, [crossfadeSeconds, masterVolume, loopMode, shuffle]);

  const decksRef = useRef<[DeckInstance, DeckInstance] | null>(null);
  if (!decksRef.current && typeof Audio !== 'undefined') {
    const a0 = new Audio();
    a0.preload = 'auto';
    const a1 = new Audio();
    a1.preload = 'auto';
    decksRef.current = [
      { audio: a0, ytPlayer: null, mode: 'idle', track: null },
      { audio: a1, ytPlayer: null, mode: 'idle', track: null },
    ];
  }

  const activeDeckRef = useRef<0 | 1>(0);
  const isPlayingRef = useRef(false);
  const masterVolumeRef = useRef(masterVolume);
  const crossfadeSecRef = useRef(crossfadeSeconds);
  const loopModeRef = useRef(loopMode);
  const shuffleRef = useRef(shuffle);
  const queueRef = useRef<Track[]>(queue);
  const currentTrackRef = useRef<Track | null>(currentTrack);
  const fadeIntervalRef = useRef<number | null>(null);
  const autoCrossfadedRef = useRef(false);
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);

  masterVolumeRef.current = masterVolume;
  crossfadeSecRef.current = crossfadeSeconds;
  loopModeRef.current = loopMode;
  shuffleRef.current = shuffle;
  queueRef.current = queue;
  currentTrackRef.current = currentTrack;

  const setDeckVolume = useCallback((deckIdx: 0 | 1, linearVol: number) => {
    const deck = decksRef.current?.[deckIdx];
    if (!deck) return;
    const clamped = Math.max(0, Math.min(1, linearVol));
    deck.audio.volume = clamped;
    if (deck.ytPlayer) {
      try {
        deck.ytPlayer.setVolume(Math.round(clamped * 100));
      } catch {
        // ignore if player not ready
      }
    }
  }, []);

  const stopDeck = useCallback((deckIdx: 0 | 1) => {
    const deck = decksRef.current?.[deckIdx];
    if (!deck) return;
    deck.audio.pause();
    deck.audio.removeAttribute('src');
    deck.audio.load();
    if (deck.ytPlayer) {
      try {
        deck.ytPlayer.stopVideo();
      } catch {
        // ignore
      }
    }
    deck.mode = 'idle';
    deck.track = null;
  }, []);

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

  // Forward ref for ended handler
  const handleTrackEndedRef = useRef<(deckIdx: 0 | 1) => void>(() => {});

  const ensureYouTubePlayers = useCallback(async () => {
    const decks = decksRef.current;
    if (!decks) return;
    if (decks[0].ytPlayer && decks[1].ytPlayer) return;

    await loadYouTubeIframeAPI();
    if (!window.YT || !window.YT.Player) {
      throw new Error('La API de YouTube no está disponible');
    }

    const createForDeck = (idx: 0 | 1) =>
      new Promise<void>((resolve) => {
        const elId = `yt-deck-${idx}`;
        const el = document.getElementById(elId);
        if (!el || decks[idx].ytPlayer) {
          resolve();
          return;
        }
        let resolved = false;
        const done = () => {
          if (!resolved) {
            resolved = true;
            resolve();
          }
        };
        const player = new window.YT!.Player(elId, {
          height: '100%',
          width: '100%',
          playerVars: {
            autoplay: 0,
            controls: 1,
            playsinline: 1,
            rel: 0,
            modestbranding: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: () => {
              decks[idx].ytPlayer = player;
              done();
            },
            onStateChange: (event) => {
              if (activeDeckRef.current !== idx) return;
              const YTState = window.YT?.PlayerState;
              if (!YTState) return;
              if (event.data === YTState.PLAYING) {
                isPlayingRef.current = true;
                setIsPlaying(true);
                setIsBuffering(false);
                setPlayerError(null);
              } else if (event.data === YTState.PAUSED) {
                isPlayingRef.current = false;
                setIsPlaying(false);
                setIsBuffering(false);
              } else if (event.data === YTState.BUFFERING) {
                setIsBuffering(true);
              } else if (event.data === YTState.ENDED) {
                handleTrackEndedRef.current(idx);
              }
            },
            onError: () => {
              if (activeDeckRef.current === idx) {
                setIsBuffering(false);
                setPlayerError(
                  'Este vídeo de YouTube bloquea la reproducción externa o no está disponible.'
                );
              }
            },
          },
        });
        setTimeout(done, 3500);
      });

    await Promise.all([createForDeck(0), createForDeck(1)]);
  }, []);

  // Pre-warm YouTube API silently if online
  useEffect(() => {
    if (navigator.onLine) {
      loadYouTubeIframeAPI().catch(() => {});
    }
  }, []);

  const startTrackOnDeck = useCallback(
    async (deckIdx: 0 | 1, track: Track, initialVolume: number) => {
      const deck = decksRef.current?.[deckIdx];
      if (!deck) return;

      // Clear previous state on this deck
      deck.audio.pause();
      if (deck.ytPlayer) {
        try {
          deck.ytPlayer.stopVideo();
        } catch {
          // ignore
        }
      }

      deck.track = track;
      setPlayerError(null);

      if (track.source === 'youtube' && track.youtubeId) {
        deck.mode = 'youtube';
        setIsBuffering(true);
        await ensureYouTubePlayers();
        const yt = decksRef.current?.[deckIdx]?.ytPlayer;
        if (!yt) {
          throw new Error('No se pudo inicializar el reproductor de YouTube');
        }
        yt.setVolume(Math.round(Math.max(0, Math.min(1, initialVolume)) * 100));
        yt.loadVideoById(track.youtubeId, 0);
        yt.playVideo();
        return;
      }

      deck.mode = 'audio';
      const audio = deck.audio;
      audio.src = track.url;
      audio.volume = Math.max(0, Math.min(1, initialVolume));
      audio.loop = loopModeRef.current === 'track';

      audio.onwaiting = () => {
        if (activeDeckRef.current === deckIdx) setIsBuffering(true);
      };
      audio.onplaying = () => {
        if (activeDeckRef.current === deckIdx) {
          setIsBuffering(false);
          setIsPlaying(true);
          isPlayingRef.current = true;
          setPlayerError(null);
        }
      };
      audio.oncanplay = () => {
        if (activeDeckRef.current === deckIdx) setIsBuffering(false);
      };
      audio.onended = () => {
        if (activeDeckRef.current === deckIdx) {
          handleTrackEndedRef.current(deckIdx);
        }
      };
      audio.onerror = () => {
        if (activeDeckRef.current === deckIdx) {
          setIsBuffering(false);
          setIsPlaying(false);
          isPlayingRef.current = false;
          setPlayerError('No se pudo reproducir este enlace de audio.');
        }
      };

      setIsBuffering(true);
      await audio.play();
      setIsBuffering(false);
    },
    [ensureYouTubePlayers]
  );

  const playTrack = useCallback(
    async (
      track: Track,
      options?: { queue?: Track[]; queueName?: string; skipCrossfade?: boolean }
    ) => {
      if (options?.queue) {
        setQueue(options.queue);
        queueRef.current = options.queue;
      }
      if (options?.queueName) {
        setQueueName(options.queueName);
      }

      const outgoingIdx = activeDeckRef.current;
      const outgoingDeck = decksRef.current?.[outgoingIdx];
      const shouldCrossfade =
        !options?.skipCrossfade &&
        crossfadeSecRef.current > 0 &&
        isPlayingRef.current &&
        outgoingDeck &&
        outgoingDeck.mode !== 'idle' &&
        outgoingDeck.track?.id !== track.id;

      cancelCrossfade();
      autoCrossfadedRef.current = false;

      if (shouldCrossfade) {
        const incomingIdx: 0 | 1 = outgoingIdx === 0 ? 1 : 0;
        const fromTitle = outgoingDeck.track?.title;
        activeDeckRef.current = incomingIdx;
        setActiveDeckIndex(incomingIdx);
        setCurrentTrack(track);
        setCurrentTime(0);
        setDuration(track.duration || 0);
        setIsPlaying(true);
        isPlayingRef.current = true;

        try {
          await startTrackOnDeck(incomingIdx, track, 0);
        } catch {
          setPlayerError('Error al iniciar la siguiente canción.');
          setIsBuffering(false);
          return;
        }

        const totalMs = crossfadeSecRef.current * 1000;
        const startTime = performance.now();
        setCrossfadeStatus({
          active: true,
          progress: 0,
          durationSec: crossfadeSecRef.current,
          fromTitle,
          toTitle: track.title,
        });

        fadeIntervalRef.current = window.setInterval(() => {
          const elapsed = performance.now() - startTime;
          const t = Math.min(1, elapsed / totalMs);
          const gainOut = Math.cos(t * Math.PI * 0.5);
          const gainIn = Math.sin(t * Math.PI * 0.5);
          const vol = masterVolumeRef.current;

          setDeckVolume(outgoingIdx, gainOut * vol);
          setDeckVolume(incomingIdx, gainIn * vol);

          setCrossfadeStatus({
            active: t < 1,
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
        activeDeckRef.current = outgoingIdx;
        setActiveDeckIndex(outgoingIdx);
        setCurrentTrack(track);
        setCurrentTime(0);
        setDuration(track.duration || 0);
        setIsPlaying(true);
        isPlayingRef.current = true;

        try {
          await startTrackOnDeck(outgoingIdx, track, masterVolumeRef.current);
        } catch {
          setIsPlaying(false);
          isPlayingRef.current = false;
          setIsBuffering(false);
          setPlayerError('Toca reproducir de nuevo para activar el audio en tu navegador.');
        }
      }
    },
    [cancelCrossfade, setDeckVolume, startTrackOnDeck, stopDeck]
  );

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
      return;
    }
    await playTrack(next);
  }, [cancelCrossfade, getNextTrack, playTrack, stopDeck]);

  const prevTrack = useCallback(async () => {
    const deck = decksRef.current?.[activeDeckRef.current];
    if (deck) {
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

  // Wire ended handler
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
    } else {
      try {
        if (deck.mode === 'youtube' && deck.ytPlayer) {
          deck.ytPlayer.playVideo();
        } else {
          await deck.audio.play();
        }
        isPlayingRef.current = true;
        setIsPlaying(true);
      } catch {
        setPlayerError('No se pudo reanudar la reproducción.');
      }
    }
  }, [playTrack]);

  const seekTo = useCallback((seconds: number) => {
    const deck = decksRef.current?.[activeDeckRef.current];
    if (!deck || deck.mode === 'idle') return;
    const clamped = Math.max(0, seconds);
    if (deck.mode === 'youtube' && deck.ytPlayer) {
      deck.ytPlayer.seekTo(clamped, true);
    } else {
      deck.audio.currentTime = clamped;
    }
    setCurrentTime(clamped);
    autoCrossfadedRef.current = false;
  }, []);

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
          : deck.audio.duration || currentTrackRef.current?.duration || 0;
      const target = dur > 0 ? Math.min(dur - 0.5, Math.max(0, pos + deltaSeconds)) : Math.max(0, pos + deltaSeconds);
      seekTo(target);
    },
    [seekTo]
  );

  // Sync master volume immediately when slider changes (outside active fade)
  useEffect(() => {
    if (fadeIntervalRef.current === null) {
      setDeckVolume(activeDeckRef.current, masterVolume);
    }
  }, [masterVolume, setDeckVolume]);

  // Sync loopMode for HTML5 audio
  useEffect(() => {
    const deck = decksRef.current?.[activeDeckRef.current];
    if (deck && deck.mode === 'audio') {
      deck.audio.loop = loopMode === 'track';
    }
  }, [loopMode]);

  // Poll progress & trigger auto-crossfade near track end
  useEffect(() => {
    const timer = window.setInterval(() => {
      const deck = decksRef.current?.[activeDeckRef.current];
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
        dur = Number.isFinite(deck.audio.duration)
          ? deck.audio.duration
          : deck.track?.duration || 0;
      }

      setCurrentTime(pos);
      if (dur > 0) setDuration(dur);

      const cf = crossfadeSecRef.current;
      if (
        isPlayingRef.current &&
        cf > 0 &&
        dur > cf + 3 &&
        pos > 2 &&
        dur - pos <= cf &&
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
  }, [getNextTrack, nextTrack]);

  // Android Media Session API integration
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
      // Ignore unsupported MediaSession handlers
    }
  }, [currentTrack, isPlaying, queueName, togglePlay, prevTrack, nextTrack, skipBy, seekTo]);

  // Wake lock for Android tabletop sessions
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
        // WakeLock not supported or denied
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelCrossfade();
      stopDeck(0);
      stopDeck(1);
    };
  }, [cancelCrossfade, stopDeck]);

  return {
    currentTrack,
    queue,
    queueName,
    isPlaying,
    isBuffering,
    currentTime,
    duration,
    playerError,
    activeDeckIndex,
    crossfadeSeconds,
    setCrossfadeSeconds,
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
