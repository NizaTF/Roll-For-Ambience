import { useCallback, useEffect, useRef, useState } from 'react';
import { STARTER_SOUNDBOARD } from '../data/starterLibrary';
import {
  deleteLocalMedia,
  isLocalMediaUrl,
  resolveLocalMediaUrl,
} from '../services/localMedia';
import {
  loadIndexedDBJSON,
  loadLocalStorageJSON,
  savePersistedJSON,
} from '../services/persistence';
import { SoundCategory, SoundPad } from '../types/audio';

const SOUNDBOARD_KEY = 'rfa_dnd_soundboard_v1';
const LEGACY_SOUNDBOARD_KEY = 'bardo_dnd_soundboard_v1';

function loadInitialPads(): SoundPad[] {
  const current = loadLocalStorageJSON<SoundPad[]>(SOUNDBOARD_KEY);
  if (Array.isArray(current) && current.length > 0) return current;
  const legacy = loadLocalStorageJSON<SoundPad[]>(LEGACY_SOUNDBOARD_KEY);
  if (Array.isArray(legacy) && legacy.length > 0) return legacy;
  return STARTER_SOUNDBOARD;
}

export function useSoundboard() {
  const [pads, setPads] = useState<SoundPad[]>(loadInitialPads);
  const [activePadIds, setActivePadIds] = useState<Record<string, boolean>>({});
  const [loadingPadIds, setLoadingPadIds] = useState<Record<string, boolean>>({});
  const [padErrors, setPadErrors] = useState<Record<string, string>>({});
  const hydratedRef = useRef(false);

  const audioMapRef = useRef<Map<string, HTMLAudioElement>>(new Map());

  useEffect(() => {
    const hasLocal = Boolean(loadLocalStorageJSON<SoundPad[]>(SOUNDBOARD_KEY));
    if (!hasLocal) {
      loadIndexedDBJSON<SoundPad[]>(SOUNDBOARD_KEY).then((idbPads) => {
        if (Array.isArray(idbPads) && idbPads.length > 0) {
          setPads(idbPads);
        }
        hydratedRef.current = true;
      });
    } else {
      hydratedRef.current = true;
    }
  }, []);

  useEffect(() => {
    if (!hydratedRef.current) return;
    savePersistedJSON(SOUNDBOARD_KEY, pads);
  }, [pads]);

  useEffect(() => {
    const map = audioMapRef.current;
    return () => {
      map.forEach((audio) => {
        audio.pause();
        audio.src = '';
      });
      map.clear();
    };
  }, []);

  const stopPad = useCallback((padId: string) => {
    const audio = audioMapRef.current.get(padId);
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    setActivePadIds((prev) => {
      if (!prev[padId]) return prev;
      const next = { ...prev };
      delete next[padId];
      return next;
    });
    setLoadingPadIds((prev) => {
      if (!prev[padId]) return prev;
      const next = { ...prev };
      delete next[padId];
      return next;
    });
  }, []);

  const togglePad = useCallback(
    async (pad: SoundPad) => {
      if (activePadIds[pad.id]) {
        stopPad(pad.id);
        return;
      }

      setPadErrors((prev) => {
        if (!prev[pad.id]) return prev;
        const next = { ...prev };
        delete next[pad.id];
        return next;
      });

      let playableUrl = pad.url;
      if (isLocalMediaUrl(pad.url)) {
        setLoadingPadIds((prev) => ({ ...prev, [pad.id]: true }));
        try {
          playableUrl = await resolveLocalMediaUrl(pad.url);
        } catch {
          setLoadingPadIds((prev) => {
            const next = { ...prev };
            delete next[pad.id];
            return next;
          });
          setPadErrors((prev) => ({
            ...prev,
            [pad.id]: 'Archivo local no disponible',
          }));
          return;
        }
      }

      let audio = audioMapRef.current.get(pad.id);
      if (!audio) {
        audio = new Audio();
        audio.preload = 'auto';
        audioMapRef.current.set(pad.id, audio);
      }

      if (audio.src !== playableUrl) {
        audio.src = playableUrl;
      }
      audio.loop = pad.loop;
      audio.volume = Math.max(0, Math.min(1, pad.volume));
      audio.currentTime = 0;

      audio.onended = () => {
        if (!audio?.loop) {
          setActivePadIds((prev) => {
            const next = { ...prev };
            delete next[pad.id];
            return next;
          });
        }
      };

      audio.onerror = () => {
        setLoadingPadIds((prev) => {
          const next = { ...prev };
          delete next[pad.id];
          return next;
        });
        setActivePadIds((prev) => {
          const next = { ...prev };
          delete next[pad.id];
          return next;
        });
        setPadErrors((prev) => ({
          ...prev,
          [pad.id]: 'No se pudo cargar el audio',
        }));
      };

      setLoadingPadIds((prev) => ({ ...prev, [pad.id]: true }));
      try {
        await audio.play();
        setLoadingPadIds((prev) => {
          const next = { ...prev };
          delete next[pad.id];
          return next;
        });
        setActivePadIds((prev) => ({ ...prev, [pad.id]: true }));
      } catch {
        setLoadingPadIds((prev) => {
          const next = { ...prev };
          delete next[pad.id];
          return next;
        });
        setPadErrors((prev) => ({
          ...prev,
          [pad.id]: 'Error al reproducir',
        }));
      }
    },
    [activePadIds, stopPad]
  );

  const togglePadLoop = useCallback((padId: string) => {
    setPads((prev) =>
      prev.map((p) => {
        if (p.id !== padId) return p;
        const nextLoop = !p.loop;
        const audio = audioMapRef.current.get(padId);
        if (audio) {
          audio.loop = nextLoop;
        }
        return { ...p, loop: nextLoop };
      })
    );
  }, []);

  const setPadVolume = useCallback((padId: string, volume: number) => {
    const clamped = Math.max(0, Math.min(1, volume));
    const audio = audioMapRef.current.get(padId);
    if (audio) {
      audio.volume = clamped;
    }
    setPads((prev) => prev.map((p) => (p.id === padId ? { ...p, volume: clamped } : p)));
  }, []);

  const stopAll = useCallback(() => {
    audioMapRef.current.forEach((audio) => {
      audio.pause();
      audio.currentTime = 0;
    });
    setActivePadIds({});
    setLoadingPadIds({});
  }, []);

  const addPad = useCallback(
    (input: {
      name: string;
      url: string;
      category: SoundCategory;
      loop: boolean;
      sourceLabel: string;
    }) => {
      const newPad: SoundPad = {
        id: `sfx-custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: input.name.trim() || 'Efecto personalizado',
        category: input.category,
        url: input.url.trim(),
        loop: input.loop,
        volume: 0.8,
        sourceLabel: input.sourceLabel || 'Internet',
        isCustom: true,
      };
      setPads((prev) => [newPad, ...prev]);
      return newPad;
    },
    []
  );

  const removePad = useCallback(
    (padId: string) => {
      stopPad(padId);
      const audio = audioMapRef.current.get(padId);
      if (audio) {
        audio.src = '';
        audioMapRef.current.delete(padId);
      }
      setPads((prev) => {
        const target = prev.find((p) => p.id === padId);
        const remaining = prev.filter((p) => p.id !== padId);
        if (
          target &&
          isLocalMediaUrl(target.url) &&
          !remaining.some((p) => p.url === target.url)
        ) {
          deleteLocalMedia(target.url);
        }
        return remaining;
      });
    },
    [stopPad]
  );

  const resetStarterPads = useCallback(() => {
    stopAll();
    setPads(STARTER_SOUNDBOARD);
  }, [stopAll]);

  const activeCount = Object.keys(activePadIds).length;

  return {
    pads,
    activePadIds,
    loadingPadIds,
    padErrors,
    activeCount,
    togglePad,
    stopPad,
    togglePadLoop,
    setPadVolume,
    stopAll,
    addPad,
    removePad,
    resetStarterPads,
  };
}
