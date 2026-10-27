export const DASHBOARD_UPDATED = "credence:dashboard-updated";
const STORAGE_KEY = "credence:dashboard-update";

export function publishDashboardUpdate(path = "") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(DASHBOARD_UPDATED, { detail: { path } }));
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ path, nonce: `${Date.now()}-${Math.random()}` }));
  } catch { /* Same-tab updates work even when storage is unavailable. */ }
}

export function subscribeDashboardRefresh(refresh, { intervalMs = 30000, immediate = true } = {}) {
  let disposed = false, running = false, pending = false;
  async function run() {
    if (disposed || document.visibilityState === "hidden") return;
    if (running) { pending = true; return; }
    running = true;
    try { await refresh(); }
    catch { /* Preserve the last good display; callers can report errors. */ }
    finally {
      running = false;
      if (pending && !disposed) { pending = false; void run(); }
    }
  }
  const onStorage = event => { if (event.key === STORAGE_KEY) void run(); };
  window.addEventListener(DASHBOARD_UPDATED, run);
  window.addEventListener("focus", run);
  window.addEventListener("storage", onStorage);
  document.addEventListener("visibilitychange", run);
  const timer = intervalMs > 0 ? window.setInterval(run, intervalMs) : null;
  if (immediate) queueMicrotask(run);
  return () => {
    disposed = true;
    if (timer !== null) window.clearInterval(timer);
    window.removeEventListener(DASHBOARD_UPDATED, run);
    window.removeEventListener("focus", run);
    window.removeEventListener("storage", onStorage);
    document.removeEventListener("visibilitychange", run);
  };
}
