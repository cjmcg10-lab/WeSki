// The SkiWithMe pass on this phone: what the server says about the signed-in account.
// The server is the only judge of a pass. Paid features that matter (directions data, creating groups) are refused
// by the server without one; this file only decides what to show.
let cfg = null, me = null;

const get = async (url) => {
  const r = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
};
const post = async (url, body = {}) => {
  const r = await fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  let out = {};
  try { out = await r.json(); } catch { /* empty */ }
  return { status: r.status, ok: r.ok, ...out };
};

/** Prices and switches from the server. Offline or no server (local preview): everything open. */
export async function loadConfig() {
  try { cfg = await get('/api/config'); } catch { cfg = cfg || { paywall: false, signIn: false, paddle: null, plans: {} }; }
  return cfg;
}
export const config = () => cfg || { paywall: false, signIn: false, paddle: null, plans: {} };

export async function refreshMe() {
  try { me = await get('/api/me'); } catch { /* offline: keep what we knew */ }
  return me;
}
export const account = () => me;
export const signedIn = () => !!me?.signedIn;

/** Does this phone have the pass right now? (Only for what to show; the server checks again.) */
export function hasPass() {
  if (!config().paywall) return true;
  return !!me?.pass?.active;
}

export const startSignIn = (email) => post('/api/auth/start', { email });
export const finishSignIn = async (email, code) => { const r = await post('/api/auth/code', { email, code }); if (r.ok) await refreshMe(); return r; };
export const signOut = async () => { const r = await post('/api/auth/signout'); me = { signedIn: false, paywall: config().paywall }; return r; };
export const deleteAccount = async () => { const r = await post('/api/account/delete'); if (r.ok) me = { signedIn: false, paywall: config().paywall }; return r; };
export const startTrial = async () => { const r = await post('/api/trial'); await refreshMe(); return r; };
export const setCrew = async (emails) => { const r = await post('/api/crew', { emails }); await refreshMe(); return r; };

let paddleP = null;
/** Load Paddle's checkout (only when someone opens it) and open it for one plan. */
export async function checkout(plan, onDone) {
  const c = config();
  const price = c.paddle?.prices?.[plan];
  if (!c.paddle || !price) throw new Error('Payments are not open yet.');
  if (!me?.signedIn) throw new Error('Sign in first, so the pass is saved to your account.');
  if (!paddleP) {
    paddleP = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.paddle.com/paddle/v2/paddle.js';
      s.onload = () => resolve(window.Paddle);
      s.onerror = () => { paddleP = null; reject(new Error('Could not open checkout. Check your connection.')); };
      document.head.appendChild(s);
    }).then((P) => {
      if (c.paddle.env === 'sandbox') P.Environment.set('sandbox');
      P.Initialize({
        token: c.paddle.token,
        eventCallback: (ev) => { if (ev.name === 'checkout.completed') paddleDone?.(); },
      });
      return P;
    });
  }
  const P = await paddleP;
  paddleDone = async () => {
    // the pass arrives by Paddle's signed message to our server, a few seconds after payment
    for (let i = 0; i < 10 && !me?.pass?.active; i++) { await new Promise((r) => setTimeout(r, 2000)); await refreshMe(); }
    onDone?.(!!me?.pass?.active);
  };
  P.Checkout.open({ items: [{ priceId: price, quantity: 1 }], customer: { email: me.email }, customData: { account: me.account } });
}
let paddleDone = null;
