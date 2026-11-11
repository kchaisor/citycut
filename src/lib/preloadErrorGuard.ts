const PRELOAD_RELOAD_KEY = "citycut-preload-reload";

/** Reload once when a lazy chunk fails after a GitHub Pages deploy swap. */
export function installPreloadErrorGuard(): void {
  if (typeof window === "undefined") return;
  window.addEventListener("vite:preloadError", () => {
    try {
      if (sessionStorage.getItem(PRELOAD_RELOAD_KEY)) return;
      sessionStorage.setItem(PRELOAD_RELOAD_KEY, "1");
    } catch {
    }
    window.location.reload();
  });
}

export function clearPreloadReloadFlagForTests(): void {
  try {
    sessionStorage.removeItem(PRELOAD_RELOAD_KEY);
  } catch {
  }
}
