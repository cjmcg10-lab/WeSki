export const LIST_KEY = 'fcList';
export const VIEW_KEY = 'fcView';

const REQUIRED = ['id', 'name', 'tz', 'lat', 'lon', 'top', 'base'];
const valid = (r) => r && REQUIRED.every((k) => r[k] != null);

export function cleanList(raw) {
  const seen = new Set();
  return (Array.isArray(raw) ? raw : []).filter((r) => valid(r) && !seen.has(r.id) && seen.add(r.id));
}

export const has = (list, id) => list.some((r) => r.id === id);

export const add = (list, resort) => (has(list, resort.id) ? list : [...list, resort]);

export const remove = (list, id) => list.filter((r) => r.id !== id);

export function move(list, id, delta) {
  const from = list.findIndex((r) => r.id === id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= list.length) return list;
  const next = [...list];
  next.splice(to, 0, next.splice(from, 1)[0]);
  return next;
}

export function insertAt(list, resort, index) {
  if (has(list, resort.id)) return list;
  const next = [...list];
  next.splice(Math.min(Math.max(index, 0), next.length), 0, resort);
  return next;
}

export function loadList(prefs) {
  return cleanList(prefs.get(LIST_KEY, []));
}

export function saveList(prefs, list) {
  prefs.set(LIST_KEY, list);
  return JSON.stringify(prefs.get(LIST_KEY, null)) === JSON.stringify(list);
}

const CONFIDENCE_RANK = { High: 3, Medium: 2, Low: 1 };

export function sortRows(rows, date) {
  if (!date) return rows;
  const key = (row) => {
    const day = row.forecast?.scored?.days.find((d) => d.date === date);
    return day?.status === 'ok' ? day : null;
  };
  return rows
    .map((row, order) => ({ row, order, day: key(row) }))
    .sort((a, b) => {
      if (!a.day !== !b.day) return a.day ? -1 : 1;
      if (!a.day) return a.order - b.order;
      return b.day.score - a.day.score
        || (CONFIDENCE_RANK[b.day.confidence.level] - CONFIDENCE_RANK[a.day.confidence.level])
        || a.order - b.order;
    })
    .map((x) => x.row);
}

export function topPickId(rows, date) {
  const first = sortRows(rows, date)[0];
  const day = first?.forecast?.scored?.days.find((d) => d.date === date);
  return day?.status === 'ok' ? first.resort.id : null;
}
