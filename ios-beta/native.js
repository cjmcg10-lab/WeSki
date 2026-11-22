import { CapacitorHttp, registerPlugin } from '@capacitor/core';
import { Locator } from '../src/location.js';

const background = registerPlugin('BackgroundGeolocation');
export const server = 'https://skiwithme.builtbyroger.app';
const bundledFetch = window.fetch.bind(window);
const remoteMaps = bundledFetch('/data/r2.json').then(r => r.json()).then(data => new Set(data.ids));
let mapDB;
function openMaps() {
  if (!mapDB) mapDB = new Promise((resolve, reject) => {
    const request = indexedDB.open('skiwithme-ios-maps', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('files');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }).catch(error => { mapDB = undefined; throw error; });
  return mapDB;
}
async function mapFile(path, data) {
  const db = await openMaps();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('files', data ? 'readwrite' : 'readonly');
    const store = tx.objectStore('files');
    const op = data ? store.put(data, path) : store.get(path);
    tx.oncomplete = () => resolve(op.result);
    tx.onabort = () => reject(tx.error);
    tx.onerror = () => reject(tx.error);
  });
}
function mapResponse(bytes, json) {
  return new Response(bytes, {headers: {'content-type': json ? 'application/json' : 'application/octet-stream'}});
}
window.fetch = async function(input, options = {}) {
  const url = new URL(input instanceof Request ? input.url : input, location.href);
  if (url.protocol !== location.protocol || url.host !== location.host) return bundledFetch(input, options);
  if (url.pathname.startsWith('/api/')) {
    const method = options.method || 'GET';
    const result = await CapacitorHttp.request({url: server + url.pathname + url.search, method,
      headers: options.headers || {}, data: options.body ? JSON.parse(options.body) : undefined, responseType: 'json'});
    return new Response(result.status === 204 ? null : JSON.stringify(result.data), {status: result.status, headers:{'content-type':'application/json'}});
  }
  const [, prefix, id, name] = url.pathname.split('/');
  if (prefix !== 'data' || !(await remoteMaps).has(id) || !['resort.json','graph.json','terrain.bin','surround.bin','terrain.z16','surround.z16'].includes(name)) return bundledFetch(input, options);
  const json = name.endsWith('.json');
  if (options.cache !== 'reload') {
    const hit = await mapFile(url.pathname);
    if (hit) return mapResponse(hit, json);
  }
  const result = await CapacitorHttp.get({url: server + url.pathname + url.search, responseType:json ? 'json' : 'arraybuffer'});
  if (result.status !== 200) return new Response(null,{status:result.status});
  const bytes = json ? new TextEncoder().encode(JSON.stringify(result.data)) :
    Uint8Array.from(atob(result.data), c => c.charCodeAt(0));
  await mapFile(url.pathname, bytes);
  return mapResponse(bytes, json);
};

export class PhoneLocator extends Locator {
  backgroundEnabled = false;
  setBackground(enabled) {
    if (this.backgroundEnabled === enabled) return;
    this.backgroundEnabled = enabled;
    if (this.watch != null && !this.sim) { this.stop(); this.start(); }
  }
  start() {
    if (this.sim || this.watch != null) return;
    const token = {};
    this.watch = token;
    const fail = error => {
      if (this.watch !== token) return;
      this.onError(error.code === 'NOT_AUTHORIZED' ? 'Location is blocked. Open iPhone Settings → SkiWithMe → Location to enable tracking.' : error.message);
      if (error.code === 'NOT_AUTHORIZED') this.stop();
    };
    token.promise = background.addWatcher({
      requestPermissions:true, stale:false, distanceFilter:2,
      ...(this.backgroundEnabled ? {backgroundMessage:'Recording your ski session'} : {})
    }, (fix, error) => {
      if (error) { fail(error); return; }
      if (!fix || this.watch !== token) return;
      this.onFix({lat:fix.latitude, lon:fix.longitude, acc:fix.accuracy, alt:fix.altitude ?? NaN,
        heading:fix.bearing != null && fix.speed > 1 ? fix.bearing * Math.PI / 180 : null,
        speed:fix.speed, t:fix.time ?? Date.now()});
    }).catch(error => { fail(error); if (this.watch === token) this.watch = null; });
  }
  stop() {
    const token = this.watch;
    this.watch = null;
    token?.promise?.then(id => id && background.removeWatcher({id})).catch(console.warn);
  }
}
