import { registerSW } from 'virtual:pwa-register';

let updateSWFn: ((reloadPage?: boolean) => Promise<void>) | null = null;
let pendingUpdateReady = false;
let playbackActive = false;
let initialized = false;
let keepAliveTimer: number | null = null;

function sendSwMessage(payload: Record<string, unknown>, expectReply = false): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  const controller = navigator.serviceWorker.controller;
  if (!controller) return;

  try {
    if (expectReply && typeof MessageChannel !== 'undefined') {
      const channel = new MessageChannel();
      controller.postMessage(payload, [channel.port2]);
    } else {
      controller.postMessage(payload);
    }
  } catch {
    // ignore postMessage errors
  }
}

export function initServiceWorkerController(): void {
  if (initialized || typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }
  initialized = true;

  try {
    updateSWFn = registerSW({
      immediate: true,
      onNeedRefresh() {
        pendingUpdateReady = true;
        // Never interrupt live tabletop audio with a forced reload; apply only when playback is paused/idle
        if (!playbackActive && updateSWFn) {
          pendingUpdateReady = false;
          updateSWFn(true).catch(() => {});
        }
      },
      onRegisteredSW(_swUrl, registration) {
        if (!registration) return;
        // Periodically check for updates gently in background
        window.setInterval(() => {
          if (navigator.onLine) {
            registration.update().catch(() => {});
          }
        }, 60 * 60 * 1000);
      },
      onRegisterError() {
        // Non-fatal in unsupported preview environments
      },
    });
  } catch {
    // ignore SW registration failure
  }
}

export function notifyServiceWorkerPlaybackState(isActive: boolean): void {
  playbackActive = isActive;

  if (isActive) {
    if (keepAliveTimer === null && typeof window !== 'undefined') {
      sendSwMessage({ type: 'KEEP_ALIVE_PING' }, true);
      keepAliveTimer = window.setInterval(() => {
        sendSwMessage({ type: 'KEEP_ALIVE_PING' }, true);
      }, 24_000);
    }
  } else {
    if (keepAliveTimer !== null && typeof window !== 'undefined') {
      window.clearInterval(keepAliveTimer);
      keepAliveTimer = null;
    }
    if (pendingUpdateReady && updateSWFn) {
      pendingUpdateReady = false;
      updateSWFn(true).catch(() => {});
    }
  }
}

export function warmSoundboardInServiceWorker(urls: string[]): void {
  if (!navigator.onLine || urls.length === 0) return;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

  navigator.serviceWorker.ready
    .then(() => {
      sendSwMessage({ type: 'WARM_SFX_URLS', urls });
    })
    .catch(() => {});
}
