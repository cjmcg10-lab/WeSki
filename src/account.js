// The SkiWithMe pass on this phone: what the server says about the signed-in account.
// The server is the only judge of a pass. Paid features that matter (directions data, creating groups) are refused
// by the server without one; this file only decides what to show.
let cfg = null, me = null, cfgOk = false, meOk = false;

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
// The last answers are kept on the phone, so an app opened without signal neither opens every paid feature (as if
// payments were off) nor locks out someone who paid. A kept pass still ends at its end time (`until`).
const KEEP_CFG = 'weski:cfg', KEEP_ME = 'weski:me';
const kept = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
const keep = (k, v) => { try { if (v) localStorage.setItem(k, JSON.stringify(v)); else localStorage.removeItem(k); } catch { /* private mode */ } };
const signedOutMe = () => ({ signedIn: false, paywall: config().paywall });

export async function loadConfig() {
  try { cfg = await get('/api/config'); cfgOk = true; keep(KEEP_CFG, { paywall: !!cfg.paywall }); }
  catch { cfg = cfg || { paywall: !!kept(KEEP_CFG)?.paywall, signIn: false, paddle: null, plans: {} }; }
  return cfg;
}
export const config = () => cfg || { paywall: false, signIn: false, paddle: null, plans: {} };

export async function refreshMe() {
  try {
    me = await get('/api/me'); meOk = true;
    keep(KEEP_ME, me?.signedIn ? { signedIn: true, email: me.email, pass: me.pass } : null);
  } catch { if (!me) me = kept(KEEP_ME); /* offline: keep what we knew */ }
  return me;
}
export const account = () => me;
export const signedIn = () => !!me?.signedIn;

/** Does this phone have the pass right now? (Only for what to show; the server checks again.) */
let simFree = false;
/** "Simulate free tier" in Appearance & advanced: this phone acts as if it had no pass (testing only). */
export const setSimFree = (on) => { simFree = !!on; };
export const simulatingFree = () => simFree;
export function hasPass() {
  if (simFree) return false;
  if (!config().paywall) return true;
  return passActive(me);
}
/** A pass counts only for a signed-in account, and only until its end time (a Day pass ends while the app is open). */
export const passActive = (m, now = Date.now()) => !!(m?.signedIn && m.pass?.active && (!m.pass.until || m.pass.until > now));

/** Has the server answered about this phone's pass in this session? Nothing is removed from the phone on a guess
 *  (offline, a failed request, or "Simulate free tier" only change what is shown). */
export const passKnown = () => !simFree && cfgOk && (!cfg?.paywall || meOk);

export const startSignIn = (email) => post('/api/auth/start', { email });
/** Keep a record on our server that this account agreed to terms version v (only when signed in). */
export async function syncConsent(v) {
  if (!me?.signedIn || !v || (me.terms || []).some((x) => x.v === v)) return;
  const r = await post('/api/consent', { v });
  if (r.ok) me.terms = [...(me.terms || []), { v, at: Date.now() }];
}
export const finishSignIn = async (email, code) => { const r = await post('/api/auth/code', { email, code }); if (r.ok) await refreshMe(); return r; };
export const signOut = async () => { const r = await post('/api/auth/signout'); me = signedOutMe(); keep(KEEP_ME, null); return r; };
/** Sign out every device of this account, this one included. */
export const signOutAll = async () => { const r = await post('/api/auth/signout-all'); me = signedOutMe(); keep(KEEP_ME, null); return r; };
export const deleteAccount = async () => { const r = await post('/api/account/delete'); if (r.ok) { me = signedOutMe(); keep(KEEP_ME, null); } return r; };
export const startTrial = async () => { const r = await post('/api/trial'); await refreshMe(); return r; };
export const setCrew = async (emails) => { const r = await post('/api/crew', { emails }); await refreshMe(); return r; };
/** Website Season Pass to Crew: Paddle switches the subscription and charges the difference; the Crew Pass arrives by
 *  Paddle's signed message a few seconds later, so wait for it. Returns {ok} or {error}. */
export async function upgradeToCrew() {
  const r = await post('/api/pass/upgrade');
  if (!r.ok) return r;
  for (let i = 0; i < 10 && me?.pass?.plan !== 'crew'; i++) { await new Promise((ok) => setTimeout(ok, 2000)); await refreshMe(); }
  return { ok: true, done: me?.pass?.plan === 'crew' };
}

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
        // Paddle Retain recognises a returning customer by their Paddle customer id (ctm_...), never our id or email
        ...(/^ctm_/.test(me?.paddleCustomer || '') ? { pwCustomer: { id: me.paddleCustomer } } : {}),
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

/** The App Store inside the iPhone app (ios-beta/native.js sets window.SkiWithMeStore), or null on the web.
 *  The app never shows Paddle: inside it every pass is bought through Apple. */
export const nativeStore = () => (typeof window !== 'undefined' && window.SkiWithMeStore) || null;

/** Send Apple's signed transaction(s) to our server, which checks them with Apple's certificates and puts the pass on
 *  this account. Returns the worst answer: {ok} or {error}. */
async function claimApple(list) {
  let out = { ok: true };
  for (const jws of list) {
    const r = await post('/api/apple/transaction', { jws });
    if (!r.ok) out = r;
  }
  await refreshMe();
  return out;
}

/** Buy one plan through Apple. Returns {ok} | {cancelled} | {pending} | {error}. */
export async function buyApple(plan) {
  const store = nativeStore();
  if (!store) return { error: 'no_store' };
  if (!me?.signedIn) return { error: 'signed_out' };
  const r = await store.buy(plan, me.appleToken);
  if (r?.cancelled || r?.pending) return r;
  if (!r?.jws) return { error: 'store' };
  return claimApple([r.jws]);
}

/** Ask Apple again for every pass bought with this Apple Account (a new phone, a reinstall). */
export async function restoreApple() {
  const store = nativeStore();
  if (!store) return { error: 'no_store' };
  if (!me?.signedIn) return { error: 'signed_out' };
  const list = await store.restore();
  if (!list.length) return { ok: true, none: true };
  return claimApple(list);
}
