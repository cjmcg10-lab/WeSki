// Publishes the usage report: one GitHub issue labelled usage-alert (opened, updated, closed) and the weekly summary.
// GitHub emails the repository's watchers (the owners) when an issue is opened or commented on, so no other set-up is needed.
import { readState, gotWorse, LEVELS_TEXT } from './assess.mjs';

export const ALERT_LABEL = 'usage-alert';
export const SUMMARY_LABEL = 'usage-summary';

/** A tiny GitHub REST client: gh(method, path, body) -> parsed JSON. */
export function client({ token, repo, fetchFn = fetch }) {
  return async (method, path, body) => {
    const res = await fetchFn(`https://api.github.com/repos/${repo}${path}`, {
      method, headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'user-agent': 'weski-build', 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (method === 'POST' && path === '/labels' && res.status === 422) return null; // the label already exists
    if (!res.ok) throw new Error(`GitHub ${method} ${path}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    return res.status === 204 ? null : res.json();
  };
}

async function openIssue(gh, label) {
  const list = await gh('GET', `/issues?labels=${label}&state=open&per_page=10`);
  return (list || []).find((i) => !i.pull_request) || null;
}

const titleOf = (r) => {
  const top = r.rows.filter((x) => x.level === r.level)[0];
  return `Usage alert: ${LEVELS_TEXT[r.level]}${top ? ` (${top.name}: ${Math.round(top.pct)}%)` : r.blind ? ' (some figures cannot be read)' : ''}`;
};

/**
 * Open, update or close the single usage-alert issue. Returns {action: 'opened'|'updated'|'closed'|'none', worse, url}.
 * An update only edits the text (no email); a comment, which emails, is added only when something got worse.
 */
export async function publishAlert(gh, r, body) {
  await gh('POST', '/labels', { name: ALERT_LABEL, color: 'd93f0b', description: 'Usage near a plan limit (tools/usage)' });
  const open = await openIssue(gh, ALERT_LABEL);
  if (r.level === 'ok') {
    if (!open) return { action: 'none' };
    await gh('POST', `/issues/${open.number}/comments`, { body: `Everything is back under 60% of its limit (checked ${r.today}). Closing.\n\n${body}` });
    await gh('PATCH', `/issues/${open.number}`, { state: 'closed', state_reason: 'completed', body });
    return { action: 'closed', url: open.html_url };
  }
  if (!open) {
    const made = await gh('POST', '/issues', { title: titleOf(r), body, labels: [ALERT_LABEL] });
    return { action: 'opened', worse: true, url: made?.html_url };
  }
  const worse = gotWorse(readState(open.body), r);
  await gh('PATCH', `/issues/${open.number}`, { title: titleOf(r), body });
  if (worse) {
    const lines = r.rows.filter((x) => x.level !== 'ok').map((x) => `- ${LEVELS_TEXT[x.level]}: ${x.advice}`);
    await gh('POST', `/issues/${open.number}/comments`, { body: `Got worse on ${r.today}:\n\n${lines.join('\n') || '- Some figures cannot be read.'}` });
  }
  return { action: 'updated', worse, url: open.html_url };
}

/** Post the weekly summary as a comment on the standing usage-summary issue (made the first time). */
export async function publishWeekly(gh, r, body) {
  await gh('POST', '/labels', { name: SUMMARY_LABEL, color: '0e8a16', description: 'Weekly usage summary (tools/usage)' });
  let issue = await openIssue(gh, SUMMARY_LABEL);
  if (!issue) {
    issue = await gh('POST', '/issues', {
      title: 'Usage: weekly summary', labels: [SUMMARY_LABEL],
      body: 'Each Monday the usage check (`.github/workflows/usage.yml`) adds a comment here with every limit, even when all is fine, '
        + 'so a silent check is noticed. Alerts go to a separate issue labelled `usage-alert`. To stop the weekly comment, set the '
        + 'repository variable USAGE_WEEKLY to "off". See docs/USAGE_ALERTS.md.',
    });
  }
  await gh('POST', `/issues/${issue.number}/comments`, { body });
  return { url: issue.html_url };
}
