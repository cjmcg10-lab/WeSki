# Forecast plan

Written 2026-11-21 from Connor's spec (`docs/FORECAST_SPEC.md`) and Zach's decisions. This file and the GitHub
issues are the single source of truth for the Forecast work. Zach and Connor both work from here.

## What it is

A new **Forecast** section in SkiWithMe. You search for any downhill ski resort in the world, add it to a watchlist,
compare daily ski-quality scores on a calendar (mountains as rows, dates as columns), and tap any cell to see that day
hour by hour. The map, groups and tracking stay as they are.

The core flow: **search any resort → add it to the watchlist → compare daily scores and best windows → tap a day for
hourly conditions.**

## Decisions

| Decision | Who, when |
| --- | --- |
| Build it inside SkiWithMe, not as a separate SkiReport app | Zach, 2026-11-21 |
| Connor's spec is the target; where it differs from earlier ideas, the spec wins | Zach, 2026-11-21 |
| The whole Forecast section is free, not part of the SkiWithMe Pass | Zach, 2026-11-21 |
| Build the calendar on the 60 built resorts first, then add worldwide search right after | Zach, 2026-11-21 |
| Go live phase by phase; each issue says what makes it releasable | Zach, 2026-11-21 |
| Weather starts from the existing `/api/weather` (NWS in the USA, MET Norway elsewhere), both licensed for commercial use. Open-Meteo's hosted service only where its terms allow commercial use | Existing WeSki decision, kept |

## Scoring model (spec v1)

The model assumes an all-around, lift-served skier, so an 80 means about the same day anywhere. Weights live in a
versioned module (`src/forecast/score/`), separate from the UI.

| Component (per hour, base and upper, 0 to 100) | Weight |
| --- | --- |
| Expected snow surface (state carried from the previous 48 to 72 h) | 45% |
| Visibility (fog versus high cloud, heavy snowfall) | 25% |
| Wind exposure (wind and gusts at that elevation) | 20% |
| Temperature and precipitation comfort | 10% |

- Hour score = the average of base and upper when both are valid. Never invent summit wind or visibility.
- Day score = `0.60 × average of all ski-hour scores + 0.40 × best average of any 3 consecutive ski hours`
  (70 and 85 give 76). Round only for display.
- Confidence is High, Medium or Low with a reason, kept separate from the score.
- Statuses: "Closed" only for a confirmed closure; "Insufficient data" when there isn't enough to score.

The full rules are in issue #1 and the spec.

## Work items

| # | Item | Depends on | Suggested owner |
| --- | --- | --- | --- |
| [#1](https://github.com/cjmcg10-lab/WeSki/issues/1) | Tracking issue: scoring model, rules, acceptance test | | both |
| [#2](https://github.com/cjmcg10-lab/WeSki/issues/2) | Phase 1: scoring engine and tests | | scoring and data |
| [#3](https://github.com/cjmcg10-lab/WeSki/issues/3) | Phase 2: calendar and day view on the 60 resorts (first usable version) | #2 | screens |
| [#4](https://github.com/cjmcg10-lab/WeSki/issues/4) | Phase 3: worldwide catalog and search | #3 | screens |
| [#5](https://github.com/cjmcg10-lab/WeSki/issues/5) | Phase 4: snow history, confidence and forecast archive | #2, #3 | scoring and data |
| [#6](https://github.com/cjmcg10-lab/WeSki/issues/6) | Phase 5: provisional mountains by map pin | #4 | screens |
| [#7](https://github.com/cjmcg10-lab/WeSki/issues/7) | Phase 6: trip planner | #4, #5 | screens |
| [#8](https://github.com/cjmcg10-lab/WeSki/issues/8) | Phase 7: more weather sources and ensemble ranges | #5 | scoring and data |
| [#9](https://github.com/cjmcg10-lab/WeSki/issues/9) | Phase 8: calibrate the scores | #5 | scoring and data |
| [#10](https://github.com/cjmcg10-lab/WeSki/issues/10) | Operating hours, closures, lift holds and grooming reports | #2 | scoring and data |
| [#11](https://github.com/cjmcg10-lab/WeSki/issues/11) | Offline use and caching | #3 | screens |
| [#12](https://github.com/cjmcg10-lab/WeSki/issues/12) | Final acceptance test and handover write-up | all above | both |

Suggested split: one person owns scoring and data, the other owns the screens. They meet at the scoring engine's
output shape, which #2 writes down first in `docs/FORECAST_SCORING.md`.

## How we avoid working on the same thing

Follow `docs/DEVELOPMENT_PROCESS.md`. In short:

1. **Claim before you start.** Assign the issue to yourself on GitHub (or comment "Taking this") before writing any
   code. An issue with an assignee belongs to that person; ask them before touching it.
2. **One branch per issue**, started from the tip of `claude/ecstatic-hamilton-2gsp2q`, named
   `claude/<issue number>-<short name>` (for example `claude/2-forecast-scoring`). Comment the branch name on the issue.
3. **Pull request, checks, review.** Open a pull request with "Closes #N"; the Checks workflow must pass and the other
   person reviews before it is merged.
4. **Keep to the issue's files.** Shared files (`src/main.js`, `index.html`, `src/styles.css`, the language files)
   are where clashes happen: make small, focused changes there and merge the deploy branch into yours often.
5. **Going live:** merging into `claude/ecstatic-hamilton-2gsp2q` (or `main`) deploys to the live site. Merge a phase
   only when its "Releasable when" check passes.
6. **Starting a Claude Code session on an issue:** open the WeSki repository and say "Work on issue #N". The issue,
   this file, `docs/DEVELOPMENT_PROCESS.md` and `CLAUDE.md` contain everything the session needs.

## Acceptance test (from the spec)

The project is done when all five steps listed in issue #1 pass with live weather (see #12): the Jay Peak, Burke and
Cannon flow; swapping in a small hill, a resort outside North America and a Southern Hemisphere resort with no code
changes; a provisional map pin; the formula and edge-case checks; and a narrow-phone check where scores and confidence
make sense without colour.

## Open questions

- Keep word labels (Epic, Great, Good, Fair, Poor) next to the numbers?
- What happens to the separate SkiReport repository (zdemanche/SkiReport)? It could be archived now that the work
  lives here.
