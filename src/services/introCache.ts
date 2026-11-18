import { Track } from '../types/audio';
import { checkBackendAvailable } from './freeMusicApi';
import { getLocalMediaUrlSync, isLocalMediaUrl, resolveLocalMediaUrl } from './localMedia';

const CACHE_DB_NAME = 'rfa_intro_audio_cache_v1';
const CACHE_STORE = 'intros';
const MAX_CACHED_TRACKS = 500;
const FAILED_RETRY_COOLDOWN_MS = 45_000;

export interface CachedIntroEntry {
  trackId: string;
  url: string;
  introSeconds: number;
  cachedDuration: number;
  blob: Blob;
  cachedAt: number;
}

const memoryCache = new Map<string, CachedIntroEntry>();
const inFlightCache = new Map<string, Promise<CachedIntroEntry | null>>();
const failedAttempts = new Map<string, number>();
const listeners = new Set<() => void>();

let dbPromise: Promise<IDBDatabase | null> | null = null;
let hydratePromise: Promise<void> | null = null;
let activeWarmVersion = 0;

function notifyListeners(): void {
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      // ignore listener errors
    }
  }
}

export function subscribeIntroCache(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function openCacheDB(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(CACHE_DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(CACHE_STORE)) {
          db.createObjectStore(CACHE_STORE, { keyPath: 'trackId' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });

  return dbPromise;
}

export async function hydrateIntroCache(): Promise<void> {
  if (hydratePromise) return hydratePromise;

  hydratePromise = (async () => {
    try {
      const db = await openCacheDB();
      if (!db) return;

      await new Promise<void>((resolve) => {
        const tx = db.transaction(CACHE_STORE, 'readonly');
        const req = tx.objectStore(CACHE_STORE).getAll();
        req.onsuccess = () => {
          const items = Array.isArray(req.result) ? (req.result as CachedIntroEntry[]) : [];
          let added = 0;
          for (const item of items) {
            if (item && item.trackId && item.blob instanceof Blob && item.cachedDuration >= 0.8) {
              if (!memoryCache.has(item.trackId)) {
                memoryCache.set(item.trackId, item);
                added += 1;
              }
            }
          }
          if (added > 0) {
            notifyListeners();
          }
          resolve();
        };
        req.onerror = () => resolve();
      });
    } catch {
      // ignore IDB read failures
    }
  })();

  return hydratePromise;
}

export function getCachedIntroSync(trackId: string, minSeconds = 1): CachedIntroEntry | null {
  const entry = memoryCache.get(trackId);
  if (!entry) return null;
  if (entry.cachedDuration < Math.min(1.5, minSeconds)) return null;
  return entry;
}

export function isTrackInstantReadySync(track: Track, targetSeconds: number): boolean {
  if (track.source === 'local' || isLocalMediaUrl(track.url)) {
    return Boolean(getLocalMediaUrlSync(track.url));
  }
  const entry = memoryCache.get(track.id);
  if (!entry || entry.url !== track.url) return false;
  const requiredDur =
    track.duration && track.duration > 0
      ? Math.min(track.duration * 0.75, targetSeconds * 0.65, 3)
      : Math.min(targetSeconds * 0.65, 3);
  return entry.cachedDuration >= Math.max(0.8, requiredDur);
}

export function countInstantReadyTracks(tracks: Track[], targetSeconds: number): {
  ready: number;
  total: number;
  warming: boolean;
} {
  let ready = 0;
  for (const t of tracks) {
    if (isTrackInstantReadySync(t, targetSeconds)) {
      ready += 1;
    }
  }
  return {
    ready,
    total: tracks.length,
    warming: inFlightCache.size > 0,
  };
}

export function clearIntroFailureCooldowns(): void {
  failedAttempts.clear();
}

export async function deleteCachedIntro(trackId: string): Promise<void> {
  memoryCache.delete(trackId);
  failedAttempts.delete(trackId);
  notifyListeners();

  try {
    const db = await openCacheDB();
    if (!db) return;
    await new Promise<void>((resolve) => {
      const tx = db.transaction(CACHE_STORE, 'readwrite');
      tx.objectStore(CACHE_STORE).delete(trackId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // ignore
  }
}

async function saveCacheEntry(entry: CachedIntroEntry): Promise<void> {
  memoryCache.set(entry.trackId, entry);
  failedAttempts.delete(entry.trackId);

  // Trim memory LRU if over limit
  if (memoryCache.size > MAX_CACHED_TRACKS) {
    const oldest = Array.from(memoryCache.values()).sort((a, b) => a.cachedAt - b.cachedAt);
    const excess = oldest.slice(0, memoryCache.size - MAX_CACHED_TRACKS);
    for (const item of excess) {
      memoryCache.delete(item.trackId);
    }
  }

  notifyListeners();

  try {
    const db = await openCacheDB();
    if (!db) return;

    await new Promise<void>((resolve) => {
      const tx = db.transaction(CACHE_STORE, 'readwrite');
      const store = tx.objectStore(CACHE_STORE);
      store.put(entry);

      // Prune oldest records in IDB if needed
      const allKeysReq = store.getAll();
      allKeysReq.onsuccess = () => {
        const all = Array.isArray(allKeysReq.result)
          ? (allKeysReq.result as CachedIntroEntry[])
          : [];
        if (all.length > MAX_CACHED_TRACKS) {
          all.sort((a, b) => a.cachedAt - b.cachedAt);
          for (const old of all.slice(0, all.length - MAX_CACHED_TRACKS)) {
            store.delete(old.trackId);
          }
        }
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // ignore quota/IDB errors
  }
}

function guessAudioMime(url: string, headerType: string | null): string {
  const cleanHeader = (headerType || '').split(';')[0].trim().toLowerCase();
  if (cleanHeader.startsWith('audio/')) return cleanHeader;
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.includes('.ogg') || lowerUrl.includes('.oga')) return 'audio/ogg';
  if (lowerUrl.includes('.wav')) return 'audio/wav';
  if (lowerUrl.includes('.m4a') || lowerUrl.includes('.aac')) return 'audio/mp4';
  return 'audio/mpeg';
}

function probeBlobAudioDuration(blob: Blob): Promise<number> {
  if (typeof Audio === 'undefined') return Promise.resolve(0);

  return new Promise((resolve) => {
    const blobUrl = URL.createObjectURL(blob);
    const probe = new Audio();
    probe.preload = 'metadata';

    let done = false;
    const finish = (dur: number) => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      probe.removeAttribute('src');
      URL.revokeObjectURL(blobUrl);
      resolve(Number.isFinite(dur) && dur > 0 ? dur : 0);
    };

    const timer = window.setTimeout(() => finish(0), 2500);
    probe.onloadedmetadata = () => finish(probe.duration);
    probe.onerror = () => finish(0);
    probe.src = blobUrl;
  });
}

function isIntroEntrySufficient(
  entry: CachedIntroEntry | undefined,
  track: Track,
  introSeconds: number
): boolean {
  if (!entry || entry.url !== track.url) return false;
  if (entry.introSeconds >= introSeconds) {
    const minDur =
      track.duration && track.duration > 0
        ? Math.min(track.duration * 0.75, introSeconds * 0.7, 3)
        : Math.min(introSeconds * 0.7, 3);
    return entry.cachedDuration >= Math.max(0.8, minDur);
  }
  // If track itself is shorter than requested introSeconds and we already cached nearly the whole track
  if (track.duration && track.duration > 0 && entry.cachedDuration >= track.duration * 0.85) {
    return true;
  }
  return false;
}

export async function cacheTrackIntro(
  track: Track,
  introSeconds: number
): Promise<CachedIntroEntry | null> {
  if (introSeconds <= 0 || !track.url) {
    return null;
  }

  if (track.source === 'local' || isLocalMediaUrl(track.url)) {
    try {
      await resolveLocalMediaUrl(track.url);
      notifyListeners();
    } catch {
      // ignore missing local record
    }
    return null;
  }

  await hydrateIntroCache();

  const existing = memoryCache.get(track.id);
  if (isIntroEntrySufficient(existing, track, introSeconds)) {
    return existing!;
  }

  const isYoutube = track.source === 'youtube' && Boolean(track.youtubeId);
  if (isYoutube) {
    const hasBackend = await checkBackendAvailable();
    if (!hasBackend) return null;
  }

  const inflight = inFlightCache.get(track.id);
  if (inflight) return inflight;

  const task = (async (): Promise<CachedIntroEntry | null> => {
    // ~48 KB/s handles up to 320 kbps MP3 + embedded ID3 cover art comfortably
    const targetBytes = Math.min(2_200_000, Math.max(380_000, introSeconds * 48_000 + 160_000));
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), isYoutube ? 16000 : 10000);

    try {
      const fetchUrl = isYoutube
        ? `./api/youtube/intro?v=${encodeURIComponent(track.youtubeId!)}&seconds=${encodeURIComponent(
            String(Math.min(20, Math.max(3, introSeconds)))
          )}`
        : track.url;

      const res = await fetch(fetchUrl, {
        method: 'GET',
        cache: 'no-store',
        headers: isYoutube
          ? undefined
          : {
              Range: `bytes=0-${targetBytes - 1}`,
            },
        signal: controller.signal,
      });

      if (!res.ok) {
        failedAttempts.set(track.id, Date.now());
        return null;
      }

      const contentType = res.headers.get('content-type');
      if (contentType && /text\/html|application\/json/i.test(contentType)) {
        failedAttempts.set(track.id, Date.now());
        return null;
      }

      const chunks: Uint8Array[] = [];
      let received = 0;

      if (res.body && typeof res.body.getReader === 'function') {
        const reader = res.body.getReader();
        while (received < targetBytes) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value && value.byteLength > 0) {
            const needed = targetBytes - received;
            if (value.byteLength > needed) {
              chunks.push(value.subarray(0, needed));
              received += needed;
              break;
            } else {
              chunks.push(value);
              received += value.byteLength;
            }
          }
        }
        try {
          controller.abort();
        } catch {
          // ignore
        }
      } else {
        const buf = await res.arrayBuffer();
        const slice = new Uint8Array(buf.slice(0, targetBytes));
        chunks.push(slice);
        received = slice.byteLength;
      }

      if (received < 12_000) {
        failedAttempts.set(track.id, Date.now());
        return null;
      }

      const merged = new Uint8Array(received);
      let offset = 0;
      for (const c of chunks) {
        merged.set(c, offset);
        offset += c.byteLength;
      }

      const mime = guessAudioMime(fetchUrl, contentType);
      const blob = new Blob([merged], { type: mime });
      const cachedDuration = await probeBlobAudioDuration(blob);

      const minAcceptDur = track.duration && track.duration <= 3 ? 0.8 : 1.2;
      if (cachedDuration < minAcceptDur) {
        failedAttempts.set(track.id, Date.now());
        return null;
      }

      const entry: CachedIntroEntry = {
        trackId: track.id,
        url: track.url,
        introSeconds,
        cachedDuration,
        blob,
        cachedAt: Date.now(),
      };
      await saveCacheEntry(entry);
      return entry;
    } catch {
      failedAttempts.set(track.id, Date.now());
      return null;
    } finally {
      window.clearTimeout(timeoutId);
      inFlightCache.delete(track.id);
      notifyListeners();
    }
  })();

  inFlightCache.set(track.id, task);
  notifyListeners();
  return task;
}

export async function warmTracksIntroCache(
  tracks: Track[],
  introSeconds: number,
  maxItems = Infinity
): Promise<void> {
  if (introSeconds <= 0 || tracks.length === 0) return;

  const myVersion = ++activeWarmVersion;
  await hydrateIntroCache();
  if (myVersion !== activeWarmVersion) return;

  // Deduplicate keeping priority order (active folder tracks first, then full library)
  const seen = new Set<string>();
  const uniqueTracks: Track[] = [];
  for (const t of tracks) {
    if (!t || !t.id || seen.has(t.id)) continue;
    seen.add(t.id);
    uniqueTracks.push(t);
  }

  // 1. Warm all local:// tracks into RAM object URLs first (instant, offline, 0 network)
  const localTracks = uniqueTracks.filter(
    (t) => (t.source === 'local' || isLocalMediaUrl(t.url)) && !getLocalMediaUrlSync(t.url)
  );
  if (localTracks.length > 0) {
    await Promise.allSettled(localTracks.map((t) => resolveLocalMediaUrl(t.url)));
    notifyListeners();
  }

  if (!navigator.onLine || myVersion !== activeWarmVersion) return;

  const hasBackend = await checkBackendAvailable();
  if (myVersion !== activeWarmVersion) return;

  const now = Date.now();
  const candidates = uniqueTracks
    .filter((t) => {
      if (!t.url || t.source === 'local' || isLocalMediaUrl(t.url)) return false;
      if (t.source === 'youtube' && !hasBackend) return false;
      if (isIntroEntrySufficient(memoryCache.get(t.id), t, introSeconds)) return false;
      const lastFail = failedAttempts.get(t.id);
      if (lastFail && now - lastFail < FAILED_RETRY_COOLDOWN_MS) return false;
      return true;
    })
    .slice(0, maxItems);

  if (candidates.length === 0) return;

  // Warm 2 at a time politely so active playback bandwidth is never starved
  const CONCURRENCY = 2;
  let index = 0;

  const worker = async () => {
    while (index < candidates.length && myVersion === activeWarmVersion) {
      const next = candidates[index++];
      if (next) {
        await cacheTrackIntro(next, introSeconds);
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, candidates.length) }, () => worker())
  );
}
