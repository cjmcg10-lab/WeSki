// Map files kept in Cloudflare R2 instead of the repository (see docs/ADDING_MOUNTAINS.md, "Map storage").
// public/data/r2.json lists the resorts that live there. Their files are served from the MAPS bucket under
// data/<id>/<file>; every other resort is a static asset as before. Nothing here runs until a resort is listed
// and the bucket is bound as MAPS.
import r2 from '../public/data/r2.json';

const IDS = new Set(r2.ids);
const TYPES = { json: 'application/json', bin: 'application/octet-stream', z16: 'application/octet-stream' };

export const inR2 = (id) => IDS.has(id);

/** The R2 copy of /data/<id>/<file> for a listed resort, or null to fall through to the static files. */
export async function fromR2(request, env, url, ids = IDS) {
  const m = url.pathname.match(/^\/data\/([a-z0-9-]{2,40})\/([a-z]+\.(json|bin|z16))$/);
  if (!m || !ids.has(m[1]) || !env.MAPS || !['GET', 'HEAD'].includes(request.method)) return null;
  const obj = await env.MAPS.get(`data/${m[1]}/${m[2]}`, { onlyIf: request.headers });
  if (!obj) return new Response('Not found', { status: 404 });
  const headers = new Headers({ 'content-type': TYPES[m[3]], etag: obj.httpEtag, 'cache-control': 'public, max-age=300' });
  // onlyIf matched the phone's cached copy: nothing to send
  if (!('body' in obj) || !obj.body) return new Response(null, { status: 304, headers });
  return new Response(request.method === 'HEAD' ? null : obj.body, { headers });
}
