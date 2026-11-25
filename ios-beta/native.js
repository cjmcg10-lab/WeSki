import { CapacitorHttp, registerPlugin } from '@capacitor/core';
import { NativePurchases } from '@capgo/native-purchases';
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
const requestTimeout = 10000;
const revalidateTimeout = 2500;
function requestBody(body) {
  if (!body) return undefined;
  try { return JSON.parse(body); } catch { return body; }
}
function etagOf(headers = {}) {
  const key = Object.keys(headers).find(name => name.toLowerCase() === 'etag');
  return key ? headers[key] : undefined;
}
window.fetch = async function(input, options = {}) {
  const url = new URL(input instanceof Request ? input.url : input, location.href);
  if (url.protocol !== location.protocol || url.host !== location.host) return bundledFetch(input, options);
  if (url.pathname.startsWith('/api/')) {
    const method = options.method || 'GET';
    const result = await CapacitorHttp.request({url: server + url.pathname + url.search, method,
      headers: options.headers || {}, data: requestBody(options.body), responseType: 'json',
      connectTimeout: requestTimeout, readTimeout: requestTimeout});
    return new Response(result.status === 204 ? null : JSON.stringify(result.data), {status: result.status, headers:{'content-type':'application/json'}});
  }
  const [, prefix, id, name] = url.pathname.split('/');
  if (prefix !== 'data' || !(await remoteMaps).has(id) || !['resort.json','graph.json','terrain.bin','surround.bin','terrain.z16','surround.z16'].includes(name)) return bundledFetch(input, options);
  const json = name.endsWith('.json');
  const saved = await mapFile(url.pathname);
  const savedBytes = saved?.bytes ?? saved;
  const savedEtag = saved?.etag;
  const headers = savedEtag && options.cache !== 'reload' ? {'If-None-Match': savedEtag} : {};
  const request = CapacitorHttp.get({url: server + url.pathname + url.search, headers, responseType: json ? 'json' : 'arraybuffer',
    connectTimeout: requestTimeout, readTimeout: requestTimeout});
  const keep = async result => {
    const bytes = json ? new TextEncoder().encode(JSON.stringify(result.data)) :
      Uint8Array.from(atob(result.data), c => c.charCodeAt(0));
    await mapFile(url.pathname, {bytes, etag: etagOf(result.headers)});
    return bytes;
  };
  let result;
  try {
    result = savedBytes ? await Promise.race([request, new Promise(resolve => setTimeout(resolve, revalidateTimeout))]) : await request;
  } catch (error) {
    if (savedBytes) return mapResponse(savedBytes, json);
    throw error;
  }
  if (!result) {
    request.then(late => late.status === 200 && keep(late)).catch(console.warn);
    return mapResponse(savedBytes, json);
  }
  if (result.status === 304 && savedBytes) return mapResponse(savedBytes, json);
  if (result.status !== 200) {
    if (savedBytes && result.status >= 500) return mapResponse(savedBytes, json);
    return new Response(null,{status:result.status});
  }
  return mapResponse(await keep(result), json);
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

// ---- Apple in-app purchases (StoreKit 2 through @capgo/native-purchases). The app never shows Paddle: every pass
// bought inside the iPhone app goes through Apple, and our server checks Apple's signed transaction
// (worker/apple.js) before putting the pass on the SkiWithMe account. src/account.js finds this as
// window.SkiWithMeStore.
const PRODUCT = { day: 'app.builtbyroger.skiwithme.day', week: 'app.builtbyroger.skiwithme.week',
  season: 'app.builtbyroger.skiwithme.season', crew: 'app.builtbyroger.skiwithme.crew' };
const planOf = id => Object.keys(PRODUCT).find(k => PRODUCT[k] === id);
const claim = jws => fetch('/api/apple/transaction', {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({jws})});

window.SkiWithMeStore = {
  /** Apple's own price for each plan, in the buyer's currency: {day: '$2.99', ...}. */
  async prices() {
    const {products} = await NativePurchases.getProducts({productIdentifiers: Object.values(PRODUCT)});
    return Object.fromEntries(products.map(p => [planOf(p.identifier), p.priceString]).filter(([k]) => k));
  },
  /** Apple's purchase sheet for one plan, tied to the account by its App Store token.
   *  Returns {jws} | {cancelled} | {pending}. */
  async buy(plan, appAccountToken) {
    try {
      const tx = await NativePurchases.purchaseProduct({productIdentifier: PRODUCT[plan], quantity: 1,
        ...(appAccountToken ? {appAccountToken} : {})});
      return tx?.jwsRepresentation ? {jws: tx.jwsRepresentation} : {};
    } catch (error) {
      const text = String(error?.message || error);
      if (/cancel/i.test(text)) return {cancelled: true};
      if (/pending/i.test(text)) return {pending: true};
      throw error;
    }
  },
  /** Every pass Apple has for this Apple Account (after asking Apple to sync), as signed transactions. */
  async restore() {
    await NativePurchases.restorePurchases();
    const {purchases} = await NativePurchases.getPurchases();
    return (purchases || []).filter(p => planOf(p.productIdentifier) && p.jwsRepresentation).map(p => p.jwsRepresentation);
  },
  /** Apple's own screen to cancel or change a Season or Crew Pass. */
  manage: () => NativePurchases.manageSubscriptions(),
};

// A purchase that finishes later (Ask to Buy approved, a payment confirmed, a renewal seen on the phone) arrives here;
// send it to our server too. Signed out, it is picked up by Restore purchases instead. Apple's server messages
// (/api/apple/notifications) cover the same events, so a miss here is not a loss.
NativePurchases.addListener('transactionUpdated', tx => {
  if (tx?.jwsRepresentation && planOf(tx.productIdentifier)) claim(tx.jwsRepresentation).catch(console.warn);
}).catch(console.warn);
