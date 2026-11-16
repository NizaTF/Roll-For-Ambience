import { Track } from '../types/audio';

const CACHE_DB_NAME = 'rfa_intro_audio_cache_v1';
const CACHE_STORE = 'intros';
const MAX_CACHED_TRACKS = 75;

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
let dbPromise: Promise<IDBDatabase | null> | null = null;
let hydrated = false;

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
  if (hydrated) return;
  hydrated = true;

  try {
    const db = await openCacheDB();
    if (!db) return;

    await new Promise<void>((resolve) => {
      const tx = db.transaction(CACHE_STORE, 'readonly');
      const req = tx.objectStore(CACHE_STORE).getAll();
      req.onsuccess = () => {
        const items = Array.isArray(req.result) ? (req.result as CachedIntroEntry[]) : [];
        for (const item of items) {
          if (item && item.trackId && item.blob instanceof Blob && item.cachedDuration > 1) {
            memoryCache.set(item.trackId, item);
          }
        }
        resolve();
      };
      req.onerror = () => resolve();
    });
  } catch {
    // ignore IDB read failures
  }
}

export function getCachedIntroSync(trackId: string, minSeconds = 1): CachedIntroEntry | null {
  const entry = memoryCache.get(trackId);
  if (!entry) return null;
  if (entry.cachedDuration < Math.min(2, minSeconds)) return null;
  return entry;
}

async function saveCacheEntry(entry: CachedIntroEntry): Promise<void> {
  memoryCache.set(entry.trackId, entry);

  // Trim memory LRU if over limit
  if (memoryCache.size > MAX_CACHED_TRACKS) {
    const oldest = Array.from(memoryCache.values()).sort((a, b) => a.cachedAt - b.cachedAt);
    const excess = oldest.slice(0, memoryCache.size - MAX_CACHED_TRACKS);
    for (const item of excess) {
      memoryCache.delete(item.trackId);
    }
  }

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

export async function cacheTrackIntro(
  track: Track,
  introSeconds: number
): Promise<CachedIntroEntry | null> {
  if (introSeconds <= 0 || track.source === 'youtube' || !track.url) {
    return null;
  }

  const existing = memoryCache.get(track.id);
  if (
    existing &&
    existing.url === track.url &&
    existing.introSeconds >= introSeconds &&
    existing.cachedDuration >= Math.min(introSeconds * 0.8, 3)
  ) {
    return existing;
  }

  const inflight = inFlightCache.get(track.id);
  if (inflight) return inflight;

  const task = (async (): Promise<CachedIntroEntry | null> => {
    // ~44 KB/s handles up to 320 kbps MP3 + ID3 header comfortably
    const targetBytes = Math.min(1_500_000, Math.max(260_000, introSeconds * 44_000 + 80_000));
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 9000);

    try {
      const res = await fetch(track.url, {
        method: 'GET',
        cache: 'no-store',
        headers: {
          Range: `bytes=0-${targetBytes - 1}`,
        },
        signal: controller.signal,
      });

      if (!res.ok) return null;

      const contentType = res.headers.get('content-type');
      if (contentType && /text\/html|application\/json/i.test(contentType)) {
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

      if (received < 16_000) return null;

      const merged = new Uint8Array(received);
      let offset = 0;
      for (const c of chunks) {
        merged.set(c, offset);
        offset += c.byteLength;
      }

      const mime = guessAudioMime(track.url, contentType);
      const blob = new Blob([merged], { type: mime });
      const cachedDuration = await probeBlobAudioDuration(blob);

      if (cachedDuration < 1.5) return null;

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
      return null;
    } finally {
      window.clearTimeout(timeoutId);
      inFlightCache.delete(track.id);
    }
  })();

  inFlightCache.set(track.id, task);
  return task;
}

export async function warmTracksIntroCache(
  tracks: Track[],
  introSeconds: number,
  maxItems = 10
): Promise<void> {
  if (introSeconds <= 0 || !navigator.onLine) return;

  const candidates = tracks
    .filter((t) => {
      if (t.source === 'youtube' || !t.url) return false;
      const cached = memoryCache.get(t.id);
      return !cached || cached.introSeconds < introSeconds;
    })
    .slice(0, maxItems);

  // Warm 2 at a time politely so playback bandwidth is never starved
  const CONCURRENCY = 2;
  let index = 0;

  const worker = async () => {
    while (index < candidates.length) {
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
