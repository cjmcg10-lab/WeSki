const VERSION = '5.6.2';
const CDN = `https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/${VERSION}`;
const SCRIPT_SRI = 'sha384-1qC0PnXk2fgMDybOtZF1ui4LM5Sxm7o0TbEkwfxTTVdlZvuNENNGCKUub7d644HP';
const STYLE_SRI = 'sha384-gNYNsUmuZqDYiT3gbirWTV5K7rt71RoveS/yXAaU09d4ZUmeDVTD3XoqB6uJAIFR';
export const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const LOAD_TIMEOUT_MS = 20000;

let loading = null;

function inject(tag, attrs) {
  const el = document.createElement(tag);
  Object.assign(el, attrs);
  el.crossOrigin = 'anonymous';
  document.head.append(el);
  return el;
}

export function loadMapLibre() {
  if (globalThis.maplibregl) return Promise.resolve(globalThis.maplibregl);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const link = inject('link', { rel: 'stylesheet', href: `${CDN}/maplibre-gl.css`, integrity: STYLE_SRI });
      const script = inject('script', { src: `${CDN}/maplibre-gl.js`, integrity: SCRIPT_SRI, async: true });
      const fail = (message) => { link.remove(); script.remove(); reject(new Error(message)); };
      script.onload = () => (globalThis.maplibregl ? resolve(globalThis.maplibregl) : fail('map library missing'));
      script.onerror = () => fail('map library did not load');
      link.onerror = () => fail('map style sheet did not load');
    }).catch((e) => { loading = null; throw e; });
  }
  return loading;
}

const markerEl = (letter) => {
  const el = document.createElement('div');
  el.className = 'fc-marker';
  el.textContent = letter;
  return el;
};

export async function mountMap(container, { lat, lon, zoom }) {
  const gl = await loadMapLibre();
  const map = new gl.Map({ container, style: STYLE_URL, center: [lon, lat], zoom, attributionControl: false, dragRotate: false, pitchWithRotate: false });
  map.addControl(new gl.AttributionControl({ compact: false }));
  map.addControl(new gl.NavigationControl({ showCompass: false }), 'top-right');
  map.touchZoomRotate.disableRotation();
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('map did not load in time')), LOAD_TIMEOUT_MS);
    map.once('load', () => { clearTimeout(timer); resolve(); });
    map.once('error', (e) => { clearTimeout(timer); reject(new Error(e?.error?.message || 'map failed to load')); });
  }).catch((e) => { map.remove(); throw e; });
  const markers = { base: null, top: null };
  const put = (key, point, letter) => {
    markers[key]?.remove();
    markers[key] = point ? new gl.Marker({ element: markerEl(letter) }).setLngLat([point.lon, point.lat]).addTo(map) : null;
  };
  return {
    center: () => { const c = map.getCenter(); return { lat: c.lat, lon: c.lng, zoom: map.getZoom() }; },
    flyTo: (la, lo, z) => map.jumpTo({ center: [lo, la], zoom: Math.max(map.getZoom(), z ?? 0) }),
    setPins: (base, top) => { put('base', base, 'B'); put('top', top, 'T'); },
    destroy: () => { markers.base?.remove(); markers.top?.remove(); map.remove(); },
  };
}
