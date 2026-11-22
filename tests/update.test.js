import { describe, it, expect } from 'vitest';
import { watchUpdates } from '../src/update.js';

// A stand-in for navigator.serviceWorker and a registration, enough to fire the events the watcher listens for.
function fakes({ controller = true } = {}) {
  const on = (o) => { o.ls = {}; o.addEventListener = (n, f) => { (o.ls[n] ||= []).push(f); }; o.fire = (n) => (o.ls[n] || []).forEach((f) => f()); return o; };
  const sw = on({ controller: controller ? {} : null });
  const reg = on({ installing: null, updates: 0, update() { this.updates++; return Promise.resolve(); } });
  return { sw, reg };
}
function setup(o = {}) {
  const { sw, reg } = fakes(o);
  const log = { shown: 0, reloads: 0 };
  let safe = !!o.safe, clock = 0;
  const w = watchUpdates({ sw, isSafe: () => safe, show: () => log.shown++, reload: () => log.reloads++, now: () => clock, gap: 1000 });
  w.attach(reg);
  return { sw, reg, w, log, setSafe: (v) => { safe = v; }, tick: (ms) => { clock += ms; } };
}

describe('new version watcher', () => {
  it('shows the bar when a new version takes over while something is under way', () => {
    const { sw, w, log } = setup();
    sw.fire('controllerchange');
    expect(w.ready).toBe(true);
    expect(log).toEqual({ shown: 1, reloads: 0 });
    sw.fire('controllerchange');               // a second takeover does not stack a second bar
    expect(log.shown).toBe(1);
  });

  it('reloads by itself only when it is safe', () => {
    const a = setup({ safe: true });
    a.sw.fire('controllerchange');
    expect(a.log).toEqual({ shown: 0, reloads: 1 });

    const b = setup();
    b.sw.fire('controllerchange');
    b.w.tryReload();
    expect(b.log.reloads).toBe(0);              // still busy: wait
    b.setSafe(true);
    b.w.tryReload();
    b.w.tryReload();
    expect(b.log.reloads).toBe(1);              // once safe, one reload only
  });

  it('ignores the very first install on a screen with no worker yet', () => {
    const { sw, w, log } = setup({ controller: false });
    sw.fire('controllerchange');
    expect(w.ready).toBe(false);
    expect(log.shown).toBe(0);
    sw.fire('controllerchange');               // a later takeover is a real new version
    expect(log.shown).toBe(1);
  });

  it('notices a newly installed worker becoming active', () => {
    const { reg, w, log } = setup();
    const worker = { state: 'installing', ls: {}, addEventListener(n, f) { (this.ls[n] ||= []).push(f); } };
    reg.installing = worker;
    reg.fire('updatefound');
    worker.state = 'installed'; worker.ls.statechange.forEach((f) => f());
    expect(w.ready).toBe(false);
    worker.state = 'activated'; worker.ls.statechange.forEach((f) => f());
    expect(w.ready).toBe(true);
    expect(log.shown).toBe(1);
  });

  it('asks the server for updates at most once per gap', async () => {
    const { reg, w, tick } = setup();
    w.check();
    await Promise.resolve();
    expect(reg.updates).toBe(0);                // just started: too soon
    tick(1000); w.check(); w.check();
    await Promise.resolve();
    expect(reg.updates).toBe(1);
    w.check(true);
    await Promise.resolve();
    expect(reg.updates).toBe(2);
  });
});
