# How we build SkiWithMe

Agreed 2026-11-21 (Zach). Every change to this repository follows these steps, whether a person or a Claude session
writes it. The goal is that Zach and Connor never work on the same thing by accident, every change is checked before it
reaches the live site, and anyone can see where the work stands.

## The lifecycle

1. **Plan: a GitHub issue first.** Every piece of work starts as an issue written so anyone, including a fresh Claude
   session, could pick it up: goal, files involved, tasks, "Done when" and "Releasable when". Use the "Work item"
   template. Bigger features get a tracking issue with sub-issues (the Forecast work is #1).
2. **Claim it.** Assign the issue to yourself (or comment "Taking this") before you start. An issue with an assignee
   belongs to that person; ask before touching it.
3. **Branch.** One branch per issue, started from the tip of `main`, named
   `claude/<issue number>-<short name>` (for example `claude/2-forecast-scoring`). If a Claude Code session is given
   its own branch name, use that and mention the issue number in commits. Comment the branch name on the issue.
4. **Build and test locally.** `node tools/maps_r2.mjs pull --all`, then `npm test` before every push. Look at screen
   changes in a browser at phone width and desktop width. Keep to the issue's scope; small, focused changes in shared
   files (`src/main.js`, `index.html`, `src/styles.css`, the language files).
5. **Pull request.** Open a pull request into `main` with "Closes #N" and the template
   filled in, in plain language. Open it as a draft while work is still going; mark it ready when it is done.
6. **Checks.** The "Checks" workflow runs the tests and the build on every pull request. It must pass.
7. **Review.** The other person reviews: Zach reviews Connor's pull requests and Connor reviews Zach's. A Claude review
   can help, but a person approves. Address comments by pushing more commits to the same branch.
8. **Merge = release.** Merging into `main` deploys to the live site through the
   "Deploy" workflow. Merge only when the checks pass, the review is approved and the issue's "Releasable when" check
   holds. Use "Squash and merge" so each change is one commit with a plain-language message.
9. **Verify live.** Confirm the "Deploy" run succeeded and the change works at https://skiwithme.builtbyroger.app.
10. **Close.** The merged pull request closes the issue. Update `CLAUDE.md` or the feature's plan file if something a
    future session needs to know changed.

## Urgent fixes

When the live site is broken: open an issue anyway (one line is fine), branch, fix, open a pull request, and merge once
the checks pass. Review can happen right after the merge in that case. Say so in the pull request.

## Repository settings that enforce this (an owner sets these once)

In GitHub, Settings → Branches → add a branch protection rule (or ruleset) for `main`:

- Require a pull request before merging, with 1 approval.
- Require the "Checks / test-and-build" status check to pass.
- Do not allow direct pushes (owners can still override in an emergency).

Until those settings are on, this process is a team agreement rather than something GitHub enforces.

## For Claude sessions

- Read this file, `CLAUDE.md` and the issue before starting. Claim the issue only if the person asked you to work on it.
- Never push straight to `main`: push your branch and open a pull request.
- Report in plain language what changed, what was checked and what was not.
