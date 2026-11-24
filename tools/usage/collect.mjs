// Reads the numbers for the usage alerts: Cloudflare's GraphQL Analytics API (read-only) and the Worker's own count.
// Every figure is a daily series [{date, value}] keyed by the limit id in limits.mjs. See docs/USAGE_ALERTS.md.
import { addDays } from './assess.mjs';

const GRAPHQL = 'https://api.cloudflare.com/client/v4/graphql';
const UA = 'weski-build';
const DO_GB = 0.128; // Durable Objects are billed as 128 MB for the time they are active
const WS_RATIO = 20; // 20 incoming WebSocket messages are billed as one request

// R2 operation classes (Cloudflare R2 pricing). Deletes and aborts are free; anything not listed counts as Class A, the dearer.
const CLASS_B = new Set(['HeadBucket', 'HeadObject', 'GetObject', 'UsageSummary', 'GetBucketEncryption', 'GetBucketLocation', 'GetBucketCors', 'GetBucketLifecycleConfiguration']);
const FREE_OPS = new Set(['DeleteObject', 'DeleteObjects', 'DeleteBucket', 'AbortMultipartUpload']);
export const r2Class = (action) => (FREE_OPS.has(action) ? null : CLASS_B.has(action) ? 'b' : 'a');

const headers = () => ({
  'content-type': 'application/json', 'user-agent': UA,
  // in GitHub Actions the token comes from the secret; in a Claude container the network proxy adds it to the request
  authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN || 'added-by-proxy'}`,
});

async function accountId() {
  if (process.env.CLOUDFLARE_ACCOUNT_ID) return process.env.CLOUDFLARE_ACCOUNT_ID;
  const res = await fetch('https://api.cloudflare.com/client/v4/accounts', { headers: headers() });
  const id = (await res.json())?.result?.[0]?.id;
  if (!id) throw new Error(`no Cloudflare account visible to the token (HTTP ${res.status})`);
  return id;
}

/** One GraphQL query for one dataset. Throws a plain-language error. */
async function gql(field, body, vars, fetchFn) {
  const query = `query($a: String!, $s: Date!, $e: Date!) { viewer { accounts(filter: {accountTag: $a}) { ${field}(limit: 10000, filter: {date_geq: $s, date_leq: $e}) ${body} } } }`;
  const res = await fetchFn(GRAPHQL, { method: 'POST', headers: headers(), body: JSON.stringify({ query, variables: vars }) });
  const out = await res.json().catch(() => null);
  if (!res.ok || out?.errors?.length) {
    const msg = out?.errors?.map((e) => e.message).join('; ') || `HTTP ${res.status}`;
    const auth = res.status === 401 || res.status === 403 || /auth|permission|not authorized|access/i.test(msg);
    throw new Error(auth ? `Cloudflare refused the analytics read (${msg}): the token needs "Account Analytics: Read"` : `Cloudflare analytics error: ${msg}`);
  }
  return out?.data?.viewer?.accounts?.[0]?.[field] || [];
}

const add = (map, date, v) => map.set(date, (map.get(date) || 0) + v);
const toSeries = (map) => [...map].sort().map(([date, value]) => ({ date, value }));

/**
 * Daily series from Cloudflare for `today` (UTC date) back to the 1st of the month or 8 days, whichever is earlier.
 * Returns {series, missing, notes}. Each dataset is asked separately, so one refused read leaves the others.
 */
export async function fromCloudflare({ today, worker = 'skiwithme', fetchFn = fetch } = {}) {
  const series = {}, missing = {}, notes = [];
  let a;
  try { a = await accountId(); } catch (e) {
    const why = `could not reach Cloudflare: ${e.message}`;
    for (const id of ['workers_requests', 'workers_cpu', 'workers_cpu_ms', 'do_requests', 'do_duration', 'do_rows_read', 'do_rows_written', 'do_storage', 'r2_storage', 'r2_class_a', 'r2_class_b']) missing[id] = why;
    return { series, missing, notes };
  }
  const s = [today.slice(0, 8) + '01', addDays(today, -8)].sort()[0];
  const vars = { a, s, e: today };
  const step = async (ids, fn) => {
    try { await fn(); } catch (e) { for (const id of ids) missing[id] = e.message; }
  };

  await step(['workers_requests', 'workers_cpu', 'workers_cpu_ms'], async () => {
    const rows = await gql('workersInvocationsAdaptive', '{ sum { requests cpuTimeUs } dimensions { date scriptName status } }', vars, fetchFn);
    const all = new Map(), cpu = new Map(), mine = new Map(), over = new Map();
    for (const r of rows) {
      const d = r.dimensions.date;
      add(all, d, r.sum.requests);
      add(cpu, d, r.sum.cpuTimeUs / 1000);
      if (r.dimensions.scriptName === worker) {
        add(mine, d, r.sum.requests);
        if (/exceeded/i.test(r.dimensions.status || '')) add(over, d, r.sum.requests);
      }
    }
    series.workers_requests = toSeries(all);
    series.workers_cpu_ms = toSeries(cpu);
    series.workers_cpu = toSeries(new Map([...mine].map(([d, n]) => [d, n ? (100 * (over.get(d) || 0)) / n : 0])));
    const y = addDays(today, -1);
    if (all.get(y)) notes.push(`Yesterday the ${worker} Worker made ${(mine.get(y) || 0).toLocaleString('en-US')} of the account's ${all.get(y).toLocaleString('en-US')} Worker requests; other Workers in the same Cloudflare account share the free allowance.`);
  });
  await step(['do_requests'], async () => {
    const rows = await gql('durableObjectsInvocationsAdaptiveGroups', '{ sum { requests } dimensions { date } }', vars, fetchFn);
    const m = new Map();
    for (const r of rows) add(m, r.dimensions.date, r.sum.requests);
    series.do_requests = toSeries(m);
  });
  await step(['do_duration', 'do_rows_read', 'do_rows_written'], async () => {
    const rows = await gql('durableObjectsPeriodicGroups', '{ sum { activeTime inboundWebsocketMsgCount rowsRead rowsWritten } dimensions { date } }', vars, fetchFn);
    const dur = new Map(), rd = new Map(), wr = new Map(), ws = new Map();
    for (const r of rows) {
      const d = r.dimensions.date;
      add(dur, d, (r.sum.activeTime / 1e6) * DO_GB);
      add(rd, d, r.sum.rowsRead || 0);
      add(wr, d, r.sum.rowsWritten || 0);
      add(ws, d, (r.sum.inboundWebsocketMsgCount || 0) / WS_RATIO);
    }
    series.do_duration = toSeries(dur);
    series.do_rows_read = toSeries(rd);
    series.do_rows_written = toSeries(wr);
    // group positions arrive as WebSocket messages, billed as requests at 20 to 1
    if (series.do_requests) for (const p of series.do_requests) p.value += ws.get(p.date) || 0;
  });
  await step(['do_storage'], async () => {
    const rows = await gql('durableObjectsSqlStorageGroups', '{ max { storedBytes } dimensions { date } }', vars, fetchFn);
    const m = new Map();
    for (const r of rows) add(m, r.dimensions.date, r.max.storedBytes / 1e9);
    series.do_storage = toSeries(m);
  });
  await step(['r2_class_a', 'r2_class_b'], async () => {
    const rows = await gql('r2OperationsAdaptiveGroups', '{ sum { requests } dimensions { date actionType } }', vars, fetchFn);
    const A = new Map(), B = new Map();
    for (const r of rows) {
      const c = r2Class(r.dimensions.actionType);
      if (c) add(c === 'a' ? A : B, r.dimensions.date, r.sum.requests);
    }
    series.r2_class_a = toSeries(A);
    series.r2_class_b = toSeries(B);
  });
  await step(['r2_storage'], async () => {
    const rows = await gql('r2StorageAdaptiveGroups', '{ max { payloadSize metadataSize } dimensions { date bucketName } }', vars, fetchFn);
    const m = new Map();
    for (const r of rows) add(m, r.dimensions.date, (r.max.payloadSize + r.max.metadataSize) / 1e9);
    series.r2_storage = toSeries(m);
  });
  return { series, missing, notes };
}

// names for the Worker's own counters (worker/usage.js)
export const SELF_NAMES = {
  'req:map': 'Map files served (/data)', 'req:graph': 'Directions data served (graph.json)', 'req:weather': 'Weather requests',
  'req:status': 'Resort status requests', 'req:group-create': 'Groups created', 'req:group-ws': 'Group connections opened',
  'req:api': 'Other /api requests', 'out:weather': 'Outside requests: weather sources', 'out:status': 'Outside requests: resort status',
  'out:resend': 'Sign-in emails sent (Resend)',
};

/**
 * The Worker's own daily counts from GET <app>/api/admin/usage (needs the USAGE_SECRET the owner set). Returns
 * {series: {resend_day, resend_month}, selfCount: [[name, n]] for yesterday} or {error}.
 */
export async function fromWorker({ today, app, secret, fetchFn = fetch }) {
  if (!secret) return { error: 'USAGE_SECRET is not set, so the Worker\'s own count was not read' };
  try {
    const res = await fetchFn(`${app}/api/admin/usage?days=40`, { headers: { 'x-admin-key': secret, 'user-agent': UA } });
    if (!res.ok) return { error: `the Worker's count answered HTTP ${res.status}${res.status === 404 ? ' (USAGE_SECRET not set on the Worker?)' : ''}` };
    const { days = {} } = await res.json();
    const resend = Object.entries(days).map(([date, c]) => ({ date, value: c['out:resend'] || 0 }));
    const y = days[addDays(today, -1)] || {};
    const selfCount = Object.entries(SELF_NAMES).filter(([k]) => y[k]).map(([k, name]) => [name, y[k]]);
    return { series: { resend_day: resend, resend_month: resend }, selfCount };
  } catch (e) {
    return { error: `the Worker's count could not be read: ${e.message}` };
  }
}
