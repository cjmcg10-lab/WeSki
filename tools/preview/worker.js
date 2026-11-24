// The preview site (skiwithme-preview.<account>.workers.dev): a branch's app, before it reaches main.
// - The app itself is bundled into this Worker (tools/preview/deploy.mjs).
// - Map files come from R2: preview/data/<id>/<file> (the branch's own rebuilt maps) first, else the live
//   data/<id>/<file>, so every mountain opens and the ones rebuilt for the branch show the new data.
// - GET /api/* (weather, forecast, resort status) is passed to the live site; groups, sign-in and purchases are not
//   available in the preview and answer with an empty reply.
import { FILES } from './.build/manifest.js';

const LIVE = 'https://skiwithme.builtbyroger.app';
const TYPES = { json: 'application/json', bin: 'application/octet-stream', z16: 'application/octet-stream', z8: 'application/octet-stream' };

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/api/')) {
      if (req.method === 'GET' && !url.pathname.startsWith('/api/groups')) {
        const r = await fetch(LIVE + url.pathname + url.search, { headers: { 'user-agent': 'skiwithme-preview' } });
        return new Response(r.body, { status: r.status, headers: { 'content-type': r.headers.get('content-type') || 'application/json' } });
      }
      return new Response('{}', { headers: { 'content-type': 'application/json' } });
    }
    // photos and Forecast data are large and unchanged by a branch: straight from the live site
    if (/^\/(photos|forecast)\//.test(url.pathname)) {
      // a branch's own new pictures (e.g. mountain cards) are uploaded to R2 under preview/photos/
      if (url.pathname.startsWith('/photos/') && env.MAPS) {
        const own = await env.MAPS.get('preview' + url.pathname);
        if (own) return new Response(own.body, { headers: { 'content-type': url.pathname.endsWith('.json') ? 'application/json' : 'image/jpeg', 'cache-control': 'no-cache' } });
      }
      const r = await fetch(LIVE + url.pathname, { headers: { 'user-agent': 'skiwithme-preview' } });
      return new Response(r.body, { status: r.status, headers: { 'content-type': r.headers.get('content-type') || 'application/octet-stream' } });
    }
    const m = url.pathname.match(/^\/data\/([a-z0-9-]{2,40})\/([a-z]+\.(json|bin|z16|z8))$/);
    if (m && env.MAPS) {
      let obj = await env.MAPS.get(`preview/data/${m[1]}/${m[2]}`);
      if (!obj && m[3] === 'z16') {
        // live compact grids are stored under the checksum of their .bin (tools/maps_r2.mjs)
        const bin = await env.MAPS.head(`data/${m[1]}/${m[2].replace('.z16', '.bin')}`);
        if (bin) obj = await env.MAPS.get(`data/${m[1]}/${m[2].replace('.z16', `.${bin.etag.slice(0, 12)}.z16`)}`);
      } else if (!obj) obj = await env.MAPS.get(`data/${m[1]}/${m[2]}`);
      if (obj) return new Response(obj.body, { headers: { 'content-type': TYPES[m[3]], 'cache-control': 'no-cache' } });
      if (!FILES[url.pathname]) return new Response('Not found', { status: 404 });
    }
    let f = FILES[url.pathname === '/' ? '/index.html' : url.pathname] || FILES[url.pathname + '.html'];
    if (!f && !/\.[a-z0-9]+$/i.test(url.pathname)) f = FILES['/index.html'];          // app pages
    if (!f) return new Response('Not found', { status: 404 });
    return new Response(f[0], { headers: { 'content-type': f[1], 'cache-control': 'no-cache' } });
  },
};
