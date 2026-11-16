import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { STARTER_FOLDERS, STARTER_TRACKS } from '../data/starterLibrary';
import {
  loadIndexedDBJSON,
  loadLocalStorageJSON,
  requestAndroidPersistentStorage,
  savePersistedJSON,
} from '../services/persistence';
import { Folder, FolderIconName, Track } from '../types/audio';

const STORAGE_KEY = 'rfa_dnd_library_v1';
const LEGACY_KEY = 'bardo_dnd_library_v1';

interface LibraryStorage {
  tracks: Record<string, Track>;
  folders: Folder[];
}

interface ExportedPlaylist {
  format: 'rfa-playlist-v1';
  exportedAt: number;
  folder: {
    name: string;
    icon: FolderIconName;
  };
  tracks: Track[];
}

function getStarterLibrary(): LibraryStorage {
  const tracks: Record<string, Track> = {};
  for (const t of STARTER_TRACKS) {
    tracks[t.id] = t;
  }
  return {
    tracks,
    folders: STARTER_FOLDERS,
  };
}

function getInitialLibrary(): LibraryStorage {
  const current = loadLocalStorageJSON<LibraryStorage>(STORAGE_KEY);
  if (current && current.tracks && Array.isArray(current.folders)) {
    return current;
  }
  const legacy = loadLocalStorageJSON<LibraryStorage>(LEGACY_KEY);
  if (legacy && legacy.tracks && Array.isArray(legacy.folders)) {
    return legacy;
  }
  return getStarterLibrary();
}

export function useLibraryStore() {
  const [library, setLibrary] = useState<LibraryStorage>(getInitialLibrary);
  const [selectedFolderId, setSelectedFolderId] = useState<string>(() => {
    const initial = getInitialLibrary();
    return initial.folders[0]?.id || 'all';
  });
  const hydratedRef = useRef(false);

  useEffect(() => {
    requestAndroidPersistentStorage();
    const hasLocal = Boolean(loadLocalStorageJSON<LibraryStorage>(STORAGE_KEY));
    if (!hasLocal) {
      loadIndexedDBJSON<LibraryStorage>(STORAGE_KEY).then((idbData) => {
        if (idbData && idbData.tracks && Array.isArray(idbData.folders)) {
          setLibrary(idbData);
          if (idbData.folders[0]) {
            setSelectedFolderId(idbData.folders[0].id);
          }
        }
        hydratedRef.current = true;
      });
    } else {
      hydratedRef.current = true;
    }
  }, []);

  useEffect(() => {
    if (!hydratedRef.current) return;
    savePersistedJSON(STORAGE_KEY, library);
  }, [library]);

  const allTracks = useMemo(() => {
    return Object.values(library.tracks).sort((a, b) => b.addedAt - a.addedAt);
  }, [library.tracks]);

  const activeFolder = useMemo(() => {
    if (selectedFolderId === 'all') return null;
    return library.folders.find((f) => f.id === selectedFolderId) || null;
  }, [library.folders, selectedFolderId]);

  const getFolderTracks = useCallback(
    (folderId: string): Track[] => {
      if (folderId === 'all') return allTracks;
      const folder = library.folders.find((f) => f.id === folderId);
      if (!folder) return [];
      return folder.trackIds
        .map((id) => library.tracks[id])
        .filter((t): t is Track => Boolean(t));
    },
    [allTracks, library.folders, library.tracks]
  );

  const createFolder = useCallback((name: string, icon: FolderIconName = 'music') => {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const newFolder: Folder = {
      id: `folder-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: trimmed,
      icon,
      trackIds: [],
      createdAt: Date.now(),
    };
    setLibrary((prev) => ({
      ...prev,
      folders: [...prev.folders, newFolder],
    }));
    setSelectedFolderId(newFolder.id);
    return newFolder;
  }, []);

  const updateFolder = useCallback(
    (folderId: string, updates: { name?: string; icon?: FolderIconName }) => {
      setLibrary((prev) => ({
        ...prev,
        folders: prev.folders.map((f) => {
          if (f.id !== folderId) return f;
          const nextName =
            typeof updates.name === 'string' && updates.name.trim()
              ? updates.name.trim()
              : f.name;
          const nextIcon = updates.icon || f.icon;
          return { ...f, name: nextName, icon: nextIcon };
        }),
      }));
    },
    []
  );

  const renameFolder = useCallback(
    (folderId: string, newName: string) => {
      updateFolder(folderId, { name: newName });
    },
    [updateFolder]
  );

  const deleteFolder = useCallback((folderId: string) => {
    setLibrary((prev) => ({
      ...prev,
      folders: prev.folders.filter((f) => f.id !== folderId),
    }));
    setSelectedFolderId((curr) => (curr === folderId ? 'all' : curr));
  }, []);

  const saveTrack = useCallback((track: Track) => {
    setLibrary((prev) => ({
      ...prev,
      tracks: {
        ...prev.tracks,
        [track.id]: prev.tracks[track.id] || track,
      },
    }));
  }, []);

  const addTrackToFolder = useCallback((track: Track, folderId: string) => {
    setLibrary((prev) => {
      const nextTracks = { ...prev.tracks, [track.id]: track };
      if (folderId === 'all') {
        return { tracks: nextTracks, folders: prev.folders };
      }
      const nextFolders = prev.folders.map((f) => {
        if (f.id !== folderId) return f;
        if (f.trackIds.includes(track.id)) return f;
        return { ...f, trackIds: [...f.trackIds, track.id] };
      });
      return {
        tracks: nextTracks,
        folders: nextFolders,
      };
    });
  }, []);

  const addTrackToFolders = useCallback((track: Track, folderIds: string[]) => {
    const idSet = new Set(folderIds.filter((id) => id && id !== 'all'));
    setLibrary((prev) => {
      const nextTracks = { ...prev.tracks, [track.id]: track };
      const nextFolders = prev.folders.map((f) => {
        if (!idSet.has(f.id)) return f;
        if (f.trackIds.includes(track.id)) return f;
        return { ...f, trackIds: [...f.trackIds, track.id] };
      });
      return {
        tracks: nextTracks,
        folders: nextFolders,
      };
    });
  }, []);

  const setTrackFolders = useCallback((track: Track, folderIds: string[]) => {
    const idSet = new Set(folderIds);
    setLibrary((prev) => {
      const nextTracks = { ...prev.tracks, [track.id]: track };
      const nextFolders = prev.folders.map((f) => {
        const shouldHave = idSet.has(f.id);
        const currentlyHas = f.trackIds.includes(track.id);
        if (shouldHave && !currentlyHas) {
          return { ...f, trackIds: [...f.trackIds, track.id] };
        }
        if (!shouldHave && currentlyHas) {
          return { ...f, trackIds: f.trackIds.filter((id) => id !== track.id) };
        }
        return f;
      });
      return { tracks: nextTracks, folders: nextFolders };
    });
  }, []);

  const removeTrackFromFolder = useCallback((trackId: string, folderId: string) => {
    setLibrary((prev) => {
      if (folderId === 'all') {
        const nextTracks = { ...prev.tracks };
        delete nextTracks[trackId];
        return {
          tracks: nextTracks,
          folders: prev.folders.map((f) => ({
            ...f,
            trackIds: f.trackIds.filter((id) => id !== trackId),
          })),
        };
      }
      return {
        ...prev,
        folders: prev.folders.map((f) =>
          f.id === folderId
            ? { ...f, trackIds: f.trackIds.filter((id) => id !== trackId) }
            : f
        ),
      };
    });
  }, []);

  const moveTrackInFolder = useCallback(
    (folderId: string, trackId: string, direction: 'up' | 'down') => {
      setLibrary((prev) => ({
        ...prev,
        folders: prev.folders.map((f) => {
          if (f.id !== folderId) return f;
          const idx = f.trackIds.indexOf(trackId);
          if (idx === -1) return f;
          const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
          if (targetIdx < 0 || targetIdx >= f.trackIds.length) return f;
          const copy = [...f.trackIds];
          const [item] = copy.splice(idx, 1);
          copy.splice(targetIdx, 0, item);
          return { ...f, trackIds: copy };
        }),
      }));
    },
    []
  );

  const getFoldersContainingTrack = useCallback(
    (trackId: string): string[] => {
      return library.folders.filter((f) => f.trackIds.includes(trackId)).map((f) => f.id);
    },
    [library.folders]
  );

  const isTrackSaved = useCallback(
    (trackId: string): boolean => {
      return Boolean(library.tracks[trackId]);
    },
    [library.tracks]
  );

  const exportPlaylist = useCallback(
    (folderId: string): string => {
      const folder = library.folders.find((f) => f.id === folderId);
      const tracks = getFolderTracks(folderId);
      const payload: ExportedPlaylist = {
        format: 'rfa-playlist-v1',
        exportedAt: Date.now(),
        folder: {
          name: folder ? folder.name : 'Todas las canciones',
          icon: folder ? folder.icon : 'music',
        },
        tracks,
      };
      return JSON.stringify(payload, null, 2);
    },
    [getFolderTracks, library.folders]
  );

  const exportBackup = useCallback((): string => {
    return JSON.stringify(library, null, 2);
  }, [library]);

  const importListOrBackup = useCallback(
    (jsonText: string): { ok: boolean; message: string } => {
      try {
        const parsed = JSON.parse(jsonText) as Record<string, unknown>;
        if (!parsed || typeof parsed !== 'object') {
          return { ok: false, message: 'Archivo JSON no válido' };
        }

        // Case 1: Single exported playlist
        if (
          parsed.format === 'rfa-playlist-v1' &&
          parsed.folder &&
          Array.isArray(parsed.tracks)
        ) {
          const folderMeta = parsed.folder as { name?: string; icon?: FolderIconName };
          const incomingTracks = parsed.tracks as Track[];
          const validTracks = incomingTracks.filter(
            (t) => t && typeof t.id === 'string' && typeof t.title === 'string' && typeof t.url === 'string'
          );

          const newFolderId = `folder-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          const newFolder: Folder = {
            id: newFolderId,
            name: (folderMeta.name || 'Lista importada').trim(),
            icon: folderMeta.icon || 'music',
            trackIds: validTracks.map((t) => t.id),
            createdAt: Date.now(),
          };

          setLibrary((prev) => {
            const mergedTracks = { ...prev.tracks };
            for (const t of validTracks) {
              mergedTracks[t.id] = t;
            }
            return {
              tracks: mergedTracks,
              folders: [...prev.folders, newFolder],
            };
          });
          setSelectedFolderId(newFolderId);
          return {
            ok: true,
            message: `Lista "${newFolder.name}" importada (${validTracks.length} pistas)`,
          };
        }

        // Case 2: Full library backup
        if (parsed.tracks && typeof parsed.tracks === 'object' && Array.isArray(parsed.folders)) {
          const full = parsed as unknown as LibraryStorage;
          setLibrary(full);
          if (full.folders[0]) {
            setSelectedFolderId(full.folders[0].id);
          }
          return {
            ok: true,
            message: `Biblioteca completa restaurada (${full.folders.length} carpetas)`,
          };
        }

        return { ok: false, message: 'Formato de lista no reconocido' };
      } catch {
        return { ok: false, message: 'No se pudo leer el archivo JSON' };
      }
    },
    []
  );

  const importBackup = useCallback(
    (jsonText: string): boolean => {
      return importListOrBackup(jsonText).ok;
    },
    [importListOrBackup]
  );

  const resetToStarter = useCallback(() => {
    const starter = getStarterLibrary();
    setLibrary(starter);
    setSelectedFolderId(STARTER_FOLDERS[0].id);
  }, []);

  return {
    folders: library.folders,
    tracksById: library.tracks,
    allTracks,
    selectedFolderId,
    setSelectedFolderId,
    activeFolder,
    getFolderTracks,
    createFolder,
    updateFolder,
    renameFolder,
    deleteFolder,
    saveTrack,
    addTrackToFolder,
    addTrackToFolders,
    setTrackFolders,
    removeTrackFromFolder,
    moveTrackInFolder,
    getFoldersContainingTrack,
    isTrackSaved,
    exportPlaylist,
    exportBackup,
    importListOrBackup,
    importBackup,
    resetToStarter,
  };
}
