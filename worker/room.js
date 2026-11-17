// Pure group-room logic (no Cloudflare APIs) so it can be unit tested.
export const MAX_MEMBERS = 20;
export const IDLE_MS = 12 * 60 * 60 * 1000; // rooms are wiped after 12 h without activity

const AVATARS = ['boy-ski', 'girl-ski', 'boy-board', 'girl-board'];
const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n);
const num = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : null);

export function newRoom(code, now) {
  return { code, created: now, touched: now, owner: null, resort: null, members: {}, meet: null, closures: [] };
}

/**
 * Apply one client message. `memberId` is the id this socket already joined as (or null).
 * Returns { changed, join, left, closed } or { error, message, close }.
 */
export function applyMessage(room, memberId, msg, now) {
  if (!msg || typeof msg !== 'object') return { error: 'bad_message', message: 'Bad message' };
  if (msg.t === 'hello') {
    const id = clean(msg.id, 40);
    if (!/^[A-Za-z0-9_-]{8,40}$/.test(id)) return { error: 'bad_id', message: 'Bad member id', close: true };
    const existing = room.members[id];
    // A display name is optional: without one you are "Skier 1", "Skier 2"…
    let name = clean(msg.name, 20) || (existing && /^Skier \d+$/.test(existing.name) ? existing.name : '');
    if (!name) {
      const taken = new Set(Object.values(room.members).map((m) => m.name));
      for (let n = 1; !name; n++) if (!taken.has(`Skier ${n}`)) name = `Skier ${n}`;
    }
    if (!existing && Object.keys(room.members).length >= MAX_MEMBERS) {
      return { error: 'full', message: `This group is full (${MAX_MEMBERS} people)`, close: true, closeCode: 3 };
    }
    room.members[id] = {
      id,
      name,
      avatar: AVATARS.includes(msg.avatar) ? msg.avatar : 'boy-ski',
      color: /^#[0-9a-fA-F]{6}$/.test(msg.color) ? msg.color : '#ff5a36',
      sharing: existing ? existing.sharing : false,
      pos: existing ? existing.pos : null,
      joined: existing ? existing.joined : now,
    };
    if (!room.owner) room.owner = id;
    // The group's mountain: set by the first member to arrive (the creator), so a code alone tells a
    // new member's phone which map to open.
    if (!room.resort && typeof msg.resort === 'string' && /^[a-z0-9-]{2,40}$/.test(msg.resort)) room.resort = msg.resort;
    room.touched = now;
    return { changed: true, join: id };
  }
  const me = memberId && room.members[memberId];
  if (!me) return { error: 'not_joined', message: 'Join the group first' };
  room.touched = now;
  switch (msg.t) {
    case 'pos': {
      // Only accepted while the member has opted in to sharing.
      if (!me.sharing) return { changed: false };
      const lat = num(msg.lat, -90, 90), lon = num(msg.lon, -180, 180);
      if (lat === null || lon === null) return { error: 'bad_pos', message: 'Bad position' };
      me.pos = {
        lat, lon,
        acc: num(msg.acc, 0, 100000) ?? 0,
        spd: num(msg.spd, 0, 200) ?? 0,
        hdg: num(msg.hdg, -360, 360),
        st: ['ski', 'lift', 'idle'].includes(msg.st) ? msg.st : 'idle',
        at: now, // server time, so "last updated" is comparable across phones
      };
      return { changed: true };
    }
    case 'share': {
      me.sharing = !!msg.on;
      if (msg.clear) me.pos = null; // member chose to remove their last location too
      return { changed: true };
    }
    case 'meet': {
      if (msg.point === null) { room.meet = null; return { changed: true }; }
      const p = msg.point || {};
      const lat = num(p.lat, -90, 90), lon = num(p.lon, -180, 180);
      if (lat === null || lon === null) return { error: 'bad_meet', message: 'Bad meeting point' };
      room.meet = { lat, lon, name: clean(p.name, 60) || 'Meeting point', by: me.name, at: now };
      return { changed: true };
    }
    case 'closures': {
      if (!Array.isArray(msg.list)) return { error: 'bad_closures', message: 'Bad closures' };
      room.closures = [...new Set(msg.list.filter((s) => typeof s === 'string' && /^[tl]\d{1,4}$/.test(s)))].slice(0, 300);
      return { changed: true };
    }
    case 'leave': {
      delete room.members[memberId];
      if (room.owner === memberId) room.owner = Object.keys(room.members)[0] || null;
      return { changed: true, left: true };
    }
    case 'close': {
      if (room.owner !== memberId) return { error: 'not_owner', message: 'Only the group creator can close the group' };
      return { closed: true };
    }
    case 'ping':
      return { changed: false };
    default:
      return { error: 'bad_message', message: 'Unknown message' };
  }
}

/** What every member sees. Positions of members who paused are kept but flagged. */
export function publicState(room, onlineIds, now) {
  return {
    code: room.code,
    owner: room.owner,
    resort: room.resort || null,
    now,
    max: MAX_MEMBERS,
    meet: room.meet,
    closures: room.closures,
    members: Object.values(room.members).map((m) => ({
      id: m.id, name: m.name, avatar: m.avatar, color: m.color,
      sharing: m.sharing, online: onlineIds.has(m.id), pos: m.pos,
    })),
  };
}

/**
 * What a phone may learn before joining, from the code alone: the group's mountain, and for
 * older groups with no mountain recorded, the newest shared position so the phone can find it.
 */
export function roomInfo(room) {
  const last = Object.values(room.members).map((m) => m.pos).filter(Boolean).sort((a, b) => b.at - a.at)[0];
  return { code: room.code, resort: room.resort || null, members: Object.keys(room.members).length, near: room.resort || !last ? null : { lat: last.lat, lon: last.lon } };
}
