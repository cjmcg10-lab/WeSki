export const FEEDBACK_TAGS = ['icy', 'powder', 'slushy', 'windy', 'crowded', 'visibility'];
export const FEEDBACK_LABELS = { icy: 'Icy', powder: 'Powder', slushy: 'Slushy', windy: 'Windy, lifts on hold', crowded: 'Crowded', visibility: 'Poor visibility' };

export const FEEDBACK_MAX_AGE_DAYS = 120;
const KEPT = 400;
const askedKey = (resort, day) => `${resort}:${day}`;

export const feedbackAsked = (store, resort, day) => store.get('feedbackAsked', []).includes(askedKey(resort, day));

/** Record that this ski day has been answered or skipped, so it is never asked about again. A rating is queued for sending. */
export function answerFeedback(store, resort, day, answer) {
  store.set('feedbackAsked', [...store.get('feedbackAsked', []), askedKey(resort, day)].slice(-KEPT));
  if (!answer) return;
  const tags = FEEDBACK_TAGS.filter((t) => answer.tags.includes(t));
  store.set('feedbackQueue', [...store.get('feedbackQueue', []), { resort, day, rating: answer.rating, tags }].slice(-KEPT));
}

let flushing = null;

/** Send queued answers: kept on the phone while offline or busy, dropped once the server has taken them or refused them. */
export function flushFeedback(store, send = (body) => fetch('/api/feedback', { method: 'POST', headers: { 'content-type': 'application/json' }, body })) {
  flushing ??= sendQueued(store, send).finally(() => { flushing = null; });
  return flushing;
}

async function sendQueued(store, send) {
  let done = 0;
  for (const item of store.get('feedbackQueue', [])) {
    const res = await send(JSON.stringify(item)).catch(() => null);
    if (!res || !(res.ok || (res.status >= 400 && res.status < 500 && res.status !== 429))) break;
    done++;
  }
  if (done) store.set('feedbackQueue', store.get('feedbackQueue', []).slice(done));
  return done;
}
