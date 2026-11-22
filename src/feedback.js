export const FEEDBACK_TAGS = ['icy', 'powder', 'slushy', 'windy', 'crowded', 'visibility'];
export const FEEDBACK_LABELS = { icy: 'Icy', powder: 'Powder', slushy: 'Slushy', windy: 'Windy, lifts on hold', crowded: 'Crowded', visibility: 'Poor visibility' };

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

/** Send queued answers: kept on the phone while offline or busy, dropped once the server has taken them or refused them as invalid. */
export async function flushFeedback(store, send = (body) => fetch('/api/feedback', { method: 'POST', headers: { 'content-type': 'application/json' }, body })) {
  const queue = store.get('feedbackQueue', []);
  const left = [];
  for (const [i, item] of queue.entries()) {
    const res = await send(JSON.stringify(item)).catch(() => null);
    if (res && (res.ok || res.status === 400)) continue;
    left.push(...queue.slice(i));
    break;
  }
  if (left.length !== queue.length) store.set('feedbackQueue', left);
  return queue.length - left.length;
}
