# SkiWithMe

**Your mountain. Your crew.** https://skiwithme.builtbyroger.app

## About

SkiWithMe is a web app for a day on the mountain with friends. It shows the whole resort as a 3D map built from real
LiDAR terrain, puts your group on it with live GPS, and gives turn-by-turn directions down the runs to a friend, a lift
or a meeting point. It installs from the browser onto the home screen (no app store yet) and works offline once a resort
is downloaded. 60 resorts are built so far, in the USA, France, Switzerland, Italy, Austria and Japan.

The map is free everywhere. A SkiWithMe Pass (day, week or season) adds directions, creating groups and full history;
the Forecast section is free. Made by Built By Roger LLC. Not an official product of any resort.

## Features

- **3D and 2D maps:** every run and lift (lifts animated on their cables), rated the way the resort rates them
- **Friend groups:** join with a 6-character code; location sharing is opt-in and can be paused
- **Directions:** downhill on runs, up on lifts, within your chosen difficulty; optional spoken directions
- **Stats and history:** speed, runs, distance and vertical, replayed on the map, stored on your phone
- **Weather:** summit and base forecasts with ski alerts
- **Forecast** (in progress): compare ski-day scores for the mountains you watch, on one calendar
- Ten languages, dark and light themes

## Run it locally

```
npm install
node tools/maps_r2.mjs pull --all   # map files live in Cloudflare R2 (needs a Cloudflare token)
npm run dev                         # the app alone
npm run worker:dev                  # the app plus the group, account and weather server, on http://127.0.0.1:8787
npm test                            # about 40 seconds; the resort tests need the maps pulled
```

Merging a pull request into `main` deploys to the live site (see [How we work](#how-we-work)).

## How the maps are built

Each resort is built from three free sources: national LiDAR terrain (USGS in the USA; swisstopo, IGN, BEV and GSI
elsewhere), OpenStreetMap for runs, lifts and buildings, and the resort's own trail map, which wins on ratings.
`tools/pipeline.py <id>` runs every step and writes a score card of what needs a look. Start with
[`docs/ADDING_MOUNTAINS.md`](docs/ADDING_MOUNTAINS.md).

## Docs

| File | What it covers |
| --- | --- |
| [`docs/MAPS.md`](docs/MAPS.md) | How the maps and directions work: zones, ratings, accuracy checks, uphill rules, code layout, deploys |
| [`docs/ADDING_MOUNTAINS.md`](docs/ADDING_MOUNTAINS.md) | Adding a resort with the one-command pipeline, and where map files are stored |
| [`docs/MOUNTAIN_CHECKLIST.md`](docs/MOUNTAIN_CHECKLIST.md) | The checks every mountain must pass, and where each one stands |
| [`docs/PAID_TIER.md`](docs/PAID_TIER.md) | Free versus Pass, prices, accounts and payments |
| [`docs/PRIVACY_DATA.md`](docs/PRIVACY_DATA.md) | What skier data is collected and how it is stored |
| [`docs/FORECAST_PLAN.md`](docs/FORECAST_PLAN.md) | The Forecast section: plan, decisions and work items ([spec](docs/FORECAST_SPEC.md)) |
| [`docs/DEVELOPMENT_PROCESS.md`](docs/DEVELOPMENT_PROCESS.md) | How changes are made: issues, branches, pull requests, review |
| [`CLAUDE.md`](CLAUDE.md) | Working notes: decisions made, project status and what is next |

## How we work

Every change starts from a GitHub issue, is built on its own branch and reaches `main` through a reviewed pull request.
Details in [`docs/DEVELOPMENT_PROCESS.md`](docs/DEVELOPMENT_PROCESS.md).

## Credits

Runs, lifts, buildings and places © OpenStreetMap contributors (ODbL). Terrain: USGS 3DEP (public domain), swisstopo
swissALTI3D, IGN RGE ALTI (Licence Ouverte), BEV ALS DTM (CC BY 4.0), GSI elevation tiles, TINITALY / INGV (CC BY 4.0),
Mapzen / AWS Terrain Tiles. Trees: Meta and WRI High Resolution Canopy Height Maps (CC BY 4.0). Globe: Natural Earth and US Census state lines. Weather: US National Weather Service (public
domain) and MET Norway (CC BY 4.0). The full list is in the app at [`/legal/credits`](public/legal/credits.html).
