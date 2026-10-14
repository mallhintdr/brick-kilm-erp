// Keeps phones on the latest build without a hard refresh: asks the server which version is
// live (on start, every 5 minutes, and whenever the app comes back to the screen) and, when it
// differs from this build, refreshes the service worker and reloads the page once.
const CHECK_EVERY_MS = 5 * 60 * 1000;
const GUARD = 'kiln_update_reload';

async function liveVersion() {
  const r = await fetch(`/api/version?t=${Date.now()}`, { cache: 'no-store' });
  if (!r.ok) return null;
  return (await r.json()).version || null;
}

async function checkForUpdate() {
  if (!navigator.onLine) return;
  try {
    const v = await liveVersion();
    if (!v || v === __APP_VERSION__) { sessionStorage.removeItem(GUARD); return; }
    // reload at most once per new version, so a half-finished deploy can't cause a reload loop
    if (sessionStorage.getItem(GUARD) === v) return;
    sessionStorage.setItem(GUARD, v);
    const reg = await navigator.serviceWorker?.getRegistration();
    await reg?.update().catch(() => {});
    window.location.reload();
  } catch { /* offline or server busy: try again later */ }
}

export function startUpdateWatcher() {
  checkForUpdate();
  setInterval(checkForUpdate, CHECK_EVERY_MS);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkForUpdate(); });
  // a newly activated service worker means new files are ready: show them
  // (only when replacing an older copy, not when the app installs itself the first time)
  const hadController = Boolean(navigator.serviceWorker?.controller);
  let reloaded = false;
  navigator.serviceWorker?.addEventListener('controllerchange', () => { if (hadController && !reloaded) { reloaded = true; window.location.reload(); } });
}
