/// <reference lib="es2022" />

interface PrecacheEntry {
  url: string;
  revision?: string | null;
}

interface SWExtendableEvent extends Event {
  waitUntil: (promise: Promise<unknown>) => void;
}

interface SWFetchEvent extends SWExtendableEvent {
  request: Request;
  respondWith: (response: Response | Promise<Response>) => void;
}

interface SWMessageEvent extends SWExtendableEvent {
  data: unknown;
  ports: ReadonlyArray<MessagePort>;
}

interface SWGlobal {
  __WB_MANIFEST: Array<PrecacheEntry | string>;
  location: Location;
  clients: {
    claim: () => Promise<void>;
    matchAll: (options?: { type?: string; includeUncontrolled?: boolean }) => Promise<unknown[]>;
  };
  skipWaiting: () => Promise<void>;
  addEventListener: (
    type: string,
    listener: (event: never) => void
  ) => void;
}

declare global {
  interface Window {
    __WB_MANIFEST?: Array<PrecacheEntry | string>;
  }
}

const sw = self as unknown as SWGlobal;

const SHELL_CACHE = 'rfa-app-shell-v2';
const RUNTIME_ASSETS_CACHE = 'rfa-runtime-assets-v2';
const SFX_CACHE = 'rfa-sfx-audio-v1';
const MAX_SFX_ENTRIES = 45;
const MAX_SFX_BYTES = 3_500_000;

const MANIFEST_ENTRIES: Array<PrecacheEntry | string> = self.__WB_MANIFEST || [];

function normalizePrecacheUrl(entry: PrecacheEntry | string): string {
  const raw = typeof entry === 'string' ? entry : entry.url;
  return new URL(raw, sw.location.href).toString();
}

function isAudioStreamRequest(url: URL, request: Request): boolean {
  if (request.headers.has('range')) return true;
  if (url.pathname.endsWith('/api/youtube/stream')) return true;
  if (url.pathname.endsWith('/api/youtube/resolve')) return true;
  if (url.pathname.includes('/api/youtube/auth')) return true;
  if (url.pathname.endsWith('/api/health')) return true;
  if (request.destination === 'video') return true;
  // Long-form remote streaming endpoints (Audius full tracks, googlevideo)
  if (url.hostname.includes('audius.co') || url.hostname.includes('googlevideo.com')) {
    return true;
  }
  return false;
}

function isCacheableShortAudio(url: URL, request: Request): boolean {
  if (request.headers.has('range')) return false;
  if (url.pathname.endsWith('/api/youtube/intro')) return true;
  if (
    url.hostname.includes('wikimedia.org') &&
    /\.(mp3|ogg|oga|wav|m4a)(\?|$)/i.test(url.pathname)
  ) {
    return true;
  }
  if (
    request.destination === 'audio' &&
    /\.(mp3|ogg|oga|wav)(\?|$)/i.test(url.pathname) &&
    !url.pathname.endsWith('/api/youtube/stream')
  ) {
    return true;
  }
  return false;
}

async function trimCache(cacheName: string, maxEntries: number): Promise<void> {
  try {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    if (keys.length <= maxEntries) return;
    const excess = keys.slice(0, keys.length - maxEntries);
    await Promise.all(excess.map((req) => cache.delete(req)));
  } catch {
    // ignore cache trim errors
  }
}

async function cacheSmallAudioIfValid(
  cache: Cache,
  request: Request | string,
  response: Response
): Promise<void> {
  try {
    if (!response || response.status !== 200) return;
    const ct = (response.headers.get('content-type') || '').toLowerCase();
    if (ct.includes('text/html') || ct.includes('application/json')) return;
    const cl = Number(response.headers.get('content-length') || '0');
    if (cl > MAX_SFX_BYTES) return;
    await cache.put(request, response.clone());
    await trimCache(SFX_CACHE, MAX_SFX_ENTRIES);
  } catch {
    // ignore storage quota errors on low-end Android
  }
}

async function findShellFallbackResponse(requestUrl: string): Promise<Response | undefined> {
  const shell = await caches.open(SHELL_CACHE);
  const direct = await shell.match(requestUrl, { ignoreSearch: true });
  if (direct) return direct;

  const indexCandidates = [
    new URL('./index.html', sw.location.href).toString(),
    new URL('./', sw.location.href).toString(),
    'index.html',
    './',
  ];
  for (const candidate of indexCandidates) {
    const match = await shell.match(candidate, { ignoreSearch: true });
    if (match) return match;
  }
  return caches.match(requestUrl, { ignoreSearch: true });
}

sw.addEventListener('install', (event: SWExtendableEvent) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(SHELL_CACHE);
        const urls = Array.from(
          new Set(
            [
              ...MANIFEST_ENTRIES.map(normalizePrecacheUrl),
              new URL('./index.html', sw.location.href).toString(),
              new URL('./', sw.location.href).toString(),
            ].filter(Boolean)
          )
        );
        await Promise.allSettled(
          urls.map(async (u) => {
            try {
              const res = await fetch(u, { cache: 'no-cache' });
              if (res.ok) {
                await cache.put(u, res);
              }
            } catch {
              // ignore single asset miss in dev mode
            }
          })
        );
      } catch {
        // ignore precache failure
      }
    })()
  );
});

sw.addEventListener('activate', (event: SWExtendableEvent) => {
  const validCaches = new Set([SHELL_CACHE, RUNTIME_ASSETS_CACHE, SFX_CACHE]);
  event.waitUntil(
    (async () => {
      try {
        const names = await caches.keys();
        await Promise.all(
          names
            .filter((name) => name.startsWith('rfa-') && !validCaches.has(name))
            .map((name) => caches.delete(name))
        );
        await sw.clients.claim();
      } catch {
        // ignore activate errors
      }
    })()
  );
});

sw.addEventListener('fetch', (event: SWFetchEvent) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // Never intercept byte-range audio streams, /api/youtube/stream, or auth routes
  if (isAudioStreamRequest(url, request)) {
    return;
  }

  // App navigation requests: NetworkFirst with cached shell fallback so in-app navigation never breaks
  if (request.mode === 'navigate') {
    if (url.pathname.includes('/api/')) return;
    event.respondWith(
      (async () => {
        try {
          const networkRes = await fetch(request);
          if (networkRes && networkRes.ok) {
            const shell = await caches.open(SHELL_CACHE);
            shell.put(request, networkRes.clone()).catch(() => {});
            return networkRes;
          }
          const fallback = await findShellFallbackResponse(request.url);
          return fallback || networkRes;
        } catch {
          const fallback = await findShellFallbackResponse(request.url);
          return (
            fallback ||
            new Response('Modo sin conexión activo.', {
              status: 503,
              headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            })
          );
        }
      })()
    );
    return;
  }

  // Short non-ranged SFX & YouTube cached intros: StaleWhileRevalidate in bounded LRU cache
  if (isCacheableShortAudio(url, request)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(SFX_CACHE);
        const cached = await cache.match(request);
        const networkFetch = fetch(request)
          .then(async (res) => {
            await cacheSmallAudioIfValid(cache, request, res);
            return res;
          })
          .catch(() => null);

        if (cached) {
          return cached;
        }
        const net = await networkFetch;
        if (net) return net;
        return new Response(null, { status: 504 });
      })()
    );
    return;
  }

  // Same-origin static assets & Google Fonts: CacheFirst / StaleWhileRevalidate
  const isSameOrigin = url.origin === sw.location.origin;
  const isFonts =
    url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';

  if (isSameOrigin || isFonts) {
    event.respondWith(
      (async () => {
        const shellMatch = await caches.match(request, { ignoreSearch: false });
        if (shellMatch) {
          // Background refresh non-hashed assets gently
          if (
            url.pathname.endsWith('.json') ||
            url.pathname.endsWith('manifest.webmanifest')
          ) {
            fetch(request)
              .then(async (res) => {
                if (res && res.ok) {
                  const runtime = await caches.open(RUNTIME_ASSETS_CACHE);
                  await runtime.put(request, res);
                }
              })
              .catch(() => {});
          }
          return shellMatch;
        }

        try {
          const res = await fetch(request);
          if (res && (res.ok || res.type === 'opaque')) {
            const runtime = await caches.open(RUNTIME_ASSETS_CACHE);
            runtime.put(request, res.clone()).catch(() => {});
          }
          return res;
        } catch {
          return (await caches.match(request, { ignoreSearch: true })) || new Response(null, { status: 504 });
        }
      })()
    );
  }
});

sw.addEventListener('message', (event: SWMessageEvent) => {
  const data = (event.data || {}) as {
    type?: string;
    urls?: string[];
  };

  if (data.type === 'SKIP_WAITING') {
    event.waitUntil(sw.skipWaiting());
    return;
  }

  if (data.type === 'KEEP_ALIVE_PING') {
    if (event.ports && event.ports[0]) {
      try {
        event.ports[0].postMessage({ type: 'KEEP_ALIVE_PONG', ts: Date.now() });
      } catch {
        // ignore closed port
      }
    }
    return;
  }

  if (data.type === 'WARM_SFX_URLS' && Array.isArray(data.urls)) {
    const targets = data.urls
      .filter((u) => typeof u === 'string' && u.startsWith('http'))
      .slice(0, 16);

    event.waitUntil(
      (async () => {
        const cache = await caches.open(SFX_CACHE);
        for (const url of targets) {
          try {
            const existing = await cache.match(url);
            if (existing) continue;
            const res = await fetch(url, { mode: 'cors' });
            await cacheSmallAudioIfValid(cache, url, res);
          } catch {
            // ignore offline / single failure
          }
        }
      })()
    );
  }
});
