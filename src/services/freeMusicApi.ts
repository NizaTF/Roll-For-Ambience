import { Track, WikimediaSfxResult } from '../types/audio';

const APP_NAME = 'RFARollForAmbience';

export async function searchAudiusTracks(query: string): Promise<Track[]> {
  const clean = query.trim();
  if (!clean) return [];

  const url = `https://api.audius.co/v1/tracks/search?query=${encodeURIComponent(
    clean
  )}&app_name=${APP_NAME}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Audius respondió ${res.status}`);
  }
  const json = await res.json();
  const items = Array.isArray(json?.data) ? json.data : [];

  return items
    .filter((t: Record<string, unknown>) => t.id && t.title && t.is_available !== false)
    .slice(0, 18)
    .map((t: Record<string, unknown>) => {
      const id = String(t.id);
      const user = (t.user || {}) as Record<string, unknown>;
      const artwork = (t.artwork || {}) as Record<string, string>;
      return {
        id: `audius-${id}`,
        title: String(t.title),
        artist: String(user.name || 'Artista en Audius'),
        source: 'audius' as const,
        url: `https://api.audius.co/v1/tracks/${encodeURIComponent(id)}/stream?app_name=${APP_NAME}`,
        duration: typeof t.duration === 'number' ? t.duration : undefined,
        artworkUrl: artwork['150x150'] || artwork['480x480'] || undefined,
        addedAt: Date.now(),
      };
    });
}

export async function searchArchiveOrgTracks(query: string): Promise<Track[]> {
  const clean = query.trim();
  if (!clean) return [];

  const q = `(${clean}) AND mediatype:audio AND format:"VBR MP3"`;
  const searchUrl = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(
    q
  )}&fl[]=identifier,title,creator&rows=8&sort[]=downloads+desc&output=json`;

  const res = await fetch(searchUrl);
  if (!res.ok) {
    throw new Error(`Archive.org respondió ${res.status}`);
  }
  const json = await res.json();
  const docs = Array.isArray(json?.response?.docs) ? json.response.docs : [];

  const resolved: Track[] = [];
  await Promise.all(
    docs.slice(0, 6).map(async (doc: Record<string, unknown>) => {
      const identifier = String(doc.identifier || '');
      if (!identifier) return;
      try {
        const metaRes = await fetch(
          `https://archive.org/metadata/${encodeURIComponent(identifier)}/files`
        );
        if (!metaRes.ok) return;
        const metaJson = await metaRes.json();
        const files = Array.isArray(metaJson?.result) ? metaJson.result : [];
        const mp3 = files.find(
          (f: Record<string, unknown>) =>
            typeof f.name === 'string' &&
            (f.name.toLowerCase().endsWith('.mp3') || f.name.toLowerCase().endsWith('.ogg'))
        );
        if (!mp3) return;
        const rawLength = Number(mp3.length);
        resolved.push({
          id: `archive-${identifier}`,
          title: String(doc.title || identifier),
          artist: String(
            Array.isArray(doc.creator)
              ? doc.creator[0]
              : doc.creator || 'Internet Archive'
          ),
          source: 'direct',
          url: `https://archive.org/download/${encodeURIComponent(
            identifier
          )}/${encodeURIComponent(String(mp3.name))}`,
          duration: Number.isFinite(rawLength) && rawLength > 0 ? Math.round(rawLength) : undefined,
          addedAt: Date.now(),
        });
      } catch {
        // Ignore single item metadata errors
      }
    })
  );

  return resolved;
}

const ES_TO_EN_SFX: Record<string, string> = {
  espada: 'sword',
  espadas: 'sword clash',
  trueno: 'thunder',
  truenos: 'thunder',
  lluvia: 'rain',
  fuego: 'fire crackle',
  hoguera: 'campfire',
  campamento: 'campfire',
  lobo: 'wolf howl',
  dragon: 'dragon roar',
  dragón: 'dragon roar',
  flecha: 'arrow bow',
  arco: 'bow arrow',
  viento: 'wind howl',
  caballo: 'horse gallop',
  relincho: 'horse neigh',
  campana: 'church bell',
  puerta: 'door creak',
  portazo: 'door slam',
  monedas: 'coins',
  oro: 'coins',
  magia: 'magic spell',
  hechizo: 'magic chime',
  explosion: 'explosion',
  explosión: 'explosion',
  pasos: 'footsteps',
  bosque: 'forest birds',
  rugido: 'monster roar',
  grito: 'scream',
  tormenta: 'thunderstorm',
  cuervo: 'crow',
  buho: 'owl',
  búho: 'owl',
  agua: 'water stream',
  cascada: 'waterfall',
  mar: 'ocean waves',
  relampago: 'lightning thunder',
  relámpago: 'lightning thunder',
  taberna: 'tavern crowd',
  escudo: 'shield impact',
  hacha: 'axe swing',
  fantasma: 'ghost',
  cadenas: 'chains rattle',
  cuerno: 'war horn',
  tambores: 'war drums',
  tambor: 'drum',
  cueva: 'cave water drip',
  pantano: 'swamp frogs',
  cristal: 'glass shatter',
  vidrio: 'glass shatter',
  llave: 'keys jingle',
  cerradura: 'door lock',
  golpe: 'punch hit',
  mordida: 'bite',
  aleteo: 'wings flapping',
  alas: 'wings flapping',
  risa: 'evil laugh',
  esqueleto: 'bones rattle',
  huesos: 'bones rattle',
  monstruo: 'monster growl',
  portal: 'portal whoosh',
  trampa: 'trap click',
};

const SFX_BLOCK_PATTERNS =
  /\b(podcast|episode|interview|speech|pronunciation|spoken|audiobook|symphony|sonata|concerto|orchestra|opera|anthem|waltz|ballad|choir|band|lecture|sermon|reading|chapter|wikipedia|interval|chord|tuning|music|song|album|remix|cover|karaoke|soundtrack|ost)\b/i;

const SPOKEN_LANG_PREFIX =
  /^(En|Es|Fr|De|Pt|It|Ru|Nl|Sv|Pl|Zh|Ja|Ar|Uk|Cs|Hu|Fi|Da|No|He|Ko|LL|Q\d+)-/i;

function translateSfxQuery(rawQuery: string): string {
  const tokens = rawQuery
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return tokens.map((t) => ES_TO_EN_SFX[t] || t).join(' ');
}

export async function searchWikimediaSfx(query: string): Promise<WikimediaSfxResult[]> {
  const clean = query.trim();
  if (!clean) return [];

  const translated = translateSfxQuery(clean);
  const searchTerm = `${translated} filetype:audio -"En-us-" -"En-au-" -"En-gb-" -"LL-Q" -"Spoken" -"Podcast" -"Symphony"`;

  const url = `https://commons.wikimedia.org/w/api.php?origin=*&action=query&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(
    searchTerm
  )}&gsrlimit=24&prop=imageinfo|categories&iiprop=url|mime|size|duration&format=json`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Wikimedia respondió ${res.status}`);
  }
  const json = await res.json();
  const pages = Object.values(json?.query?.pages || {}) as Array<Record<string, unknown>>;

  const filtered = pages
    .map((p) => {
      const infoList = Array.isArray(p.imageinfo) ? p.imageinfo : [];
      const info = infoList[0] as Record<string, unknown> | undefined;
      if (!info?.url) return null;

      const mime = String(info.mime || '').toLowerCase();
      const rawUrl = String(info.url).split('?')[0];
      if ((!mime.includes('audio') && !mime.includes('ogg')) || mime.includes('midi')) {
        return null;
      }
      if (/\.(mid|midi)$/i.test(rawUrl)) return null;

      const dur = typeof info.duration === 'number' ? info.duration : 0;
      const size = typeof info.size === 'number' ? info.size : 0;
      // Reject long recordings (> 60s) or huge files (> 3 MB) that are songs/podcasts
      if (dur > 60 || size > 3_000_000) return null;

      const rawTitle = String(p.title || 'Sonido')
        .replace(/^File:/i, '')
        .replace(/\.(mp3|ogg|wav|opus|flac|m4a|oga)$/i, '')
        .replace(/_/g, ' ');

      const cats = Array.isArray(p.categories)
        ? (p.categories as Array<Record<string, unknown>>)
            .map((c) => String(c.title || ''))
            .join(' ')
        : '';

      if (SPOKEN_LANG_PREFIX.test(rawTitle)) return null;
      if (SFX_BLOCK_PATTERNS.test(rawTitle) || SFX_BLOCK_PATTERNS.test(cats)) {
        // Allow only if explicitly marked as sound effect / foley / Gravity Sound
        if (!/sound effect|sfx|gravity sound|foley/i.test(`${rawTitle} ${cats}`)) {
          return null;
        }
      }

      const isExplicitSfx =
        /sound effect|sfx|gravity sound|foley|freesound/i.test(`${rawTitle} ${cats}`) ||
        (dur > 0 && dur <= 15);

      return {
        id: `wiki-${String(p.pageid)}`,
        title: rawTitle,
        url: rawUrl,
        duration: dur > 0 ? Math.round(dur) : undefined,
        mime,
        sourceLabel: 'Wikimedia SFX',
        _score: isExplicitSfx ? 2 : 1,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => b._score - a._score)
    .slice(0, 12)
    .map(({ _score: _, ...rest }) => rest);

  return filtered;
}

export async function searchArchiveOrgSfx(query: string): Promise<WikimediaSfxResult[]> {
  const clean = query.trim();
  if (!clean) return [];

  const translated = translateSfxQuery(clean);
  const keywords = translated.split(/\s+/).filter((w) => w.length >= 2);
  const q = `(${translated}) AND (collection:folksoundomy_effects OR collection:sound_effects) AND -collection:podcasts AND -collection:netlabels AND -subject:music AND -subject:podcast AND mediatype:audio`;
  const searchUrl = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(
    q
  )}&fl[]=identifier,title&rows=6&sort[]=downloads+desc&output=json`;

  const res = await fetch(searchUrl);
  if (!res.ok) return [];
  const json = await res.json();
  const docs = Array.isArray(json?.response?.docs) ? json.response.docs : [];

  const results: WikimediaSfxResult[] = [];
  await Promise.all(
    docs.slice(0, 5).map(async (doc: Record<string, unknown>) => {
      const identifier = String(doc.identifier || '');
      const docTitle = String(doc.title || identifier);
      if (!identifier || SFX_BLOCK_PATTERNS.test(docTitle)) return;

      try {
        const metaRes = await fetch(
          `https://archive.org/metadata/${encodeURIComponent(identifier)}/files`
        );
        if (!metaRes.ok) return;
        const metaJson = await metaRes.json();
        const files = Array.isArray(metaJson?.result) ? metaJson.result : [];

        // Only pick short individual SFX files (<= 45s) matching the query
        const candidates = files.filter((f: Record<string, unknown>) => {
          const name = String(f.name || '');
          if (!/\.(mp3|ogg|wav)$/i.test(name)) return false;
          if (SFX_BLOCK_PATTERNS.test(name)) return false;
          const dur = Number(f.length || 0);
          const size = Number(f.size || 0);
          if (dur <= 0 || dur > 45 || size > 2_500_000) return false;
          const lowerName = name.toLowerCase();
          return (
            keywords.some((kw) => lowerName.includes(kw)) ||
            keywords.some((kw) => docTitle.toLowerCase().includes(kw))
          );
        });

        for (const audioFile of candidates.slice(0, 3)) {
          const fileName = String(audioFile.name);
          const cleanName = fileName
            .replace(/\.(mp3|ogg|wav)$/i, '')
            .replace(/[_-]+/g, ' ')
            .trim();
          const dur = Number(audioFile.length);
          results.push({
            id: `arch-sfx-${identifier}-${fileName}`,
            title: cleanName.length >= 3 ? cleanName : docTitle,
            url: `https://archive.org/download/${encodeURIComponent(
              identifier
            )}/${encodeURIComponent(fileName)}`,
            duration: Number.isFinite(dur) && dur > 0 ? Math.round(dur) : undefined,
            mime: fileName.endsWith('.ogg') ? 'audio/ogg' : 'audio/mpeg',
            sourceLabel: 'Archive SFX',
          });
        }
      } catch {
        // ignore single failure
      }
    })
  );

  return results.slice(0, 10);
}

export async function searchInternetSfx(query: string): Promise<WikimediaSfxResult[]> {
  const [wikiRes, archiveRes] = await Promise.allSettled([
    searchWikimediaSfx(query),
    searchArchiveOrgSfx(query),
  ]);

  const combined: WikimediaSfxResult[] = [];
  if (wikiRes.status === 'fulfilled') combined.push(...wikiRes.value);
  if (archiveRes.status === 'fulfilled') combined.push(...archiveRes.value);
  return combined;
}

export function parseYouTubeId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  try {
    const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const url = new URL(normalized);
    const host = url.hostname.replace(/^www\./, '').toLowerCase();

    if (host === 'youtu.be') {
      const id = url.pathname.split('/').filter(Boolean)[0];
      return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
    }

    if (
      host === 'youtube.com' ||
      host === 'm.youtube.com' ||
      host === 'music.youtube.com' ||
      host === 'youtube-nocookie.com'
    ) {
      const v = url.searchParams.get('v');
      if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;

      const parts = url.pathname.split('/').filter(Boolean);
      if ((parts[0] === 'embed' || parts[0] === 'shorts' || parts[0] === 'live') && parts[1]) {
        return /^[a-zA-Z0-9_-]{11}$/.test(parts[1]) ? parts[1] : null;
      }
    }
  } catch {
    return null;
  }

  return null;
}

export async function fetchYouTubeMeta(videoId: string): Promise<{
  title: string;
  author: string;
  thumbnail: string;
}> {
  const fallback = {
    title: `Pista de YouTube (${videoId})`,
    author: 'YouTube',
    thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
  };

  try {
    const watchUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
    const res = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(watchUrl)}`);
    if (!res.ok) return fallback;
    const json = await res.json();
    return {
      title: typeof json?.title === 'string' && json.title ? json.title : fallback.title,
      author:
        typeof json?.author_name === 'string' && json.author_name
          ? json.author_name
          : fallback.author,
      thumbnail:
        typeof json?.thumbnail_url === 'string' && json.thumbnail_url
          ? json.thumbnail_url
          : fallback.thumbnail,
    };
  } catch {
    return fallback;
  }
}

const PIPED_INSTANCES = [
  'https://api.piped.private.coffee',
  'https://pipedapi.ducks.party',
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.leptons.xyz',
  'https://pipedapi.adminforge.de',
  'https://pipedapi.nosebs.ru',
  'https://pipedapi.drgns.space',
  'https://pipedapi-libre.kavin.rocks',
];

const INVIDIOUS_INSTANCES = [
  'https://yewtu.be',
  'https://inv.nadeko.net',
  'https://invidious.nerdvpn.de',
  'https://invidious.tiekoetter.com',
  'https://yt.chocolatemoo53.com',
];

export interface ResolvedAudioStream {
  url: string;
  duration?: number;
  resolvedAt: number;
  isBackendStream?: boolean;
  requiresLogin?: boolean;
}

export interface YouTubeAuthStatus {
  available: boolean;
  authenticated: boolean;
  pending?: {
    verificationUrl: string;
    userCode: string;
    expiresAt: number;
  } | null;
  error?: string | null;
}

const ytAudioStreamCache = new Map<string, ResolvedAudioStream>();
let cachedDynamicPipedHosts: string[] | null = null;
let backendAvailableCache: boolean | null = null;
let backendProbePromise: Promise<boolean> | null = null;

export function isBackendAvailableSync(): boolean | null {
  return backendAvailableCache;
}

export async function checkBackendAvailable(): Promise<boolean> {
  if (backendAvailableCache !== null) return backendAvailableCache;
  if (backendProbePromise) return backendProbePromise;

  backendProbePromise = (async () => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 1400);
    try {
      const res = await fetch('./api/health', {
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!res.ok) {
        backendAvailableCache = false;
        return false;
      }
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      if (!ct.includes('application/json')) {
        backendAvailableCache = false;
        return false;
      }
      const json = (await res.json()) as { ok?: boolean };
      backendAvailableCache = Boolean(json?.ok);
      return backendAvailableCache;
    } catch {
      backendAvailableCache = false;
      return false;
    } finally {
      window.clearTimeout(timer);
    }
  })();

  return backendProbePromise;
}

export async function getYouTubeAuthStatus(): Promise<YouTubeAuthStatus> {
  const hasBackend = await checkBackendAvailable();
  if (!hasBackend) {
    return { available: false, authenticated: false };
  }
  try {
    const res = await fetch('./api/youtube/auth/status', { cache: 'no-store' });
    if (!res.ok) return { available: false, authenticated: false };
    return (await res.json()) as YouTubeAuthStatus;
  } catch {
    return { available: false, authenticated: false };
  }
}

export async function startYouTubeDeviceAuth(): Promise<YouTubeAuthStatus> {
  const res = await fetch('./api/youtube/auth/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  const json = (await res.json()) as YouTubeAuthStatus;
  return { ...json, available: true };
}

export async function logoutYouTubeAuth(): Promise<void> {
  try {
    await fetch('./api/youtube/auth/logout', { method: 'POST' });
    ytAudioStreamCache.clear();
  } catch {
    // ignore
  }
}

export function invalidateYouTubeAudioStream(videoId: string): void {
  ytAudioStreamCache.delete(videoId);
}

async function fetchJsonWithTimeout(url: string, timeoutMs = 4500): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as Record<string, unknown>;
  } finally {
    window.clearTimeout(timer);
  }
}

async function probeCorsMediaUrl(url: string, timeoutMs = 4000): Promise<boolean> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      mode: 'cors',
      headers: { Range: 'bytes=0-1023' },
      signal: controller.signal,
    });
    const okStatus = res.ok || res.status === 206;
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    const isMediaContent =
      !ct.includes('text/html') &&
      !ct.includes('application/json') &&
      !ct.includes('text/plain');
    try {
      await res.body?.cancel();
    } catch {
      // ignore
    }
    return okStatus && isMediaContent;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timer);
  }
}

async function pickFirstPlayableUrl(urls: string[]): Promise<string | null> {
  const unique = Array.from(new Set(urls.filter((u) => typeof u === 'string' && u.startsWith('http'))));
  for (const url of unique.slice(0, 4)) {
    if (await probeCorsMediaUrl(url)) {
      return url;
    }
  }
  return null;
}

async function tryPipedInstance(instance: string, videoId: string): Promise<ResolvedAudioStream> {
  const data = await fetchJsonWithTimeout(
    `${instance}/streams/${encodeURIComponent(videoId)}`,
    4500
  );
  const audioStreams = Array.isArray(data.audioStreams)
    ? (data.audioStreams as Array<Record<string, unknown>>)
    : [];

  const usableAudio = audioStreams
    .filter((s) => typeof s.url === 'string' && s.url.startsWith('http'))
    .sort((a, b) => {
      const aM4a = String(a.mimeType || '').includes('mp4') ? 1 : 0;
      const bM4a = String(b.mimeType || '').includes('mp4') ? 1 : 0;
      if (aM4a !== bM4a) return bM4a - aM4a;
      return Number(b.bitrate || 0) - Number(a.bitrate || 0);
    });

  const preferredAudio = usableAudio.find((s) => Number(s.bitrate || 0) <= 192000);
  const candidates: string[] = [];
  if (preferredAudio) candidates.push(String(preferredAudio.url));
  for (const s of usableAudio) {
    candidates.push(String(s.url));
  }

  // Fallback to combined progressive MP4 streams (exclude broken odycdn mirrors)
  if (Array.isArray(data.videoStreams)) {
    const videoStreams = data.videoStreams as Array<Record<string, unknown>>;
    for (const s of videoStreams) {
      const url = String(s.url || '');
      const mime = String(s.mimeType || '');
      if (
        url.startsWith('http') &&
        !s.videoOnly &&
        mime.includes('mp4') &&
        !url.includes('odycdn.com')
      ) {
        candidates.push(url);
      }
    }
  }

  const verifiedUrl = await pickFirstPlayableUrl(candidates);
  if (!verifiedUrl) throw new Error('No playable CORS stream from Piped');

  const dur = typeof data.duration === 'number' && data.duration > 0 ? data.duration : undefined;

  return {
    url: verifiedUrl,
    duration: dur,
    resolvedAt: Date.now(),
  };
}

async function tryInvidiousInstance(instance: string, videoId: string): Promise<ResolvedAudioStream> {
  const data = await fetchJsonWithTimeout(
    `${instance}/api/v1/videos/${encodeURIComponent(videoId)}`,
    4500
  );
  const formats = Array.isArray(data.adaptiveFormats)
    ? (data.adaptiveFormats as Array<Record<string, unknown>>)
    : [];

  const audioFormats = formats
    .filter((f) => String(f.type || '').startsWith('audio/') && f.itag)
    .sort((a, b) => {
      const aMp4 = String(a.type || '').includes('mp4') ? 1 : 0;
      const bMp4 = String(b.type || '').includes('mp4') ? 1 : 0;
      if (aMp4 !== bMp4) return bMp4 - aMp4;
      return Number(b.bitrate || 0) - Number(a.bitrate || 0);
    });

  if (!audioFormats.length) throw new Error('No audio adaptiveFormats');
  const chosen = audioFormats.find((f) => Number(f.bitrate || 0) <= 192000) || audioFormats[0];
  const dur = typeof data.lengthSeconds === 'number' && data.lengthSeconds > 0 ? data.lengthSeconds : undefined;

  const proxiedUrl = `${instance}/latest_version?id=${encodeURIComponent(
    videoId
  )}&itag=${encodeURIComponent(String(chosen.itag))}&local=true`;

  const verifiedUrl = await pickFirstPlayableUrl([proxiedUrl]);
  if (!verifiedUrl) throw new Error('Invidious local proxy rejected CORS probe');

  return {
    url: verifiedUrl,
    duration: dur,
    resolvedAt: Date.now(),
  };
}

async function getDynamicPipedInstances(): Promise<string[]> {
  if (cachedDynamicPipedHosts) return cachedDynamicPipedHosts;
  try {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 3500);
    const res = await fetch(
      'https://raw.githubusercontent.com/TeamPiped/documentation/main/content/docs/public-instances/index.md',
      { signal: controller.signal }
    );
    window.clearTimeout(timer);
    if (!res.ok) return [];
    const md = await res.text();
    const matches = md.match(/https:\/\/[a-zA-Z0-9.-]+/g) || [];
    const known = new Set(PIPED_INSTANCES);
    const extra = Array.from(new Set(matches)).filter(
      (u) =>
        !known.has(u) &&
        !u.includes('github.com') &&
        !u.includes('piped.video') &&
        !u.includes('shields.io')
    );
    cachedDynamicPipedHosts = extra;
    return extra;
  } catch {
    return [];
  }
}

async function tryBackendResolve(videoId: string): Promise<{
  stream: ResolvedAudioStream | null;
  requiresLogin: boolean;
}> {
  const hasBackend = await checkBackendAvailable();
  if (!hasBackend) return { stream: null, requiresLogin: false };

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 14000);
  try {
    const res = await fetch(`./api/youtube/resolve?v=${encodeURIComponent(videoId)}`, {
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!res.ok) return { stream: null, requiresLogin: false };
    const data = (await res.json()) as {
      ok?: boolean;
      streamUrl?: string;
      duration?: number;
      reason?: string;
    };
    if (data?.ok && data.streamUrl) {
      const normalizedUrl = data.streamUrl.startsWith('/') ? `.${data.streamUrl}` : data.streamUrl;
      return {
        stream: {
          url: normalizedUrl,
          duration: typeof data.duration === 'number' && data.duration > 0 ? data.duration : undefined,
          resolvedAt: Date.now(),
          isBackendStream: true,
        },
        requiresLogin: false,
      };
    }
    return {
      stream: null,
      requiresLogin: data?.reason === 'LOGIN_REQUIRED',
    };
  } catch {
    return { stream: null, requiresLogin: false };
  } finally {
    window.clearTimeout(timer);
  }
}

export async function resolveYouTubeAudioStream(
  videoId: string
): Promise<ResolvedAudioStream | null> {
  const cached = ytAudioStreamCache.get(videoId);
  if (cached && cached.url && Date.now() - cached.resolvedAt < 15 * 60 * 1000) {
    return cached;
  }

  // 1. Prefer same-origin server stream (/api/youtube/resolve -> /api/youtube/stream)
  const backendResult = await tryBackendResolve(videoId);
  if (backendResult.stream) {
    ytAudioStreamCache.set(videoId, backendResult.stream);
    return backendResult.stream;
  }

  // 2. Fallback to public Piped / Invidious CORS bridges (static hosting / offline server)
  try {
    const first = await Promise.any([
      ...PIPED_INSTANCES.map((inst) => tryPipedInstance(inst, videoId)),
      ...INVIDIOUS_INSTANCES.map((inst) => tryInvidiousInstance(inst, videoId)),
    ]);
    ytAudioStreamCache.set(videoId, first);
    return first;
  } catch {
    const extras = await getDynamicPipedInstances();
    if (extras.length > 0) {
      try {
        const recovered = await Promise.any(
          extras.slice(0, 8).map((inst) => tryPipedInstance(inst, videoId))
        );
        ytAudioStreamCache.set(videoId, recovered);
        return recovered;
      } catch {
        // return login marker if backend requested login
      }
    }
    if (backendResult.requiresLogin) {
      return {
        url: '',
        resolvedAt: Date.now(),
        requiresLogin: true,
      };
    }
    return null;
  }
}

export function formatDuration(seconds?: number): string {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return '--:--';
  const total = Math.floor(seconds);
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}
