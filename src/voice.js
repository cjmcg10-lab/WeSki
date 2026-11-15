// Spoken directions. Guide decides what to say and when (pure logic, unit-tested);
// Speaker says it through the phone's built-in speech voice, which follows headphones.

const LEAD_S = 9;        // say a turn about this many seconds before reaching it
const GPS_SLACK = 15;    // metres: GPS fixes arrive about a second late and a few metres off
const PREP_S = 25;       // early "in 300 feet…" heads-up

const side = (a) => (a < 0 ? 'left' : 'right');

/** "ski Upper Northway", "bear left onto Taxi", "ride the Jet Triple"… */
export function phrase(s, fmtDist, withTurn = false) {
  const a = s.turn ?? 0, mag = Math.abs(a);
  if (s.kind === 'ski') {
    if (!withTurn) return `ski ${s.name}`;
    return mag < 25 ? `continue onto ${s.name}` : `${mag < 60 ? 'bear' : 'turn'} ${side(a)} onto ${s.name}`;
  }
  if (s.kind === 'lift') return `ride ${/^the /i.test(s.name) ? '' : 'the '}${s.name}`;
  if (s.kind === 'walk') return `walk ${fmtDist(s.dist)}`;
  if (s.kind === 'up') {
    const how = s.grade <= 0 ? 'skate back' : s.grade === 1 ? 'climb back' : 'sidestep back up';
    return `${how} ${fmtDist(s.dist)}${s.name ? ` ${s.grade <= 0 ? 'along' : 'on'} ${s.name}` : ''}`;
  }
  if (s.kind === 'cross') return `cut across ${withTurn && mag >= 25 ? `to the ${side(a)} ` : ''}${fmtDist(s.dist)}${s.to ? ` to ${s.to}` : ''}`;
  return `continue ${fmtDist(s.dist)}`;
}

const cap = (t) => t[0].toUpperCase() + t.slice(1);

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
    if (nav.arrived) { if (once('arrived')) out.push(`You have arrived at ${nav.name}.`); return out; }
    if (!r || !r.steps.length) return out;
    const steps = r.steps, id = (i) => `${steps.length - i}:${steps[i].kind}:${steps[i].name}`;
    const cur = steps[0], next = steps[1], left = cur.dist, v = Math.max(speed || 0, 1);
    const caution = (s) => (s.over ? ' Caution: that is above your limit.' : '');
    if (nav.fresh) {
      this.said.add('now:' + id(0));
      const mins = Math.max(1, Math.round(r.time / 60));
      out.push(`${nav.rerouted ? 'Rerouting. ' : ''}${cap(phrase(cur, this.fmt))}${next ? `, then ${phrase(next, this.fmt, true)}` : ''}. ${mins} minute${mins === 1 ? '' : 's'} to ${nav.name}.${caution(cur)}`);
      return out;
    }
    const lead = Math.min(160, Math.max(35, v * LEAD_S + GPS_SLACK));
    if (!next) {
      if (left <= lead && once('final')) out.push(`${nav.name} is just ahead.`);
      return out;
    }
    if (cur.kind === 'lift') {
      // riding: say what to do at the top shortly before unloading
      if (left <= 150 && once('now:' + id(1))) out.push(`At the top, ${phrase(next, this.fmt, true)}.${caution(next)}`);
      return out;
    }
    if (left <= lead) {
      if (once('now:' + id(1))) out.push(`${cap(phrase(next, this.fmt, true))}.${caution(next)}`);
    } else if (left <= Math.min(450, Math.max(150, v * PREP_S)) && left > lead * 1.6) {
      if (once('prep:' + id(1))) out.push(`In ${this.fmt(left)}, ${phrase(next, this.fmt, true)}.`);
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
    u.lang = 'en-US'; u.rate = 1.05;
    speechSynthesis.speak(u);
  }

  stop() { if (this.ok) speechSynthesis.cancel(); }
}
