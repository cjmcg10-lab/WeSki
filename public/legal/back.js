// Shown inside the app's page viewer: the viewer has its own Back button, and links back to the app close the viewer
// instead of loading a second copy of the app inside it. Opened on its own: a big "Back to the app" bar at the top.
(function () {
  if (window.top === window) return;
  document.documentElement.classList.add('in-app');
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    var u = new URL(a.href, location.href);
    if (u.origin !== location.origin) { a.target = '_blank'; return; }
    if (/^\/(legal\/|about)/.test(u.pathname)) return;
    e.preventDefault();
    window.parent.postMessage('skiwithme:close-doc', location.origin);
  });
})();
