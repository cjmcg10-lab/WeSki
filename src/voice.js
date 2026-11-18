// Spoken directions. Guide decides what to say and when (pure logic, unit-tested);
// Speaker says it through the phone's built-in speech voice, which follows headphones.

const LEAD_S = 9;        // say a turn about this many seconds before reaching it
const GPS_SLACK = 15;    // metres: GPS fixes arrive about a second late and a few metres off
const PREP_S = 25;       // early "in 300 feet…" heads-up

import { t, speechLang } from './i18n.js';

/** "ski Upper Northway", "bear left onto Taxi", "ride the Jet Triple"… (whole phrases, so each language can order them its own way) */
export function phrase(s, fmtDist, withTurn = false) {
  const a = s.turn ?? 0, mag = Math.abs(a), left = a < 0;
  if (s.kind === 'ski') {
    if (!withTurn) return t('ski {0}', s.name);
    if (mag < 25) return t('continue onto {0}', s.name);
    return mag < 60 ? (left ? t('bear left onto {0}', s.name) : t('bear right onto {0}', s.name))
      : (left ? t('turn left onto {0}', s.name) : t('turn right onto {0}', s.name));
  }
  if (s.kind === 'lift') return /^the /i.test(s.name) ? t('ride {0}', s.name) : t('ride the {0}', s.name);
  if (s.kind === 'walk') return t('walk {0}', fmtDist(s.dist));
  if (s.kind === 'up') {
    const d = fmtDist(s.dist);
    if (s.grade <= 0) return s.name ? t('skate back {0} along {1}', d, s.name) : t('skate back {0}', d);
    if (s.grade === 1) return s.name ? t('climb back {0} on {1}', d, s.name) : t('climb back {0}', d);
    return s.name ? t('sidestep back up {0} on {1}', d, s.name) : t('sidestep back up {0}', d);
  }
  if (s.kind === 'cross') {
    const d = fmtDist(s.dist), turn = withTurn && mag >= 25 ? (left ? 'left' : 'right') : '';
    if (s.to) return turn === 'left' ? t('cut across to the left {0} to {1}', d, s.to) : turn ? t('cut across to the right {0} to {1}', d, s.to) : t('cut across {0} to {1}', d, s.to);
    return turn === 'left' ? t('cut across to the left {0}', d) : turn ? t('cut across to the right {0}', d) : t('cut across {0}', d);
  }
  return t('continue {0}', fmtDist(s.dist));
}

const cap = (x) => x[0].toUpperCase() + x.slice(1);

export class Guide {
  /** @param fmtDist metres -> spoken distance, e.g. "300 feet" */
  constructor(fmtDist) { this.fmt = fmtDist; this.reset(); }

  reset() { this.said = new Set(); }

  /**
   * Call on every position update while navigating.
   * @param nav {route, name, arrived, fresh (new route or reroute), rerouted}
   * @param speed metres per second
   * @returns sentences to speak now (usually none)
   */
  update(nav, speed) {
    const out = [], r = nav.route, once = (k) => (this.said.has(k) ? false : (this.said.add(k), true));
    if (nav.arrived) { if (once('arrived')) out.push(t('You have arrived at {0}.', nav.name)); return out; }
    if (!r || !r.steps.length) return out;
    const steps = r.steps, id = (i) => `${steps.length - i}:${steps[i].kind}:${steps[i].name}`;
    const cur = steps[0], next = steps[1], left = cur.dist, v = Math.max(speed || 0, 1);
    const caution = (s) => (s.over ? ' ' + t('Caution: that is above your limit.') : '');
    if (nav.fresh) {
      this.said.add('now:' + id(0));
      const mins = Math.max(1, Math.round(r.time / 60));
      const first = cap(phrase(cur, this.fmt));
      const what = next ? t('{0}, then {1}.', first, phrase(next, this.fmt, true)) : t('{0}.', first);
      const time = mins === 1 ? t('1 minute to {0}.', nav.name) : t('{0} minutes to {1}.', mins, nav.name);
      out.push(`${nav.rerouted ? t('Rerouting.') + ' ' : ''}${what} ${time}${caution(cur)}`);
      return out;
    }
    const lead = Math.min(160, Math.max(35, v * LEAD_S + GPS_SLACK));
    if (!next) {
      if (left <= lead && once('final')) out.push(t('{0} is just ahead.', nav.name));
      return out;
    }
    if (cur.kind === 'lift') {
      // riding: say what to do at the top shortly before unloading
      if (left <= 150 && once('now:' + id(1))) out.push(t('At the top, {0}.', phrase(next, this.fmt, true)) + caution(next));
      return out;
    }
    if (left <= lead) {
      if (once('now:' + id(1))) out.push(t('{0}.', cap(phrase(next, this.fmt, true))) + caution(next));
    } else if (left <= Math.min(450, Math.max(150, v * PREP_S)) && left > lead * 1.6) {
      if (once('prep:' + id(1))) out.push(t('In {0}, {1}.', this.fmt(left), phrase(next, this.fmt, true)));
    }
    return out;
  }
}

export class Speaker {
  constructor() { this.ok = typeof speechSynthesis !== 'undefined'; this.unlocked = false; }

  /** iOS only lets speech start from a tap: call this from one. */
  unlock() {
    if (!this.ok || this.unlocked) return;
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    speechSynthesis.speak(u);
    this.unlocked = true;
  }

  say(text, urgent = false) {
    if (!this.ok || !text) return;
    if (urgent) speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = speechLang(); u.rate = 1.05;
    speechSynthesis.speak(u);
  }

  stop() { if (this.ok) speechSynthesis.cancel(); }
}
