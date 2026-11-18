import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import { spawn } from 'child_process';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { Readable } from 'stream';
import { fileURLToPath } from 'url';
import { JSDOM } from 'jsdom';
import { BotGuardClient, getChallenge } from 'bgutils-js/botguard';
import { WebPoMinter } from 'bgutils-js/webpo';
import { buildURL, getHeaders } from 'bgutils-js/utils';
import { SabrStream } from 'googlevideo/sabr-stream';
import { buildSabrFormat, EnabledTrackTypes } from 'googlevideo/utils';
import type { SabrFormat } from 'googlevideo/shared-types';
import { Constants, Innertube, Platform, UniversalCache } from 'youtubei.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

const YT_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;
const CACHE_DIR = path.join(process.cwd(), '.yt-cache');
const OAUTH_FILE = path.join(CACHE_DIR, 'oauth.json');
const STREAMS_DIR = path.join(CACHE_DIR, 'streams');
const INTROS_DIR = path.join(CACHE_DIR, 'intros');
const MAX_STREAMS_CACHE_BYTES = 250 * 1024 * 1024; // 250 MB LRU cap on full streamed tracks
const MAX_INTROS_CACHE_BYTES = 64 * 1024 * 1024; // 64 MB LRU cap on cached MP3 intros

// Enable YouTube.js URL/signature/n-param deciphering on Node
Platform.shim.eval = async (data, env) => {
  const properties: string[] = [];
  if (env.n) {
    properties.push(`n: exportedVars.nFunction(${JSON.stringify(env.n)})`);
  }
  if (env.sig) {
    properties.push(`sig: exportedVars.sigFunction(${JSON.stringify(env.sig)})`);
  }
  const code = `${data.output}\nreturn { ${properties.join(', ')} }`;
  return new Function(code)();
};

type ClientName = 'IOS' | 'MWEB' | 'ANDROID_VR' | 'ANDROID' | 'TV' | 'WEB';

const CLIENT_REQUEST_HEADERS: Record<ClientName, Record<string, string>> = {
  IOS: {
    'User-Agent':
      'com.google.ios.youtube/19.29.1 (iPhone16,2; U; CPU iOS 17_5_1 like Mac OS X)',
  },
  MWEB: {
    'User-Agent':
      'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
    Referer: 'https://m.youtube.com/',
    Origin: 'https://m.youtube.com',
  },
  ANDROID_VR: {
    'User-Agent':
      'com.google.android.apps.youtube.vr.oculus/1.57.29 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip',
  },
  ANDROID: {
    'User-Agent':
      'com.google.android.youtube/19.29.37 (Linux; U; Android 14; en_US; Pixel 7) gzip',
  },
  TV: {
    'User-Agent': 'Mozilla/5.0 (ChromiumStylePlatform) Cobalt/Version',
    Referer: 'https://www.youtube.com/tv',
    Origin: 'https://www.youtube.com',
  },
  WEB: {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    Referer: 'https://www.youtube.com/',
    Origin: 'https://www.youtube.com',
  },
};

interface DirectSource {
  kind: 'direct';
  url: string;
  mimeType: string;
  duration?: number;
  contentLength?: number;
  headers: Record<string, string>;
  sourceLabel: string;
  resolvedAt: number;
}

interface SabrSource {
  kind: 'sabr';
  videoId: string;
  client: ClientName;
  useAuth: boolean;
  serverAbrStreamingUrl: string;
  videoPlaybackUstreamerConfig: string;
  sabrFormats: SabrFormat[];
  clientInfo: {
    clientName: number;
    clientVersion: string;
  };
  poToken?: string;
  mimeType: string;
  duration?: number;
  estimatedContentLength?: number;
  sourceLabel: string;
  resolvedAt: number;
}

type ResolvedSource = DirectSource | SabrSource;

interface ResolveOutcome {
  ok: boolean;
  source?: ResolvedSource;
  reason?: 'LOGIN_REQUIRED' | 'UNAVAILABLE';
  message?: string;
}

interface PoTokenState {
  visitorData: string;
  sessionPoToken: string;
  minter: WebPoMinter;
  expiresAt: number;
}

interface AuthPendingInfo {
  verificationUrl: string;
  userCode: string;
  expiresAt: number;
}

interface SabrDownloadJob {
  videoId: string;
  filePath: string;
  partPath: string;
  bytesWritten: number;
  totalSize: number;
  estimatedSize?: number;
  activeReaders: number;
  complete: boolean;
  error: Error | null;
  lastActivityAt: number;
  sabr: SabrStream | null;
  waiters: Set<() => void>;
}

const STREAM_TTL_MS = 90 * 60 * 1000;
const resolvedCache = new Map<string, ResolvedSource>();
const inFlightResolves = new Map<string, Promise<ResolveOutcome>>();
const sabrJobs = new Map<string, SabrDownloadJob>();
const inFlightIntros = new Map<string, Promise<string | null>>();

let anonInnertubePromise: Promise<Innertube> | null = null;
let authInnertube: Innertube | null = null;
let authInitPromise: Promise<void> | null = null;
let poTokenState: PoTokenState | null = null;
let poTokenPromise: Promise<PoTokenState | null> | null = null;
let jsdomInstalled = false;

let pendingAuth: AuthPendingInfo | null = null;
let pendingAuthError: string | null = null;
let authSignInInFlight = false;

function ensureCacheDirs(): void {
  for (const dir of [CACHE_DIR, STREAMS_DIR, INTROS_DIR]) {
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    } catch {
      // ignore read-only fs errors
    }
  }
}

function cleanupStalePartFiles(): void {
  try {
    ensureCacheDirs();
    for (const dir of [STREAMS_DIR, INTROS_DIR]) {
      const files = fs.readdirSync(dir);
      for (const f of files) {
        if (f.includes('.part')) {
          try {
            fs.unlinkSync(path.join(dir, f));
          } catch {
            // ignore
          }
        }
      }
    }
  } catch {
    // ignore
  }
}

async function pruneDirByLru(
  dirPath: string,
  maxTotalBytes: number,
  skipNames: Set<string> = new Set()
): Promise<void> {
  try {
    const entries = await fsp.readdir(dirPath);
    const stats: Array<{ fullPath: string; size: number; mtimeMs: number }> = [];
    let total = 0;

    for (const name of entries) {
      if (skipNames.has(name) || name.includes('.part')) continue;
      const fullPath = path.join(dirPath, name);
      try {
        const st = await fsp.stat(fullPath);
        if (st.isFile()) {
          total += st.size;
          stats.push({ fullPath, size: st.size, mtimeMs: st.mtimeMs });
        }
      } catch {
        // ignore vanished file
      }
    }

    if (total <= maxTotalBytes) return;
    stats.sort((a, b) => a.mtimeMs - b.mtimeMs);
    for (const item of stats) {
      if (total <= maxTotalBytes * 0.82) break;
      try {
        await fsp.unlink(item.fullPath);
        total -= item.size;
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }
}

function createSafeCache(): UniversalCache {
  try {
    ensureCacheDirs();
    return new UniversalCache(true, CACHE_DIR);
  } catch {
    return new UniversalCache(false);
  }
}

function loadSavedOAuth(): Record<string, unknown> | null {
  try {
    if (process.env.YOUTUBE_OAUTH_JSON) {
      return JSON.parse(process.env.YOUTUBE_OAUTH_JSON) as Record<string, unknown>;
    }
    if (fs.existsSync(OAUTH_FILE)) {
      const raw = fs.readFileSync(OAUTH_FILE, 'utf-8');
      return JSON.parse(raw) as Record<string, unknown>;
    }
  } catch {
    // ignore corrupted cache
  }
  return null;
}

function saveOAuthCredentials(credentials: unknown): void {
  try {
    ensureCacheDirs();
    fs.writeFileSync(OAUTH_FILE, JSON.stringify(credentials), 'utf-8');
  } catch {
    // Read-only filesystem fallback: keep in memory on active Innertube session
  }
}

function clearSavedOAuth(): void {
  try {
    if (fs.existsSync(OAUTH_FILE)) {
      fs.unlinkSync(OAUTH_FILE);
    }
  } catch {
    // ignore
  }
}

async function getAnonInnertube(): Promise<Innertube> {
  if (!anonInnertubePromise) {
    anonInnertubePromise = Innertube.create({
      cache: createSafeCache(),
      generate_session_locally: true,
    }).catch((err) => {
      anonInnertubePromise = null;
      throw err;
    });
  }
  return anonInnertubePromise;
}

async function ensureAuthRestored(): Promise<void> {
  if (authInnertube) return;
  if (authInitPromise) return authInitPromise;

  authInitPromise = (async () => {
    const saved = loadSavedOAuth();
    if (!saved) return;
    try {
      const yt = await Innertube.create({
        cache: createSafeCache(),
      });
      yt.session.on('update-credentials', ({ credentials }) => {
        saveOAuthCredentials(credentials);
      });
      await yt.session.signIn(saved as never);
      if (yt.session.logged_in) {
        authInnertube = yt;
      }
    } catch {
      clearSavedOAuth();
      authInnertube = null;
    }
  })();

  await authInitPromise;
}

function installJsdomForBotGuard(): void {
  if (jsdomInstalled) return;
  const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', {
    url: 'https://www.youtube.com/',
    pretendToBeVisual: true,
  });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    location: dom.window.document.location,
    origin: dom.window.origin,
  });
  if (!globalThis.navigator) {
    Object.defineProperty(globalThis, 'navigator', {
      value: dom.window.navigator,
      configurable: true,
    });
  }
  jsdomInstalled = true;
}

async function getPoTokenState(): Promise<PoTokenState | null> {
  if (poTokenState && Date.now() < poTokenState.expiresAt) {
    return poTokenState;
  }
  if (poTokenPromise) return poTokenPromise;

  poTokenPromise = (async () => {
    try {
      installJsdomForBotGuard();
      const baseYt = await getAnonInnertube();
      const visitorData = baseYt.session.context.client.visitorData || '';
      const requestKey = 'O43z0dpjhgX20SCx4KAo';

      const challenge = await getChallenge({
        requestKey,
        fetchFunction: fetch,
        useYouTubeAPI: true,
      });

      const interpreterJs =
        challenge.interpreterJavascript?.privateDoNotAccessOrElseSafeScriptWrappedValue;
      if (!interpreterJs || !challenge.globalName || !challenge.program) {
        return null;
      }

      new Function(interpreterJs)();

      const bg = await BotGuardClient.create({
        globalName: challenge.globalName,
        globalObject: globalThis,
        program: challenge.program,
      });

      const webPoSignalOutput: Array<
        ((buffer: Uint8Array) => Promise<(cb: Uint8Array) => Promise<Uint8Array | undefined>>) | undefined
      > = [];
      const botguardResponse = await bg.snapshot({ webPoSignalOutput });

      const itRes = await fetch(buildURL('GenerateIT', true), {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify([requestKey, botguardResponse]),
        signal: AbortSignal.timeout(8000),
      });

      if (!itRes.ok) return null;
      const itJson = (await itRes.json()) as [string?, number?, number?, string?];
      if (!Array.isArray(itJson) || !itJson[0]) return null;

      const minter = await WebPoMinter.create(
        {
          integrityToken: itJson[0],
          estimatedTtlSecs: itJson[1],
          mintRefreshThreshold: itJson[2],
          websafeFallbackToken: itJson[3],
        },
        webPoSignalOutput
      );

      const sessionPoToken = await minter.mintAsWebsafeString(visitorData || 'Cg==');
      const ttlMs = Math.max(60 * 60 * 1000, ((itJson[1] || 21600) - 1800) * 1000);
      poTokenState = {
        visitorData,
        sessionPoToken,
        minter,
        expiresAt: Date.now() + ttlMs,
      };
      return poTokenState;
    } catch {
      return null;
    } finally {
      poTokenPromise = null;
    }
  })();

  return poTokenPromise;
}

async function probeUpstreamAudio(
  url: string,
  headers: Record<string, string>
): Promise<{ ok: boolean; mimeType?: string }> {
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        ...headers,
        Range: 'bytes=0-1023',
      },
      signal: AbortSignal.timeout(5000),
    });
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    try {
      await res.body?.cancel();
    } catch {
      // ignore
    }
    const validStatus = res.ok || res.status === 206;
    const validMedia =
      !ct.includes('text/html') &&
      !ct.includes('application/json') &&
      !ct.includes('text/plain');
    return { ok: validStatus && validMedia, mimeType: ct || undefined };
  } catch {
    return { ok: false };
  }
}

function getClientInfoForSession(yt: Innertube, client: ClientName): {
  clientName: number;
  clientVersion: string;
} {
  const clientNameIds = Constants.CLIENT_NAME_IDS as Record<string, string>;
  const sessionClientName = yt.session.context.client.clientName;
  const fallbackVersion = yt.session.context.client.clientVersion;

  if (client === 'TV') {
    return {
      clientName: Number(clientNameIds[sessionClientName] || clientNameIds.TVHTML5 || 7),
      clientVersion: fallbackVersion || '7.20250212.16.00',
    };
  }
  return {
    clientName: Number(clientNameIds[client] || clientNameIds[sessionClientName] || 1),
    clientVersion: fallbackVersion || '2.20250212.00.00',
  };
}

function createSabrStreamInstance(src: SabrSource): SabrStream {
  const ytRef = src.useAuth && authInnertube ? authInnertube : null;
  return new SabrStream({
    videoId: src.videoId,
    formats: src.sabrFormats,
    serverAbrStreamingUrl: src.serverAbrStreamingUrl,
    videoPlaybackUstreamerConfig: src.videoPlaybackUstreamerConfig,
    clientInfo: src.clientInfo,
    poToken: src.poToken,
    callbacks: {
      onReloadPlayerResponse: async () => {
        const yt = ytRef || (await getAnonInnertube());
        const fresh = await yt.getBasicInfo(src.videoId, {
          client: src.client,
          ...(src.poToken ? { po_token: src.poToken } : {}),
        } as never);
        const rawUrl = fresh.streaming_data?.server_abr_streaming_url;
        const freshUrl = rawUrl ? await yt.session.player?.decipher(rawUrl) : undefined;
        const freshCfg = (
          fresh.player_config as {
            media_common_config?: {
              media_ustreamer_request_config?: { video_playback_ustreamer_config?: string };
            };
          }
        )?.media_common_config?.media_ustreamer_request_config?.video_playback_ustreamer_config;
        if (!freshUrl || !freshCfg) {
          throw new Error('Failed to reload SABR streaming configuration');
        }
        src.serverAbrStreamingUrl = freshUrl;
        src.videoPlaybackUstreamerConfig = freshCfg;
        return {
          serverAbrStreamingUrl: freshUrl,
          videoPlaybackUstreamerConfig: freshCfg,
        };
      },
      onMintPoToken: src.poToken
        ? async () => Buffer.from(src.poToken!, 'base64url')
        : async () => {
            const po = await getPoTokenState();
            const token = po
              ? await po.minter.mintAsWebsafeString(src.videoId).catch(() => po.sessionPoToken)
              : '';
            return token ? Buffer.from(token, 'base64url') : new Uint8Array();
          },
    },
  });
}

async function startSabrFirstChunk(src: SabrSource): Promise<{
  sabr: SabrStream;
  reader: ReadableStreamDefaultReader<Uint8Array>;
  firstChunk: Uint8Array | null;
  mimeType: string;
  estimatedLength?: number;
}> {
  const sabr = createSabrStreamInstance(src);
  let fatalErr: Error | null = null;
  sabr.on('error', (err) => {
    fatalErr = err instanceof Error ? err : new Error(String(err));
  });

  const { audioStream, selectedFormats } = sabr.start({
    audioPreferences: {
      container: 'mp4',
      preferredAudioCodec: 'aac',
      quality: 'AUDIO_QUALITY_MEDIUM',
    },
    enabledTrackTypes: EnabledTrackTypes.AUDIO_ONLY,
    isPostLiveDvr: false,
    maxRetries: 6,
  });

  const reader = audioStream.getReader() as unknown as ReadableStreamDefaultReader<Uint8Array>;
  const firstRead = await Promise.race([
    reader.read(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('SABR first chunk timeout')), 7000)
    ),
  ]);

  if (fatalErr) {
    try {
      await reader.cancel();
    } catch {
      // ignore
    }
    try {
      await sabr.abort();
    } catch {
      // ignore
    }
    throw fatalErr;
  }

  const rawMime = String(selectedFormats.audioFormat.mimeType || 'audio/mp4')
    .split(';')[0]
    .trim();

  return {
    sabr,
    reader,
    firstChunk: firstRead.done ? null : firstRead.value,
    mimeType: rawMime.startsWith('audio/') ? rawMime : 'audio/mp4',
    estimatedLength: selectedFormats.audioFormat.contentLength,
  };
}

async function tryInnertubeClient(
  yt: Innertube,
  videoId: string,
  client: ClientName,
  useAuth: boolean,
  poToken?: string
): Promise<{
  source?: ResolvedSource;
  loginRequired?: boolean;
}> {
  try {
    const info = await yt.getBasicInfo(videoId, {
      client,
      ...(poToken ? { po_token: poToken } : {}),
    } as never);

    const status = info.playability_status?.status;
    const reason = String(info.playability_status?.reason || '');
    if (status === 'LOGIN_REQUIRED' || /confirm you.?re not a bot|sign in/i.test(reason)) {
      return { loginRequired: true };
    }
    if (status && status !== 'OK') {
      return {};
    }

    const duration =
      typeof info.basic_info?.duration === 'number' && info.basic_info.duration > 0
        ? info.basic_info.duration
        : undefined;

    const adaptive = info.streaming_data?.adaptive_formats || [];
    const progressive = info.streaming_data?.formats || [];

    const audioOnly = adaptive
      .filter((f) => f.has_audio && !f.has_video)
      .sort((a, b) => {
        const aMp4 = String(a.mime_type || '').includes('mp4') ? 1 : 0;
        const bMp4 = String(b.mime_type || '').includes('mp4') ? 1 : 0;
        if (aMp4 !== bMp4) return bMp4 - aMp4;
        return Number(b.bitrate || 0) - Number(a.bitrate || 0);
      });

    const preferredAudio = audioOnly.find((f) => Number(f.bitrate || 0) <= 192000);
    const orderedFormats = [
      ...(preferredAudio ? [preferredAudio] : []),
      ...audioOnly.filter((f) => f !== preferredAudio),
      ...progressive.filter((f) => f.has_audio),
    ];

    // Filter to formats that actually carry a decipherable direct HTTP URL
    const directCandidates = orderedFormats.filter((f) => {
      const rec = f as unknown as {
        url?: string;
        signature_cipher?: string;
        cipher?: string;
      };
      return Boolean(rec.url || rec.signature_cipher || rec.cipher);
    });

    const headers = CLIENT_REQUEST_HEADERS[client] || CLIENT_REQUEST_HEADERS.WEB;
    for (const fmt of directCandidates.slice(0, 4)) {
      const decipheredUrl = await fmt.decipher(yt.session.player);
      if (!decipheredUrl || !decipheredUrl.startsWith('http')) continue;

      const probe = await probeUpstreamAudio(decipheredUrl, headers);
      if (!probe.ok) continue;

      const rawMime = String(fmt.mime_type || probe.mimeType || 'audio/mp4')
        .split(';')[0]
        .trim();

      return {
        source: {
          kind: 'direct',
          url: decipheredUrl,
          mimeType:
            rawMime.startsWith('audio/') || rawMime.startsWith('video/')
              ? rawMime
              : 'audio/mp4',
          duration,
          contentLength: typeof fmt.content_length === 'number' ? fmt.content_length : undefined,
          headers,
          sourceLabel: `innertube-${client.toLowerCase()}`,
          resolvedAt: Date.now(),
        },
      };
    }

    // Try SABR streaming protocol (used by YouTube TV & newer YouTube clients)
    const rawAbrUrl = info.streaming_data?.server_abr_streaming_url;
    const ustreamerConfig = (
      info.player_config as {
        media_common_config?: {
          media_ustreamer_request_config?: { video_playback_ustreamer_config?: string };
        };
      }
    )?.media_common_config?.media_ustreamer_request_config?.video_playback_ustreamer_config;

    if (rawAbrUrl && ustreamerConfig && adaptive.length > 0) {
      const decipheredAbrUrl = await yt.session.player?.decipher(rawAbrUrl);
      if (decipheredAbrUrl && decipheredAbrUrl.startsWith('http')) {
        const sabrFormats = adaptive.map((f) => buildSabrFormat(f as never));
        const audioSabr = sabrFormats.filter((f) => f.mimeType?.startsWith('audio/'));
        if (audioSabr.length > 0) {
          const estimated =
            audioSabr.find((f) => f.mimeType?.includes('mp4'))?.contentLength ||
            audioSabr[0].contentLength;
          const sabrSource: SabrSource = {
            kind: 'sabr',
            videoId,
            client,
            useAuth,
            serverAbrStreamingUrl: decipheredAbrUrl,
            videoPlaybackUstreamerConfig: ustreamerConfig,
            sabrFormats,
            clientInfo: getClientInfoForSession(yt, client),
            poToken,
            mimeType: 'audio/mp4',
            duration,
            estimatedContentLength: typeof estimated === 'number' ? estimated : undefined,
            sourceLabel: `sabr-${client.toLowerCase()}`,
            resolvedAt: Date.now(),
          };

          // For anonymous clients verify first chunk actually flows; authenticated TV works immediately
          if (!useAuth) {
            try {
              const test = await startSabrFirstChunk(sabrSource);
              try {
                await test.reader.cancel();
              } catch {
                // ignore
              }
              try {
                await test.sabr.abort();
              } catch {
                // ignore
              }
              if (!test.firstChunk || test.firstChunk.byteLength === 0) {
                return {};
              }
              sabrSource.mimeType = test.mimeType;
            } catch {
              return {};
            }
          }

          return { source: sabrSource };
        }
      }
    }

    return {};
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (/LOGIN_REQUIRED|not a bot/i.test(msg)) {
      return { loginRequired: true };
    }
    return {};
  }
}

const SERVER_PIPED_HOSTS = [
  'https://api.piped.private.coffee',
  'https://pipedapi.ducks.party',
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.adminforge.de',
  'https://pipedapi.leptons.xyz',
];

async function tryServerRelayFallback(videoId: string): Promise<DirectSource | null> {
  const tryPiped = async (host: string): Promise<DirectSource> => {
    const r = await fetch(`${host}/streams/${encodeURIComponent(videoId)}`, {
      signal: AbortSignal.timeout(4500),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = (await r.json()) as {
      duration?: number;
      audioStreams?: Array<{ url?: string; mimeType?: string; bitrate?: number }>;
    };
    const streams = Array.isArray(data.audioStreams) ? data.audioStreams : [];
    const sorted = streams
      .filter((s) => typeof s.url === 'string' && s.url.startsWith('http'))
      .sort((a, b) => {
        const aMp4 = String(a.mimeType || '').includes('mp4') ? 1 : 0;
        const bMp4 = String(b.mimeType || '').includes('mp4') ? 1 : 0;
        if (aMp4 !== bMp4) return bMp4 - aMp4;
        return Number(b.bitrate || 0) - Number(a.bitrate || 0);
      });

    for (const s of sorted.slice(0, 3)) {
      const candidateUrl = String(s.url);
      const probe = await probeUpstreamAudio(candidateUrl, {});
      if (probe.ok) {
        return {
          kind: 'direct',
          url: candidateUrl,
          mimeType: String(s.mimeType || probe.mimeType || 'audio/mp4')
            .split(';')[0]
            .trim(),
          duration:
            typeof data.duration === 'number' && data.duration > 0 ? data.duration : undefined,
          headers: {},
          sourceLabel: 'piped-relay',
          resolvedAt: Date.now(),
        };
      }
    }
    throw new Error('No working audio stream');
  };

  try {
    return await Promise.any(SERVER_PIPED_HOSTS.map((h) => tryPiped(h)));
  } catch {
    return null;
  }
}

async function resolveYouTubeSource(
  videoId: string,
  forceRefresh = false
): Promise<ResolveOutcome> {
  if (!forceRefresh) {
    const cached = resolvedCache.get(videoId);
    if (cached && Date.now() - cached.resolvedAt < STREAM_TTL_MS) {
      return { ok: true, source: cached };
    }
  } else {
    resolvedCache.delete(videoId);
  }

  const existing = inFlightResolves.get(videoId);
  if (existing && !forceRefresh) {
    return existing;
  }

  const task = (async (): Promise<ResolveOutcome> => {
    await ensureAuthRestored();

    let sawLoginRequired = false;

    // 1. Authenticated YouTube TV session (supports SABR & bypasses bot blocks cleanly)
    if (authInnertube && authInnertube.session.logged_in) {
      const po = await getPoTokenState();
      const vidPo = po
        ? await po.minter.mintAsWebsafeString(videoId).catch(() => undefined)
        : undefined;
      for (const client of ['TV'] as ClientName[]) {
        const attempt = await tryInnertubeClient(authInnertube, videoId, client, true, vidPo);
        if (attempt.source) {
          resolvedCache.set(videoId, attempt.source);
          return { ok: true, source: attempt.source };
        }
        if (attempt.loginRequired) sawLoginRequired = true;
      }
    }

    // 2. Anonymous Innertube + BotGuard PoToken across multiple device profiles (direct + SABR)
    try {
      const po = await getPoTokenState();
      const yt = po
        ? await Innertube.create({
            cache: createSafeCache(),
            po_token: po.sessionPoToken,
            visitor_data: po.visitorData,
          })
        : await getAnonInnertube();

      const vidPo = po
        ? await po.minter.mintAsWebsafeString(videoId).catch(() => undefined)
        : undefined;
      for (const client of ['IOS', 'MWEB', 'ANDROID_VR', 'ANDROID', 'TV', 'WEB'] as ClientName[]) {
        const attempt = await tryInnertubeClient(yt, videoId, client, false, vidPo);
        if (attempt.source) {
          resolvedCache.set(videoId, attempt.source);
          return { ok: true, source: attempt.source };
        }
        if (attempt.loginRequired) sawLoginRequired = true;
      }
    } catch {
      // fall through to relays
    }

    // 3. Server-side Piped relay sweep
    const relaySource = await tryServerRelayFallback(videoId);
    if (relaySource) {
      resolvedCache.set(videoId, relaySource);
      return { ok: true, source: relaySource };
    }

    if (sawLoginRequired) {
      return {
        ok: false,
        reason: 'LOGIN_REQUIRED',
        message:
          'YouTube pide confirmar sesión en este servidor para extraer el audio filtrable.',
      };
    }

    return {
      ok: false,
      reason: 'UNAVAILABLE',
      message: 'No se pudo obtener una pista de audio directa para este vídeo.',
    };
  })();

  inFlightResolves.set(videoId, task);
  try {
    return await task;
  } finally {
    inFlightResolves.delete(videoId);
  }
}

function notifyJobWaiters(job: SabrDownloadJob): void {
  for (const w of job.waiters) {
    try {
      w();
    } catch {
      // ignore
    }
  }
  job.waiters.clear();
}

function waitForJobEvent(job: SabrDownloadJob, signal: AbortSignal): Promise<void> {
  if (signal.aborted || job.complete || job.error) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      job.waiters.delete(done);
      signal.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, 1000);
    job.waiters.add(done);
    signal.addEventListener('abort', done, { once: true });
  });
}

async function getOrStartSabrDownloadJob(src: SabrSource): Promise<SabrDownloadJob> {
  ensureCacheDirs();
  const filePath = path.join(STREAMS_DIR, `${src.videoId}.m4a`);

  // Check if complete cached file already exists on disk
  try {
    const st = await fsp.stat(filePath);
    if (st.isFile() && st.size > 16_000) {
      await fsp.utimes(filePath, new Date(), new Date()).catch(() => {});
      return {
        videoId: src.videoId,
        filePath,
        partPath: filePath,
        bytesWritten: st.size,
        totalSize: st.size,
        activeReaders: 0,
        complete: true,
        error: null,
        lastActivityAt: Date.now(),
        sabr: null,
        waiters: new Set(),
      };
    }
  } catch {
    // not cached yet
  }

  const existing = sabrJobs.get(src.videoId);
  if (existing && !existing.error) {
    existing.lastActivityAt = Date.now();
    return existing;
  }

  const partPath = path.join(STREAMS_DIR, `${src.videoId}.${Date.now()}.m4a.part`);
  const job: SabrDownloadJob = {
    videoId: src.videoId,
    filePath,
    partPath,
    bytesWritten: 0,
    totalSize: 0,
    estimatedSize: src.estimatedContentLength,
    activeReaders: 0,
    complete: false,
    error: null,
    lastActivityAt: Date.now(),
    sabr: null,
    waiters: new Set(),
  };
  sabrJobs.set(src.videoId, job);

  // Run sequential SABR download in background with idle watchdog
  (async () => {
    let fh: fsp.FileHandle | null = null;
    let idleCheckTimer: ReturnType<typeof setInterval> | null = null;
    try {
      const started = await startSabrFirstChunk(src);
      job.sabr = started.sabr;
      if (started.estimatedLength) {
        job.estimatedSize = started.estimatedLength;
      }

      fh = await fsp.open(partPath, 'w');
      let idleAborted = false;

      idleCheckTimer = setInterval(() => {
        if (job.complete) return;
        const idleLimit = job.activeReaders > 0 ? 45_000 : 8_000;
        if (Date.now() - job.lastActivityAt > idleLimit) {
          idleAborted = true;
          started.reader.cancel().catch(() => {});
          started.sabr.abort().catch(() => {});
        }
      }, 3000);

      if (started.firstChunk && started.firstChunk.byteLength > 0) {
        const buf = Buffer.from(
          started.firstChunk.buffer,
          started.firstChunk.byteOffset,
          started.firstChunk.byteLength
        );
        await fh.write(buf, 0, buf.length, job.bytesWritten);
        job.bytesWritten += buf.length;
        notifyJobWaiters(job);
      }

      while (!idleAborted) {
        const { done, value } = await started.reader.read();
        if (done) break;
        if (value && value.byteLength > 0) {
          const buf = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
          await fh.write(buf, 0, buf.length, job.bytesWritten);
          job.bytesWritten += buf.length;
          notifyJobWaiters(job);
        }
      }

      await fh.close();
      fh = null;

      if (idleAborted || job.bytesWritten < 4096) {
        throw new Error(idleAborted ? 'Stream download idle timeout' : 'Empty SABR stream');
      }

      await fsp.rename(partPath, filePath);
      job.totalSize = job.bytesWritten;
      job.complete = true;
      notifyJobWaiters(job);
      pruneDirByLru(STREAMS_DIR, MAX_STREAMS_CACHE_BYTES);
    } catch (err) {
      if (fh) {
        await fh.close().catch(() => {});
        fh = null;
      }
      await fsp.unlink(partPath).catch(() => {});
      job.error = err instanceof Error ? err : new Error('SABR download failed');
      notifyJobWaiters(job);
    } finally {
      if (idleCheckTimer) clearInterval(idleCheckTimer);
      job.sabr = null;
      // Keep job handle briefly so readers catch completion/error, then rely on complete file on disk
      setTimeout(() => {
        if (sabrJobs.get(src.videoId) === job) {
          sabrJobs.delete(src.videoId);
        }
      }, 5000);
    }
  })();

  return job;
}

function parseByteRange(
  rangeHeader: string,
  knownTotal?: number
): { start: number; end?: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
  if (!match) return null;
  const rawStart = match[1];
  const rawEnd = match[2];

  if (!rawStart && !rawEnd) return null;
  if (!rawStart && rawEnd && knownTotal !== undefined) {
    const suffix = Number(rawEnd);
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    return {
      start: Math.max(0, knownTotal - suffix),
      end: knownTotal - 1,
    };
  }
  if (!rawStart) return null;
  const start = Number(rawStart);
  const end = rawEnd ? Number(rawEnd) : undefined;
  if (!Number.isFinite(start) || start < 0) return null;
  if (end !== undefined && (!Number.isFinite(end) || end < start)) return null;
  return { start, end };
}

async function handleSabrHttpStream(
  req: Request,
  res: Response,
  src: SabrSource
): Promise<void> {
  const controller = new AbortController();
  const onClose = () => {
    try {
      controller.abort();
    } catch {
      // ignore
    }
  };
  req.on('close', onClose);

  let fd: fsp.FileHandle | null = null;
  let trackedJob: SabrDownloadJob | null = null;

  try {
    let job = await getOrStartSabrDownloadJob(src);
    trackedJob = job;
    trackedJob.activeReaders += 1;

    // Wait for first bytes or completion (max 10s)
    const waitDeadline = Date.now() + 10_000;
    while (!job.complete && !job.error && job.bytesWritten === 0 && Date.now() < waitDeadline) {
      if (controller.signal.aborted) return;
      await waitForJobEvent(job, controller.signal);
    }

    if (job.error) {
      trackedJob.activeReaders = Math.max(0, trackedJob.activeReaders - 1);
      resolvedCache.delete(src.videoId);
      job = await getOrStartSabrDownloadJob(
        (await resolveYouTubeSource(src.videoId, true)).source as SabrSource
      );
      trackedJob = job;
      trackedJob.activeReaders += 1;
      const retryDeadline = Date.now() + 10_000;
      while (!job.complete && !job.error && job.bytesWritten === 0 && Date.now() < retryDeadline) {
        if (controller.signal.aborted) return;
        await waitForJobEvent(job, controller.signal);
      }
      if (job.error || (!job.complete && job.bytesWritten === 0)) {
        if (!res.headersSent) res.status(502).json({ error: 'SABR stream unavailable' });
        return;
      }
    }

    const rangeHeader = typeof req.headers.range === 'string' ? req.headers.range : undefined;

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', src.mimeType || 'audio/mp4');

    if (job.complete && job.totalSize > 0) {
      const total = job.totalSize;
      res.setHeader('Accept-Ranges', 'bytes');

      if (rangeHeader) {
        const parsed = parseByteRange(rangeHeader, total);
        if (!parsed || parsed.start >= total) {
          res.status(416).setHeader('Content-Range', `bytes */${total}`).end();
          return;
        }
        const start = parsed.start;
        const end = parsed.end !== undefined ? Math.min(total - 1, parsed.end) : total - 1;
        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
        res.setHeader('Content-Length', String(end - start + 1));

        if (req.method === 'HEAD') {
          res.end();
          return;
        }
        const rs = fs.createReadStream(job.filePath, { start, end });
        rs.on('error', () => res.end());
        rs.pipe(res);
        return;
      }

      res.status(200);
      res.setHeader('Content-Length', String(total));
      if (req.method === 'HEAD') {
        res.end();
        return;
      }
      const rs = fs.createReadStream(job.filePath);
      rs.on('error', () => res.end());
      rs.pipe(res);
      return;
    }

    // Active incremental SABR download
    const parsedRange = rangeHeader ? parseByteRange(rangeHeader) : null;
    const startOffset = parsedRange?.start ?? 0;
    const requestedEnd = parsedRange?.end;

    // Wait if client seeked ahead of what has downloaded so far
    while (
      !controller.signal.aborted &&
      !job.complete &&
      !job.error &&
      job.bytesWritten <= startOffset
    ) {
      job.lastActivityAt = Date.now();
      await waitForJobEvent(job, controller.signal);
    }

    if (controller.signal.aborted) return;

    // Re-check if job finished while waiting
    if (job.complete && job.totalSize > 0) {
      res.setHeader('Accept-Ranges', 'bytes');
      if (rangeHeader) {
        if (startOffset >= job.totalSize) {
          res.status(416).setHeader('Content-Range', `bytes */${job.totalSize}`).end();
          return;
        }
        const end =
          requestedEnd !== undefined ? Math.min(job.totalSize - 1, requestedEnd) : job.totalSize - 1;
        res.status(206);
        res.setHeader('Content-Range', `bytes ${startOffset}-${end}/${job.totalSize}`);
        res.setHeader('Content-Length', String(end - startOffset + 1));
        if (req.method === 'HEAD') {
          res.end();
          return;
        }
        const rs = fs.createReadStream(job.filePath, { start: startOffset, end });
        rs.on('error', () => res.end());
        rs.pipe(res);
        return;
      }
      res.status(200);
      res.setHeader('Content-Length', String(job.totalSize));
      if (req.method === 'HEAD') {
        res.end();
        return;
      }
      const rs = fs.createReadStream(job.filePath);
      rs.on('error', () => res.end());
      rs.pipe(res);
      return;
    }

    if (job.error) {
      if (!res.headersSent) res.status(502).end();
      return;
    }

    if (req.method === 'HEAD') {
      res.setHeader('Accept-Ranges', 'none');
      res.status(200).end();
      return;
    }

    // If startOffset === 0 and open-ended request (Range: bytes=0- or no Range), stream clean 200 chunked
    // If startOffset > 0 or explicit bounded end (Range: bytes=0-1), stream 206 once end is buffered
    if (startOffset === 0 && requestedEnd === undefined) {
      res.setHeader('Accept-Ranges', 'none');
      res.status(200);
    } else if (requestedEnd !== undefined) {
      while (
        !controller.signal.aborted &&
        !job.complete &&
        !job.error &&
        job.bytesWritten <= requestedEnd
      ) {
        job.lastActivityAt = Date.now();
        await waitForJobEvent(job, controller.signal);
      }
      if (controller.signal.aborted) return;
      const totalEstimate = job.complete
        ? job.totalSize
        : Math.max(job.estimatedSize || 0, job.bytesWritten, requestedEnd + 1);
      const boundedEnd = job.complete
        ? Math.min(job.totalSize - 1, requestedEnd)
        : requestedEnd;
      res.setHeader('Accept-Ranges', 'bytes');
      res.status(206);
      res.setHeader('Content-Range', `bytes ${startOffset}-${boundedEnd}/${totalEstimate}`);
      res.setHeader('Content-Length', String(boundedEnd - startOffset + 1));
    } else {
      const totalEstimate = Math.max(job.estimatedSize || 0, job.bytesWritten + 65536);
      res.setHeader('Accept-Ranges', 'bytes');
      res.status(206);
      res.setHeader('Content-Range', `bytes ${startOffset}-${totalEstimate - 1}/${totalEstimate}`);
    }

    let activePath = job.complete ? job.filePath : job.partPath;
    fd = await fsp.open(activePath, 'r');
    let offset = startOffset;

    while (!controller.signal.aborted) {
      const currentPath = job.complete ? job.filePath : job.partPath;
      if (currentPath !== activePath) {
        activePath = currentPath;
        await fd.close().catch(() => {});
        fd = await fsp.open(activePath, 'r');
      }

      const available = job.complete ? job.totalSize : job.bytesWritten;
      if (offset < available) {
        const limit =
          requestedEnd !== undefined
            ? Math.min(available - 1, requestedEnd) - offset + 1
            : available - offset;
        if (limit <= 0) break;
        const chunkLen = Math.min(65536, limit);
        const buf = Buffer.allocUnsafe(chunkLen);
        const { bytesRead } = await fd.read(buf, 0, chunkLen, offset);
        if (bytesRead > 0) {
          offset += bytesRead;
          job.lastActivityAt = Date.now();
          const slice = bytesRead === chunkLen ? buf : buf.subarray(0, bytesRead);
          const ok = res.write(slice);
          if (!ok) {
            await new Promise<void>((resolve) => {
              const finish = () => {
                res.off('drain', finish);
                controller.signal.removeEventListener('abort', finish);
                resolve();
              };
              res.once('drain', finish);
              controller.signal.addEventListener('abort', finish, { once: true });
            });
          }
          if (requestedEnd !== undefined && offset > requestedEnd) break;
          continue;
        }
      }

      if (job.complete) {
        if (offset >= job.totalSize) break;
        continue;
      }
      if (job.error) {
        break;
      }
      job.lastActivityAt = Date.now();
      await waitForJobEvent(job, controller.signal);
    }

    if (!res.writableEnded) {
      res.end();
    }
  } catch {
    if (!res.headersSent) {
      res.status(502).json({ error: 'Stream interrupted' });
    } else if (!res.writableEnded) {
      res.end();
    }
  } finally {
    req.off('close', onClose);
    if (trackedJob) {
      trackedJob.activeReaders = Math.max(0, trackedJob.activeReaders - 1);
      trackedJob.lastActivityAt = Date.now();
    }
    if (fd) {
      await fd.close().catch(() => {});
    }
  }
}

async function encodeIntroMp3FromBuffer(
  inputBuffer: Buffer,
  seconds: number,
  outputPath: string
): Promise<boolean> {
  return new Promise((resolve) => {
    const tmpOut = `${outputPath}.${Date.now()}.part.mp3`;
    const ff = spawn(
      'ffmpeg',
      [
        '-y',
        '-hide_banner',
        '-loglevel',
        'error',
        '-i',
        'pipe:0',
        '-t',
        String(seconds),
        '-vn',
        '-c:a',
        'libmp3lame',
        '-b:a',
        '128k',
        '-f',
        'mp3',
        tmpOut,
      ],
      { stdio: ['pipe', 'ignore', 'ignore'] }
    );

    ff.on('error', () => {
      fsp.unlink(tmpOut).catch(() => {});
      resolve(false);
    });
    ff.on('close', async (code) => {
      if (code === 0) {
        try {
          const st = await fsp.stat(tmpOut);
          if (st.size > 8_000) {
            await fsp.rename(tmpOut, outputPath);
            resolve(true);
            return;
          }
        } catch {
          // fall through
        }
      }
      await fsp.unlink(tmpOut).catch(() => {});
      resolve(false);
    });

    ff.stdin.on('error', () => {
      // ffmpeg may close stdin once it has enough frames for -t N
    });
    ff.stdin.end(inputBuffer);
  });
}

async function encodeIntroMp3FromUrl(
  inputUrl: string,
  headers: Record<string, string>,
  seconds: number,
  outputPath: string
): Promise<boolean> {
  return new Promise((resolve) => {
    const tmpOut = `${outputPath}.${Date.now()}.part.mp3`;
    const args: string[] = ['-y', '-hide_banner', '-loglevel', 'error'];
    const headerLines = Object.entries(headers)
      .filter(([k]) => k.toLowerCase() !== 'user-agent')
      .map(([k, v]) => `${k}: ${v}`)
      .join('\r\n');
    if (headers['User-Agent']) {
      args.push('-user_agent', headers['User-Agent']);
    }
    if (headerLines) {
      args.push('-headers', `${headerLines}\r\n`);
    }
    args.push(
      '-i',
      inputUrl,
      '-t',
      String(seconds),
      '-vn',
      '-c:a',
      'libmp3lame',
      '-b:a',
      '128k',
      '-f',
      'mp3',
      tmpOut
    );

    const ff = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'ignore'] });
    const killTimer = setTimeout(() => {
      try {
        ff.kill('SIGKILL');
      } catch {
        // ignore
      }
    }, 20_000);

    ff.on('error', () => {
      clearTimeout(killTimer);
      fsp.unlink(tmpOut).catch(() => {});
      resolve(false);
    });
    ff.on('close', async (code) => {
      clearTimeout(killTimer);
      if (code === 0) {
        try {
          const st = await fsp.stat(tmpOut);
          if (st.size > 8_000) {
            await fsp.rename(tmpOut, outputPath);
            resolve(true);
            return;
          }
        } catch {
          // fall through
        }
      }
      await fsp.unlink(tmpOut).catch(() => {});
      resolve(false);
    });
  });
}

async function getOrBuildYouTubeIntro(videoId: string, seconds: number): Promise<string | null> {
  ensureCacheDirs();
  const introPath = path.join(INTROS_DIR, `${videoId}_${seconds}.mp3`);

  try {
    const st = await fsp.stat(introPath);
    if (st.isFile() && st.size > 8_000) {
      await fsp.utimes(introPath, new Date(), new Date()).catch(() => {});
      return introPath;
    }
  } catch {
    // build it
  }

  const key = `${videoId}_${seconds}`;
  const inflight = inFlightIntros.get(key);
  if (inflight) return inflight;

  const task = (async (): Promise<string | null> => {
    try {
      // Fast path: if full audio stream is already cached locally, slice locally without hitting YouTube!
      const cachedStreamPath = path.join(STREAMS_DIR, `${videoId}.m4a`);
      try {
        const st = await fsp.stat(cachedStreamPath);
        if (st.isFile() && st.size > 32_000) {
          const ok = await encodeIntroMp3FromUrl(cachedStreamPath, {}, seconds, introPath);
          if (ok) {
            pruneDirByLru(INTROS_DIR, MAX_INTROS_CACHE_BYTES);
            return introPath;
          }
        }
      } catch {
        // not cached locally yet
      }

      const outcome = await resolveYouTubeSource(videoId, false);
      if (!outcome.ok || !outcome.source) return null;

      const src = outcome.source;
      if (src.kind === 'direct') {
        const ok = await encodeIntroMp3FromUrl(src.url, src.headers, seconds, introPath);
        if (ok) {
          pruneDirByLru(INTROS_DIR, MAX_INTROS_CACHE_BYTES);
          return introPath;
        }
        return null;
      }

      // For SABR source: download ONLY enough bytes (~350KB-750KB) for the requested intro duration!
      const targetBytes = Math.min(1_200_000, Math.max(360_000, (seconds + 4) * 32_000));
      const sabr = createSabrStreamInstance(src);
      const { audioStream } = sabr.start({
        audioPreferences: {
          container: 'mp4',
          preferredAudioCodec: 'aac',
          quality: 'AUDIO_QUALITY_MEDIUM',
        },
        enabledTrackTypes: EnabledTrackTypes.AUDIO_ONLY,
        isPostLiveDvr: false,
        maxRetries: 4,
      });

      const reader = audioStream.getReader() as unknown as ReadableStreamDefaultReader<Uint8Array>;
      const chunks: Buffer[] = [];
      let total = 0;

      const timeout = setTimeout(() => {
        reader.cancel().catch(() => {});
        sabr.abort().catch(() => {});
      }, 12_000);

      try {
        while (total < targetBytes) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value && value.byteLength > 0) {
            const buf = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
            chunks.push(buf);
            total += buf.length;
          }
        }
      } finally {
        clearTimeout(timeout);
        await reader.cancel().catch(() => {});
        await sabr.abort().catch(() => {});
      }

      if (total < 16_000) return null;
      const merged = Buffer.concat(chunks);
      const ok = await encodeIntroMp3FromBuffer(merged, seconds, introPath);
      if (ok) {
        pruneDirByLru(INTROS_DIR, MAX_INTROS_CACHE_BYTES);
        return introPath;
      }
      return null;
    } catch {
      return null;
    } finally {
      inFlightIntros.delete(key);
    }
  })();

  inFlightIntros.set(key, task);
  return task;
}

async function startServer(): Promise<void> {
  cleanupStalePartFiles();
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  app.get('/api/youtube/auth/status', async (_req: Request, res: Response) => {
    await ensureAuthRestored();
    const activePending =
      pendingAuth && Date.now() < pendingAuth.expiresAt ? pendingAuth : null;
    if (!activePending && pendingAuth) {
      pendingAuth = null;
    }
    res.json({
      available: true,
      authenticated: Boolean(authInnertube?.session.logged_in),
      pending: activePending,
      error: pendingAuthError,
    });
  });

  app.post('/api/youtube/auth/start', async (_req: Request, res: Response) => {
    await ensureAuthRestored();
    if (authInnertube?.session.logged_in) {
      res.json({
        authenticated: true,
        pending: null,
      });
      return;
    }

    if (pendingAuth && Date.now() < pendingAuth.expiresAt) {
      res.json({
        authenticated: false,
        pending: pendingAuth,
      });
      return;
    }

    if (authSignInInFlight) {
      res.json({
        authenticated: false,
        pending: pendingAuth,
      });
      return;
    }

    authSignInInFlight = true;
    pendingAuthError = null;

    try {
      const yt = await Innertube.create({
        cache: createSafeCache(),
      });

      const pendingPromise = new Promise<AuthPendingInfo>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('No se recibió código de verificación de YouTube a tiempo.'));
        }, 12000);

        yt.session.on('auth-pending', (data) => {
          clearTimeout(timeout);
          const info: AuthPendingInfo = {
            verificationUrl: data.verification_url || 'https://www.google.com/device',
            userCode: data.user_code,
            expiresAt: Date.now() + Math.max(60, data.expires_in || 1800) * 1000,
          };
          pendingAuth = info;
          resolve(info);
        });

        yt.session.on('auth', ({ credentials }) => {
          saveOAuthCredentials(credentials);
          authInnertube = yt;
          pendingAuth = null;
          pendingAuthError = null;
          authSignInInFlight = false;
          resolvedCache.clear();
        });

        yt.session.on('update-credentials', ({ credentials }) => {
          saveOAuthCredentials(credentials);
        });

        yt.session.on('auth-error', (err) => {
          clearTimeout(timeout);
          const msg = err instanceof Error ? err.message : 'Error al vincular YouTube.';
          pendingAuth = null;
          pendingAuthError = msg;
          authSignInInFlight = false;
          reject(new Error(msg));
        });
      });

      yt.session.signIn().catch((err) => {
        pendingAuthError = err instanceof Error ? err.message : 'Error en inicio de sesión';
        pendingAuth = null;
        authSignInInFlight = false;
      });

      const pending = await pendingPromise;
      res.json({
        authenticated: false,
        pending,
      });
    } catch (err) {
      authSignInInFlight = false;
      res.status(502).json({
        authenticated: false,
        error:
          err instanceof Error
            ? err.message
            : 'No se pudo iniciar la vinculación con YouTube.',
      });
    }
  });

  app.post('/api/youtube/auth/logout', async (_req: Request, res: Response) => {
    try {
      await authInnertube?.session.signOut();
    } catch {
      // ignore
    }
    authInnertube = null;
    pendingAuth = null;
    pendingAuthError = null;
    authSignInInFlight = false;
    clearSavedOAuth();
    resolvedCache.clear();
    res.json({ ok: true, authenticated: false });
  });

  app.get('/api/youtube/resolve', async (req: Request, res: Response) => {
    const videoId = String(req.query.v || '').trim();
    if (!YT_ID_REGEX.test(videoId)) {
      res.status(400).json({ ok: false, reason: 'INVALID_ID', message: 'ID de vídeo inválido.' });
      return;
    }

    const forceRefresh = req.query.refresh === '1';
    const outcome = await resolveYouTubeSource(videoId, forceRefresh);

    if (!outcome.ok || !outcome.source) {
      res.json({
        ok: false,
        reason: outcome.reason || 'UNAVAILABLE',
        authenticated: Boolean(authInnertube?.session.logged_in),
        message: outcome.message || 'No se pudo resolver el flujo de audio.',
      });
      return;
    }

    res.json({
      ok: true,
      streamUrl: `/api/youtube/stream?v=${encodeURIComponent(videoId)}`,
      duration: outcome.source.duration,
      mimeType: outcome.source.mimeType,
      source: outcome.source.sourceLabel,
      authenticated: Boolean(authInnertube?.session.logged_in),
    });
  });

  app.get('/api/youtube/intro', async (req: Request, res: Response) => {
    const videoId = String(req.query.v || '').trim();
    if (!YT_ID_REGEX.test(videoId)) {
      res.status(400).json({ error: 'Invalid video id' });
      return;
    }
    const rawSec = Number(req.query.seconds);
    const seconds = Number.isFinite(rawSec) ? Math.min(25, Math.max(2, Math.round(rawSec))) : 8;

    const introPath = await getOrBuildYouTubeIntro(videoId, seconds);
    if (!introPath) {
      res.status(404).json({ error: 'Intro audio unavailable' });
      return;
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.sendFile(introPath);
  });

  const handleStreamRequest = async (req: Request, res: Response): Promise<void> => {
    const videoId = String(req.query.v || '').trim();
    if (!YT_ID_REGEX.test(videoId)) {
      res.status(400).json({ error: 'Invalid video id' });
      return;
    }

    const forceRefresh = req.query.refresh === '1';
    let outcome = await resolveYouTubeSource(videoId, forceRefresh);
    if (!outcome.ok || !outcome.source) {
      res.status(outcome.reason === 'LOGIN_REQUIRED' ? 403 : 404).json({
        error: outcome.message || 'Audio stream unavailable',
        reason: outcome.reason || 'UNAVAILABLE',
      });
      return;
    }

    if (outcome.source.kind === 'sabr') {
      await handleSabrHttpStream(req, res, outcome.source);
      return;
    }

    const rangeHeader = req.headers.range;
    const controller = new AbortController();
    const onClose = () => {
      try {
        controller.abort();
      } catch {
        // ignore
      }
    };
    req.on('close', onClose);

    const fetchUpstream = async (src: DirectSource): Promise<globalThis.Response> => {
      const headers: Record<string, string> = { ...src.headers };
      if (rangeHeader) {
        headers.Range = rangeHeader;
      }
      return fetch(src.url, {
        method: req.method === 'HEAD' ? 'HEAD' : 'GET',
        headers,
        signal: controller.signal,
      });
    };

    try {
      let currentSource = outcome.source;
      let upstream = await fetchUpstream(currentSource);

      // If cached googlevideo URL expired (403/410), refresh once transparently
      if ((upstream.status === 403 || upstream.status === 410) && !forceRefresh) {
        try {
          await upstream.body?.cancel();
        } catch {
          // ignore
        }
        outcome = await resolveYouTubeSource(videoId, true);
        if (outcome.ok && outcome.source) {
          if (outcome.source.kind === 'sabr') {
            req.off('close', onClose);
            await handleSabrHttpStream(req, res, outcome.source);
            return;
          }
          currentSource = outcome.source;
          upstream = await fetchUpstream(currentSource);
        }
      }

      if (!upstream.ok && upstream.status !== 206) {
        res.status(upstream.status || 502).end();
        return;
      }

      res.status(upstream.status);
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Accept-Ranges', upstream.headers.get('accept-ranges') || 'bytes');
      res.setHeader(
        'Content-Type',
        upstream.headers.get('content-type') || currentSource.mimeType || 'audio/mp4'
      );

      const contentLength = upstream.headers.get('content-length');
      if (contentLength) {
        res.setHeader('Content-Length', contentLength);
      }
      const contentRange = upstream.headers.get('content-range');
      if (contentRange) {
        res.setHeader('Content-Range', contentRange);
      }

      if (req.method === 'HEAD' || !upstream.body) {
        res.end();
        return;
      }

      const nodeStream = Readable.fromWeb(upstream.body as never);
      nodeStream.on('error', () => {
        if (!res.headersSent) {
          res.status(502).end();
        } else {
          res.end();
        }
      });
      nodeStream.pipe(res);
    } catch (err) {
      if ((err as { name?: string })?.name !== 'AbortError' && !res.headersSent) {
        res.status(502).json({ error: 'Stream interrupted' });
      }
    } finally {
      req.off('close', onClose);
    }
  };

  app.get('/api/youtube/stream', handleStreamRequest);
  app.head('/api/youtube/stream', handleStreamRequest);

  app.use('/api', (_req: Request, res: Response) => {
    res.status(404).json({ error: 'API route not found' });
  });

  const resolvePublicBaseUrl = (req: Request): string => {
    const envUrl = process.env.APP_URL?.trim();
    if (envUrl) return envUrl.replace(/\/+$/, '');
    const protoHeader = req.headers['x-forwarded-proto'];
    const proto =
      typeof protoHeader === 'string'
        ? protoHeader.split(',')[0].trim()
        : req.protocol || 'https';
    const hostHeader = req.headers['x-forwarded-host'] || req.headers.host;
    const host = typeof hostHeader === 'string' ? hostHeader.split(',')[0].trim() : `localhost:${PORT}`;
    return `${proto}://${host}`;
  };

  app.get('/robots.txt', (req: Request, res: Response) => {
    const baseUrl = resolvePublicBaseUrl(req);
    res
      .type('text/plain; charset=utf-8')
      .send(`User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${baseUrl}/sitemap.xml\n`);
  });

  app.get('/sitemap.xml', (req: Request, res: Response) => {
    const baseUrl = resolvePublicBaseUrl(req);
    const lastMod = new Date().toISOString().split('T')[0];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${baseUrl}/</loc>
    <lastmod>${lastMod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
`;
    res.type('application/xml; charset=utf-8').send(xml);
  });

  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
        watch: process.env.DISABLE_HMR === 'true' ? null : {},
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Roll For Ambience server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
