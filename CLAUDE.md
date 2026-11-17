# Ski With Me (repository name: WeSki)

An installable web app for ski resorts: 3D mountain from LiDAR, friend groups with live GPS,
directions, voice, stats. Vanilla JS + three.js + Vite, tests in vitest, hosted on Cloudflare.
`README.md` describes the app and the data pipeline in full. Read it first. This file holds what a new
session needs that the README does not: the rules, the state of the work, and what is next.

## Rules for working here

- Develop and push only on the branch the session names (`claude/...`). Pushing deploys: GitHub Actions
  runs tests, builds, and deploys to https://weski.cjmcg10.workers.dev. No pull requests unless asked.
- Never ask for secrets in chat. The Cloudflare token is a GitHub secret and an environment network secret.
- Outside requests use the User-Agent `weski-build` and never carry the owner's name or email.
- Do not fake a browser User-Agent to get past a site that refuses automated clients. Use another source.
- The owner is not a programmer. Report in plain language: what changed, what was checked, what was not.
- Nothing has been tested on a real phone yet. Do not claim real-device behaviour.
- Run `npm test` before every push (59 tests; the resort tests load every built map).

## Decisions already made

- **Name:** the product is being renamed from WeSki to **Ski With Me** (WeSki clashes with weski.com and the
  "We Ski" app at weski.app). The rename in code, manifest, README and the Cloudflare address is NOT done yet.
  The owner checked app stores, domains, handles and trademark registers and found the name clear.
- **Launch order:** paid web app first (no app stores), then a native wrapper for the App Store and Google Play.
- **Price:** free map everywhere; $24.99 a year, $5.99 a week, $39.99 group plan.
- **Logo:** the owner prefers the "Bluebird" twin-peaks concept (three ski tracks crossing down an off-angle twin
  peak), wants it more realistic, with some versions hinting at directions. Not final.
- Launch plan document: https://claude.ai/artifact/7KCV26BCapRGtPWq5hfSFE
- Logo concepts page: https://claude.ai/artifact/R58WwJVZZNDCQLJAUZ2oLS

## Building and checking a resort

The order matters. Every step is in `tools/`.

1. OSM extract: `python3 tools/dev/osmget.py <out.osm> <west> <south> <east> <north> [splits]`. The bounding
   boxes used so far are in `tools/dev/getosm*.sh`. Extracts are large and are not in the repository.
2. Terrain: USGS 1 m tiles for the USA (see `tools/dev/getdem*.sh`), `tools/fetch_dem.py` elsewhere.
   To rebuild an existing resort without downloading terrain again:
   `python3 tools/dem_from_built.py public/data/<id> <out.tif>` (exact as long as the extent does not grow).
3. `python3 tools/build_data.py tools/resorts/<id>.json <osm> public/data/<id> <dem.tif> [...]`
   Read its connectivity report. It leaves out abandoned, removed, planned and summer-only lifts and runs,
   and draws outlined glades as one line down the middle.
4. `python3 tools/build_extras.py public/data/<id>` (surrounding terrain).
5. `python3 tools/build_zones.py tools/resorts/<id>.json <osm> public/data/<id>` (zones, ratings, piste colours,
   treeline, trims loose run ends, applies official ratings). Re-runnable at any time without terrain.
6. `python3 tools/build_index.py public/data` and `python3 tools/build_globe.py public/data`.
7. Check: `python3 tools/audit.py tools/resorts/<id>.json <osm> public/data/<id> --list`, then `npm test`,
   then look at it in a browser (`tools/dev/zshot.js` takes screenshots against a local `wrangler dev`).

`tools/dev/` holds the working scripts from earlier sessions (fetch lists, `rebuild_all.sh`, screenshot and
lift checks). They contain an old scratch path at the top; change it before running. `tools/dev/zmap.txt` maps
each resort id to the name of its OSM extract.

## Trail ratings: the rule

A wrong rating can send someone down a run above their level, so:

- **A resort's own published rating wins over OpenStreetMap.** `tools/official/<id>.json` holds the resort's
  list; `build_zones.py` applies it on every build; `python3 tools/official_ratings.py check <id>` reports
  differences, official runs missing from the map, and map runs the resort does not list.
- **A resort counts as rating-checked only when `tools/official/<id>.json` exists.** Do this for every new
  resort before it goes live.
- Runs with no rating anywhere are flagged `u` (guess). Directions count them one level harder.
  Blue-black runs (`bb`) count as half a level above blue.

Status on 2026-11-17:

| Checked against the resort's list | Source |
| --- | --- |
| Steamboat, Winter Park, Mammoth, Sugarbush | resort feed, `official_ratings.py fetch mtnpowder <resortId> <id>` (6, 5, 60, 70) |

Not yet checked (22): Vail, Breckenridge, Keystone, Park City, Heavenly, Stowe (their sites refuse automated
clients, and the page a fetch agent can read has no trail list: read the official trail map PDF instead and
write the json by hand), Copper, Jay Peak, Smugglers' Notch, Cannon, Saddleback, Brundage, and all ten
European and Japanese resorts (European sites usually publish a piste list with colours).

How the trail-map route works: have a web-fetch agent download the official PDF (10 MB limit), render pages with
`pdftoppm -r 250`, crop with PIL, read the crops, and type the run names and ratings into the json.

Known gaps after the four checks: Mammoth and Winter Park each have about 25 to 40 official runs the map
lacks or names differently (see the `check` output). Each needs a `rename` entry in the resort config or
a fix in OpenStreetMap.

## What is next

1. Rating check for the remaining 22 resorts (above), in order of popularity.
2. Rename to Ski With Me everywhere.
3. Paid web app: sign-in by email link, checkout (Stripe or a seller-of-record service), paywall, manage-plan
   screen, safety notice, terms, privacy policy, credits, a commercially licensed weather source
   (Open-Meteo's free tier is non-commercial), "report a map mistake" button, add-to-home-screen guide,
   one-page website.
4. Next US resorts: Palisades Tahoe, Killington, Big Sky, Jackson Hole, Aspen Snowmass, Beaver Creek,
   Deer Valley, Snowbird and Alta, Northstar, Telluride.
5. Native wrapper (Capacitor) for the stores: background GPS, in-app purchases, demo mode for reviewers.
6. Trademark: the owner intends to file "Ski With Me" themselves at the USPTO; Claude drafts, the owner files.
7. Open questions from the owner's phone: frame rate dropped from 120 to 30 fps at times; motion is now capped
   at 60 fps by default ("120 fps motion" in More). Awaiting their retest. "Terrain detail by distance" is
   unbuilt and only worth doing if the retest still shows drops.
