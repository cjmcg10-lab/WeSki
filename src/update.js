// New versions of the app. The service worker (public/sw.js) installs a new version as soon as it is found and takes
// over open screens straight away, but a screen that is already open keeps running the code it started with. This
// notices the takeover and either reloads at a safe moment or asks the person with a small "New version ready" bar.

const CHECK_GAP = 30 * 60 * 1000;   // ask the server for a new version at most every 30 minutes

/**
 * Watch for a new version of the app.
 * @param {object} o
 * @param {ServiceWorkerContainer} o.sw      navigator.serviceWorker
 * @param {() => boolean} o.isSafe           true when reloading now loses nothing (start screen, nothing in progress)
 * @param {() => void} o.show                show the "New version ready" bar
 * @param {() => void} [o.reload]            reload the page
 * @param {() => number} [o.now]
 * @param {number} [o.gap]                   least time between update checks
 */
export function watchUpdates({ sw, isSafe, show, reload = () => location.reload(), now = Date.now, gap = CHECK_GAP }) {
  // Without a worker in charge yet, the first takeover is the very first install, not a new version.
  let hadController = !!sw.controller;
  let reg = null, lastCheck = now(), ready = false, reloading = false, last = null;

  const doReload = () => { if (reloading) return; reloading = true; reload(); };
  // Each new version asks again, so a bar closed with "Not now" comes back for the next one (show() adds one bar only).
  // The takeover and the new worker's "activated" both report the same version: count it once.
  const markReady = (worker) => {
    if (worker && worker === last) return;
    last = worker || null;
    ready = true;
    if (isSafe()) doReload(); else show();
  };

  sw.addEventListener('controllerchange', () => {
    if (!hadController) { hadController = true; return; }
    markReady(sw.controller);
  });

  return {
    get ready() { return ready; },
    /** Hand over the registration once register() has finished. */
    attach(r) {
      reg = r;
      if (!r) return;
      r.addEventListener('updatefound', () => {
        const w = r.installing;
        // A worker found while no worker runs this screen is the very first install (its takeover sets the
        // controller before it reports "activated"), not a new version.
        if (!w || !sw.controller) return;
        let done = false;
        w.addEventListener('statechange', () => { if (w.state === 'activated' && !done) { done = true; markReady(w); } });
      });
    },
    /** Ask the server whether a newer version exists (at most every `gap` milliseconds unless forced). */
    check(force = false) {
      if (!reg || (!force && now() - lastCheck < gap)) return;
      lastCheck = now();
      Promise.resolve().then(() => reg.update()).catch(() => {});
    },
    /** Reload now if a new version is waiting and nothing would be lost. */
    tryReload() { if (ready && isSafe()) doReload(); },
    /** The person tapped Reload. */
    reloadNow: doReload,
  };
}
