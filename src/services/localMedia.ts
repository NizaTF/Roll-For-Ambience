import { LOCAL_MEDIA_STORE, openAppDB } from './persistence';

export const LOCAL_MEDIA_PREFIX = 'local://';

export interface StoredLocalMediaRecord {
  id: string;
  name: string;
  title: string;
  mime: string;
  size: number;
  kind: 'music' | 'sfx';
  blob: Blob;
  duration?: number;
  createdAt: number;
}

export interface SavedLocalAudioInfo {
  id: string;
  mediaUrl: string;
  title: string;
  duration?: number;
  size: number;
  mime: string;
}

const objectUrlMemoryCache = new Map<string, string>();
const inFlightResolutions = new Map<string, Promise<string>>();

export function isLocalMediaUrl(url: string | undefined | null): boolean {
  return typeof url === 'string' && url.startsWith(LOCAL_MEDIA_PREFIX);
}

export function getLocalMediaId(url: string): string {
  return url.startsWith(LOCAL_MEDIA_PREFIX)
    ? url.slice(LOCAL_MEDIA_PREFIX.length)
    : url;
}

export function makeLocalMediaUrl(id: string): string {
  return `${LOCAL_MEDIA_PREFIX}${id}`;
}

export function isSupportedAudioFile(file: File): boolean {
  if (file.type && file.type.toLowerCase().startsWith('audio/')) {
    return true;
  }
  return /\.(mp3|ogg|oga|wav|m4a|aac|flac|opus|webm|mp4)$/i.test(file.name);
}

export function formatTitleFromFilename(filename: string): string {
  const withoutExt = filename.replace(/\.[^/.]+$/, '');
  const cleaned = withoutExt.replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned || 'Audio local';
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function probeAudioDuration(file: Blob): Promise<number | undefined> {
  return new Promise((resolve) => {
    let url = '';
    try {
      url = URL.createObjectURL(file);
    } catch {
      resolve(undefined);
      return;
    }

    const audio = new Audio();
    audio.preload = 'metadata';
    let settled = false;

    const finish = (dur?: number) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      audio.onloadedmetadata = null;
      audio.onerror = null;
      audio.removeAttribute('src');
      URL.revokeObjectURL(url);
      resolve(dur && Number.isFinite(dur) && dur > 0 ? Math.round(dur) : undefined);
    };

    const timer = window.setTimeout(() => finish(undefined), 3000);
    audio.onloadedmetadata = () => finish(audio.duration);
    audio.onerror = () => finish(undefined);
    audio.src = url;
  });
}

export async function saveLocalAudioFile(
  file: File,
  kind: 'music' | 'sfx',
  customTitle?: string
): Promise<SavedLocalAudioInfo> {
  const db = await openAppDB();
  if (!db) {
    throw new Error('Tu navegador no permite almacenar archivos locales persistentes.');
  }

  const id = `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const title = (customTitle && customTitle.trim()) || formatTitleFromFilename(file.name);
  const mime = file.type || 'audio/mpeg';
  const duration = await probeAudioDuration(file);

  const record: StoredLocalMediaRecord = {
    id,
    name: file.name,
    title,
    mime,
    size: file.size,
    kind,
    blob: file,
    duration,
    createdAt: Date.now(),
  };

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(LOCAL_MEDIA_STORE, 'readwrite');
    tx.objectStore(LOCAL_MEDIA_STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () =>
      reject(new Error('No se pudo guardar el archivo en el almacenamiento local.'));
  });

  const mediaUrl = makeLocalMediaUrl(id);
  try {
    const objUrl = URL.createObjectURL(file);
    objectUrlMemoryCache.set(mediaUrl, objUrl);
  } catch {
    // Will resolve lazily if needed
  }

  return {
    id,
    mediaUrl,
    title,
    duration,
    size: file.size,
    mime,
  };
}

export function getLocalMediaUrlSync(url: string): string | null {
  if (!isLocalMediaUrl(url)) return url;
  return objectUrlMemoryCache.get(url) || null;
}

export async function resolveLocalMediaUrl(url: string): Promise<string> {
  if (!isLocalMediaUrl(url)) return url;

  const cached = objectUrlMemoryCache.get(url);
  if (cached) return cached;

  const existingPromise = inFlightResolutions.get(url);
  if (existingPromise) return existingPromise;

  const promise = (async () => {
    const db = await openAppDB();
    if (!db) {
      throw new Error('Almacenamiento local no disponible.');
    }

    const id = getLocalMediaId(url);
    const record = await new Promise<StoredLocalMediaRecord | undefined>((resolve) => {
      try {
        const tx = db.transaction(LOCAL_MEDIA_STORE, 'readonly');
        const req = tx.objectStore(LOCAL_MEDIA_STORE).get(id);
        req.onsuccess = () => resolve(req.result as StoredLocalMediaRecord | undefined);
        req.onerror = () => resolve(undefined);
      } catch {
        resolve(undefined);
      }
    });

    if (!record || !record.blob) {
      throw new Error('El archivo local ya no existe en este dispositivo.');
    }

    const blobUrl = URL.createObjectURL(record.blob);
    objectUrlMemoryCache.set(url, blobUrl);
    return blobUrl;
  })();

  inFlightResolutions.set(url, promise);
  try {
    return await promise;
  } finally {
    inFlightResolutions.delete(url);
  }
}

export async function deleteLocalMedia(url: string): Promise<void> {
  if (!isLocalMediaUrl(url)) return;

  const cached = objectUrlMemoryCache.get(url);
  if (cached) {
    try {
      URL.revokeObjectURL(cached);
    } catch {
      // ignore
    }
    objectUrlMemoryCache.delete(url);
  }

  const db = await openAppDB();
  if (!db) return;

  const id = getLocalMediaId(url);
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(LOCAL_MEDIA_STORE, 'readwrite');
      tx.objectStore(LOCAL_MEDIA_STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function getLocalMediaStats(): Promise<{
  count: number;
  totalBytes: number;
  musicCount: number;
  sfxCount: number;
}> {
  const db = await openAppDB();
  if (!db) return { count: 0, totalBytes: 0, musicCount: 0, sfxCount: 0 };

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(LOCAL_MEDIA_STORE, 'readonly');
      const req = tx.objectStore(LOCAL_MEDIA_STORE).getAll();
      req.onsuccess = () => {
        const items = (req.result as StoredLocalMediaRecord[] | undefined) || [];
        let totalBytes = 0;
        let musicCount = 0;
        let sfxCount = 0;
        for (const item of items) {
          totalBytes += Number(item.size || item.blob?.size || 0);
          if (item.kind === 'sfx') sfxCount += 1;
          else musicCount += 1;
        }
        resolve({
          count: items.length,
          totalBytes,
          musicCount,
          sfxCount,
        });
      };
      req.onerror = () =>
        resolve({ count: 0, totalBytes: 0, musicCount: 0, sfxCount: 0 });
    } catch {
      resolve({ count: 0, totalBytes: 0, musicCount: 0, sfxCount: 0 });
    }
  });
}

export async function getAllLocalMediaRecords(): Promise<StoredLocalMediaRecord[]> {
  const db = await openAppDB();
  if (!db) return [];

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(LOCAL_MEDIA_STORE, 'readonly');
      const req = tx.objectStore(LOCAL_MEDIA_STORE).getAll();
      req.onsuccess = () => {
        const items = (req.result as StoredLocalMediaRecord[] | undefined) || [];
        resolve(items.filter((item) => item && item.id && item.blob instanceof Blob));
      };
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

export async function saveRawLocalMediaRecords(
  records: StoredLocalMediaRecord[]
): Promise<void> {
  if (records.length === 0) return;
  const db = await openAppDB();
  if (!db) {
    throw new Error('Tu navegador no permite restaurar archivos locales en IndexedDB.');
  }

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(LOCAL_MEDIA_STORE, 'readwrite');
    const store = tx.objectStore(LOCAL_MEDIA_STORE);
    for (const rec of records) {
      store.put(rec);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () =>
      reject(new Error('No se pudieron guardar los archivos de audio importados.'));
  });

  for (const rec of records) {
    const mediaUrl = makeLocalMediaUrl(rec.id);
    if (!objectUrlMemoryCache.has(mediaUrl)) {
      try {
        objectUrlMemoryCache.set(mediaUrl, URL.createObjectURL(rec.blob));
      } catch {
        // ignore object url allocation failures
      }
    }
  }
}
