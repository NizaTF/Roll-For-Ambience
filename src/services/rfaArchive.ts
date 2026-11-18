import { DEFAULT_EQ_BANDS } from './audioFilters';
import { StoredLocalMediaRecord } from './localMedia';
import {
  AppAppearanceSettings,
  AudioFilterId,
  EqualizerBands,
  Folder,
  LoopMode,
  SoundPad,
  Track,
} from '../types/audio';

const RFA_MAGIC = [0x52, 0x46, 0x41, 0x31] as const; // 'RFA1'
const RFA_FORMAT_ID = 'rfa-archive-v1';
const RFA_APP_VERSION = '1.0.0';

export interface RfaPlayerPrefsSnapshot {
  crossfadeSeconds: number;
  introCacheSeconds: number;
  audioFilter: AudioFilterId;
  filterIntensity: number;
  equalizer: EqualizerBands;
  masterVolume: number;
  loopMode: LoopMode;
  shuffle: boolean;
}

export interface RfaArchiveMediaEntry {
  id: string;
  name: string;
  title: string;
  mime: string;
  size: number;
  kind: 'music' | 'sfx';
  duration?: number;
  createdAt: number;
  byteOffset: number;
  byteLength: number;
}

export interface RfaArchiveManifest {
  format: typeof RFA_FORMAT_ID;
  appVersion: string;
  exportedAt: number;
  library: {
    tracks: Record<string, Track>;
    folders: Folder[];
    selectedFolderId: string;
  };
  soundboard: SoundPad[];
  appearance?: AppAppearanceSettings;
  playerPrefs?: RfaPlayerPrefsSnapshot;
  mediaEntries: RfaArchiveMediaEntry[];
}

export type RfaParsedImport =
  | {
      kind: 'archive';
      manifest: RfaArchiveManifest;
      mediaRecords: StoredLocalMediaRecord[];
    }
  | {
      kind: 'json';
      jsonText: string;
    };

export interface BuildRfaArchiveInput {
  library: {
    tracks: Record<string, Track>;
    folders: Folder[];
    selectedFolderId: string;
  };
  soundboard: SoundPad[];
  appearance: AppAppearanceSettings;
  playerPrefs: RfaPlayerPrefsSnapshot;
  mediaRecords: StoredLocalMediaRecord[];
}

export interface BuildRfaArchiveOutput {
  blob: Blob;
  filename: string;
  summary: {
    folderCount: number;
    trackCount: number;
    soundCount: number;
    mediaCount: number;
    totalBytes: number;
  };
}

export function buildRfaArchiveBlob(input: BuildRfaArchiveInput): BuildRfaArchiveOutput {
  const validMedia = input.mediaRecords.filter(
    (rec) => rec && rec.id && rec.blob instanceof Blob
  );

  const mediaEntries: RfaArchiveMediaEntry[] = [];
  const blobs: Blob[] = [];
  let currentOffset = 0;

  for (const rec of validMedia) {
    const byteLength = rec.blob.size;
    mediaEntries.push({
      id: rec.id,
      name: rec.name || `${rec.title || rec.id}.audio`,
      title: rec.title || rec.name || 'Audio local',
      mime: rec.mime || rec.blob.type || 'audio/mpeg',
      size: byteLength,
      kind: rec.kind === 'sfx' ? 'sfx' : 'music',
      duration: rec.duration,
      createdAt: rec.createdAt || Date.now(),
      byteOffset: currentOffset,
      byteLength,
    });
    blobs.push(rec.blob);
    currentOffset += byteLength;
  }

  const manifest: RfaArchiveManifest = {
    format: RFA_FORMAT_ID,
    appVersion: RFA_APP_VERSION,
    exportedAt: Date.now(),
    library: {
      tracks: input.library.tracks,
      folders: input.library.folders,
      selectedFolderId: input.library.selectedFolderId,
    },
    soundboard: input.soundboard,
    appearance: input.appearance,
    playerPrefs: input.playerPrefs,
    mediaEntries,
  };

  const encoder = new TextEncoder();
  const manifestBytes = encoder.encode(JSON.stringify(manifest));

  const header = new Uint8Array(8);
  header[0] = RFA_MAGIC[0];
  header[1] = RFA_MAGIC[1];
  header[2] = RFA_MAGIC[2];
  header[3] = RFA_MAGIC[3];
  const view = new DataView(header.buffer);
  view.setUint32(4, manifestBytes.byteLength, true);

  const blob = new Blob([header, manifestBytes, ...blobs], {
    type: 'application/octet-stream',
  });

  const dateStamp = new Date().toISOString().slice(0, 10);
  const filename = `rfa-completo-${dateStamp}.rfa`;

  return {
    blob,
    filename,
    summary: {
      folderCount: input.library.folders.length,
      trackCount: Object.keys(input.library.tracks).length,
      soundCount: input.soundboard.length,
      mediaCount: mediaEntries.length,
      totalBytes: blob.size,
    },
  };
}

function isRfaHeader(bytes: Uint8Array): boolean {
  return (
    bytes.byteLength >= 8 &&
    bytes[0] === RFA_MAGIC[0] &&
    bytes[1] === RFA_MAGIC[1] &&
    bytes[2] === RFA_MAGIC[2] &&
    bytes[3] === RFA_MAGIC[3]
  );
}

function sanitizeManifest(raw: unknown): RfaArchiveManifest {
  if (!raw || typeof raw !== 'object') {
    throw new Error('El manifiesto del archivo .rfa no es válido.');
  }
  const obj = raw as Record<string, unknown>;
  if (obj.format !== RFA_FORMAT_ID) {
    throw new Error('Versión de archivo .rfa no compatible.');
  }

  const lib = obj.library as Record<string, unknown> | undefined;
  if (
    !lib ||
    !lib.tracks ||
    typeof lib.tracks !== 'object' ||
    !Array.isArray(lib.folders)
  ) {
    throw new Error('El archivo .rfa no contiene una biblioteca válida.');
  }

  const rawSoundboard = Array.isArray(obj.soundboard) ? (obj.soundboard as SoundPad[]) : [];
  const rawMediaEntries = Array.isArray(obj.mediaEntries)
    ? (obj.mediaEntries as RfaArchiveMediaEntry[])
    : [];

  const rawPrefs = obj.playerPrefs as Partial<RfaPlayerPrefsSnapshot> | undefined;
  const playerPrefs: RfaPlayerPrefsSnapshot | undefined = rawPrefs
    ? {
        crossfadeSeconds:
          typeof rawPrefs.crossfadeSeconds === 'number' ? rawPrefs.crossfadeSeconds : 4,
        introCacheSeconds:
          typeof rawPrefs.introCacheSeconds === 'number' ? rawPrefs.introCacheSeconds : 8,
        audioFilter:
          typeof rawPrefs.audioFilter === 'string'
            ? (rawPrefs.audioFilter as AudioFilterId)
            : 'none',
        filterIntensity:
          typeof rawPrefs.filterIntensity === 'number' ? rawPrefs.filterIntensity : 1,
        equalizer: rawPrefs.equalizer || { ...DEFAULT_EQ_BANDS },
        masterVolume: typeof rawPrefs.masterVolume === 'number' ? rawPrefs.masterVolume : 0.85,
        loopMode:
          rawPrefs.loopMode === 'none' ||
          rawPrefs.loopMode === 'folder' ||
          rawPrefs.loopMode === 'track'
            ? rawPrefs.loopMode
            : 'folder',
        shuffle: Boolean(rawPrefs.shuffle),
      }
    : undefined;

  return {
    format: RFA_FORMAT_ID,
    appVersion: typeof obj.appVersion === 'string' ? obj.appVersion : RFA_APP_VERSION,
    exportedAt: typeof obj.exportedAt === 'number' ? obj.exportedAt : Date.now(),
    library: {
      tracks: lib.tracks as Record<string, Track>,
      folders: lib.folders as Folder[],
      selectedFolderId:
        typeof lib.selectedFolderId === 'string' ? lib.selectedFolderId : 'all',
    },
    soundboard: rawSoundboard,
    appearance: obj.appearance as AppAppearanceSettings | undefined,
    playerPrefs,
    mediaEntries: rawMediaEntries,
  };
}

export async function parseRfaArchiveFile(file: File): Promise<RfaParsedImport> {
  if (file.size >= 8) {
    const headerBuf = await file.slice(0, 8).arrayBuffer();
    const headerBytes = new Uint8Array(headerBuf);

    if (isRfaHeader(headerBytes)) {
      const view = new DataView(headerBuf);
      const manifestLen = view.getUint32(4, true);

      if (manifestLen <= 0 || 8 + manifestLen > file.size) {
        throw new Error('El archivo .rfa está dañado o incompleto.');
      }

      const manifestText = await file.slice(8, 8 + manifestLen).text();
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(manifestText);
      } catch {
        throw new Error('No se pudo leer la estructura interna del archivo .rfa.');
      }

      const manifest = sanitizeManifest(parsedJson);
      const payloadStart = 8 + manifestLen;
      const mediaRecords: StoredLocalMediaRecord[] = [];

      for (const entry of manifest.mediaEntries) {
        if (
          !entry ||
          typeof entry.id !== 'string' ||
          typeof entry.byteOffset !== 'number' ||
          typeof entry.byteLength !== 'number' ||
          entry.byteOffset < 0 ||
          entry.byteLength < 0
        ) {
          continue;
        }

        const absStart = payloadStart + entry.byteOffset;
        const absEnd = absStart + entry.byteLength;
        if (absEnd > file.size) {
          throw new Error('Faltan datos de audio en el archivo .rfa (archivo truncado).');
        }

        const mime = entry.mime || 'audio/mpeg';
        const blob = file.slice(absStart, absEnd, mime);
        mediaRecords.push({
          id: entry.id,
          name: entry.name || `${entry.title || entry.id}.audio`,
          title: entry.title || entry.name || 'Audio local',
          mime,
          size: entry.byteLength,
          kind: entry.kind === 'sfx' ? 'sfx' : 'music',
          blob,
          duration: entry.duration,
          createdAt: entry.createdAt || Date.now(),
        });
      }

      return {
        kind: 'archive',
        manifest,
        mediaRecords,
      };
    }
  }

  const jsonText = await file.text();
  return {
    kind: 'json',
    jsonText,
  };
}

export function downloadArchiveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1500);
}
