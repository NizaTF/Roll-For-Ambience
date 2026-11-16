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
  lobo: 'wolf howl',
  dragon: 'dragon roar',
  dragón: 'dragon roar',
  flecha: 'arrow bow',
  arco: 'bow arrow',
  viento: 'wind howl',
  caballo: 'horse gallop',
  campana: 'church bell',
  puerta: 'door creak',
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
  mar: 'ocean waves',
  relampago: 'lightning thunder',
  relámpago: 'lightning thunder',
  taberna: 'tavern crowd',
  escudo: 'shield impact',
  hacha: 'axe swing',
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
