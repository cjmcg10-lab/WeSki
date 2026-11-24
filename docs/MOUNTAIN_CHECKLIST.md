# Mountain checklist

Every mountain in SkiWithMe, new or already live, should pass every item on this list. When a
mountain is added, copy the "New mountain" list into the commit or session notes and tick it off.
When a mountain already live is improved, update its row in "Where each mountain stands" at the end.

The commands are in `tools/` and are explained in `docs/MAPS.md` and `CLAUDE.md` ("Building and checking a
resort"). The owner does not need to run them; this list is also how to see what is left.

## New mountain

`tools/new_resort.py` and `tools/pipeline.py` do sections 1, 2 and 3b and run the checks in 3 and 4 by themselves;
the score card in `tools/cards/<id>.md` says which items still need a person. See `docs/ADDING_MOUNTAINS.md`.

### 1. Set up
- [ ] Config file `tools/resorts/<id>.json`: name, region, country, map area (bounding box), the resort
      boundary name (`area_name`), and the rating scheme (North American or European colours).
- [ ] OpenStreetMap extract downloaded for that area (`tools/dev/osmget.py`).
- [ ] Terrain downloaded, and it covers every lift station, including high glacier lifts at the edges.

### 2. Build
- [ ] `build_data.py` run; its connectivity report read. Every dead-end run or lone lift either fixed
      (a `links` entry, `keep_ways`, or an OpenStreetMap fix) or written down under "Known problems".
- [ ] `build_extras.py` run (the surrounding mountains).
- [ ] `build_zones.py` run (zones, piste colours, treeline, run ends trimmed, official ratings applied).
- [ ] `build_index.py` and `build_globe.py` run: the mountain appears in the home list and on the globe.

### 3. Ratings (safety: a wrong rating can send someone down a run above their level)
- [ ] The resort's own run list obtained (resort feed, trail map PDF, or a trail map image read by hand).
- [ ] `tools/official/<id>.json` written from it.
- [ ] `python3 tools/official_ratings.py check <id>` run: misspelled names fixed with `rename`,
      official runs missing from the map listed, map runs the resort does not list looked at.
- [ ] No run left with a guessed rating (`u`) that the resort actually rates.
- [ ] Runs that change rating part way down given the harder rating for the whole run.

### 3b. Does it exist? (added 2026-11-20: nothing goes on the map that the resort does not show)
- [ ] `python3 tools/verify_exists.py <id> <osm> --list` run after `build_zones.py` (it must be re-run after every
      `build_zones.py`). Read every "run hidden" and "lift to review" line.
- [ ] Every run the resort shows but the list missed (an inset, a terrain-park area, a second map page) added to
      `tools/official/<id>.json`: with a rating under `runs`, or under `confirm` {name: where it was seen} for park
      terrain and runs whose rating cannot be read. Mount Snow's Carinthia and Sunbrook were missed this way.
- [ ] Anything OpenStreetMap shows that the resort does not (a lift built for future terrain, a run cut for homes,
      an off-piste line) listed under `hide` {name: reason with the source} in the official json.
- [ ] Every "lift to review" checked against the resort's map or lift list (skiresort.com lift pages work by curl).
      A real public lift stays; one the resort does not show goes under `hide`.
- [ ] `npm test` passes (it fails if hiding cut a lift off from the rest of the mountain).

### 4. Map accuracy
- [ ] `tools/audit.py --list` shows no run missing inside the resort boundary.
- [ ] Every lift on the resort's lift list is on the map, with the right kind (chair, gondola, cable car,
      T-bar, platter, rope tow, carpet, train). No removed, planned or summer-only lifts.
- [ ] The official json has the resort's `"lifts"`, and `python3 tools/whole_check.py <id>` reports nothing joined
      to the resort on the ground that the map lacks (whole areas such as Palisades' Sherwood bowl, a gondola from
      town) and no neighbour resort merged in.
- [ ] Runs join where they really join: no runs stopping short of a junction, none running past it.
- [ ] Directions work from the base to the top of every lift, and every run can be reached.
- [ ] Lodges, base areas, restaurants, ticket offices and car parks have the right names.
- [ ] Night-skiing runs marked, if the resort has any.
- [ ] Glades and terrain parks show correctly.
- [ ] Lines checked against aerial photos: `python3 tools/align_trails.py <id> <naip|swiss|ign|at|gsi> --only all`
      for the OpenStreetMap runs and `--only traced --write` for runs drawn by hand (see "Line accuracy" below).
      Look at the `--debug` pictures for every run it moved or flagged. Also `--shift` (whole map offset; set
      `shift_m` when the best shift is over 6 m and clearly better), and `node tools/check_downhill.mjs <id>` (no run
      may climb; fix with `node tools/fit_terrain.mjs`).

### 5. Looks and content
- [ ] A real photo of the mountain (free licence, ideally winter, showing the slopes) in `public/photos/`
      as `<id>.jpg` (768 x 360) and `<id>-s.jpg` (208 x 112), with the photographer and licence in
      `public/photos/credits.json`.
- [ ] Name, region and position correct in the home list, on the globe and on the mountain card.
- [ ] Summit, vertical, trail and lift counts on the card look right against the resort's own figures.
- [ ] Weather shows for summit and base at sensible heights.
- [ ] Checked in a browser: the overview, 3D and 2D views, the legend colours (European resorts use
      their own colours), and a few close-ups at lift tops and busy junctions.

### 6. Languages and voice (added 2026-11-18)
- [ ] Switch the app to another language (More → Language, for example German or Japanese) and open the
      mountain: menus, the card and the legend are translated, and run, lift and lodge names stay as the
      resort spells them.
- [ ] Place names made of common words (hut, top station, lake, peak, base lodge…) show their meaning
      in brackets under the real name on the map, in search and in the place card. Proper names are left
      alone.
- [ ] Any new on-screen wording added for this mountain is in `src/i18n/en.js` with a new number and
      translated in all nine other language files (`npm test` checks for gaps).
- [ ] Spoken directions: with a non-English language chosen, ask for directions and check the voice
      speaks that language (it follows the app language and picks a voice for it). Change the language
      while directions are on and check the next instruction comes in the new language.

### 7. Getting in and out (added 2026-11-18)
- [ ] From the home globe, open the mountain, then go back: the globe and the "Find your mountain" list
      return at their normal size.
- [ ] Open a saved ski day from History at this mountain, then back out to the globe: the globe is
      resized to fit the window like it normally is (this was broken and fixed on 2026-11-18).
- [ ] Start a group here and join it from the start screen with the code: the app flies to this mountain.

### 8. Release
- [ ] `npm test` passes (it loads every built map).
- [ ] The offline download size is reasonable.
- [ ] Pushed, the deploy succeeded, and the live site serves the new mountain.
- [ ] Its row added to "Where each mountain stands" below, and `CLAUDE.md` updated.

## Where each mountain stands (2026-11-18)

"Ratings" means the resort's own published ratings have been applied (`tools/official/<id>.json` exists).
"Photo" means a real photo is in place of the drawn picture.
Every mountain, including those built before 2026-11-18, should also be checked against sections 6
and 7 (languages, spoken directions, and getting back out to the globe). These checks are about the app
as a whole, so one pass at any mountain covers the app; the per-mountain part is the place names.

| Mountain | Map built | Ratings checked | Photo | Known problems |
| --- | --- | --- | --- | --- |
| Breckenridge | yes | yes | yes | Rebuilt 2026-11-23 with the full method, on the preview only (not live until pushed to R2); dead ends 11 to 0, unreachable runs 0 to 0, the rest listed with reasons in tests/fixtures/connections/breckenridge.json; Middle 4 O'Clock kept by way_names after an OpenStreetMap rename; Peak 7 bowls joined from Imperial by a walk |
| Brundage Mountain | yes | yes (four trail maps from brundage.com, read by hand, 2026-11-18) | no | Rebuilt 2026-11-23 with the full method, on the preview only (not live until pushed to R2); dead ends 0 to 0, unreachable runs 0 to 0, the rest listed with reasons in tests/fixtures/connections/brundage.json; map grew to the true summit (2,377 m): terrain downloaded again |
| Cannon Mountain | yes (rebuilt 2026-11-23, `pipeline.py`, connections checked) | yes | yes | |
| Copper Mountain | yes | yes (2026-27 trail map and the Copper Bowl and Spaulding insets, read by hand, 2026-11-18) | yes | six runs OpenStreetMap lacks are drawn by hand (approximate); Rebuilt 2026-11-23 with the full method, on the preview only (not live until pushed to R2); dead ends 11 to 0, unreachable runs 0 to 0, the rest listed with reasons in tests/fixtures/connections/copper-mountain.json |
| Geto Kogen | yes | yes (course map and course page on getokogen.com, colours read by hand, 2026-11-18) | no | Rebuilt 2026-11-23 with the full method, on the preview only (not live until pushed to R2); dead ends 0 to 0, unreachable runs 0 to 0, the rest listed with reasons in tests/fixtures/connections/geto-kogen.json |
| Heavenly | yes | yes | yes | Rebuilt 2026-11-23 with the full method, on the preview only (not live until pushed to R2); dead ends 0 to 0, unreachable runs 0 to 0, the rest listed with reasons in tests/fixtures/connections/heavenly.json |
| Jay Peak | yes (rebuilt 2026-11-23, `pipeline.py`, connections checked) | yes (2025-26 trail map; symbols read automatically next to each printed name, 2026-11-18) | yes | Full Moon's run-out now joins Interstate (config link) |
| Keystone | yes | yes | yes | Rebuilt 2026-11-23 with the full method, on the preview only (not live until pushed to R2); dead ends 14 to 9, unreachable runs 0 to 0, the rest listed with reasons in tests/fixtures/connections/keystone.json; 22 more runs and one more lift from new OpenStreetMap data |
| La Plagne | yes | yes (La Plagne piste map 2026 from la-plagne.com, line colours read by hand, 2026-11-18) | yes | Rebuilt 2026-11-23 with the full method, on the preview only (not live until pushed to R2); dead ends 0 to 0, unreachable runs 0 to 0, the rest listed with reasons in tests/fixtures/connections/la-plagne.json |
| Les Arcs | yes | yes (Paradiski piste map 2026, Les Arcs and Peisey-Vallandry side, read by hand, 2026-11-18) | yes | loose "Droset" piece; Rebuilt 2026-11-23 with the full method, on the preview only (not live until pushed to R2); dead ends 1 to 0, unreachable runs 0 to 0, the rest listed with reasons in tests/fixtures/connections/les-arcs.json |
| Les Contamines | yes | yes (piste map 2025-26 from the resort's ski pass site, read by hand, 2026-11-18) | yes | Rebuilt 2026-11-23 with the full method, on the preview only (not live until pushed to R2); dead ends 0 to 0, unreachable runs 0 to 0, the rest listed with reasons in tests/fixtures/connections/les-contamines.json |
| Mammoth Mountain | yes | yes | yes | 20 official runs still to trace (see below); Rebuilt 2026-11-23 with the full method, on the preview only (not live until pushed to R2); dead ends 21 to 6, unreachable runs 0 to 0, the rest listed with reasons in tests/fixtures/connections/mammoth.json |
| Park City | yes | yes | yes | Rebuilt 2026-11-23 with the full method, on the preview only (not live until pushed to R2); dead ends 9 to 8, unreachable runs 0 to 0, the rest listed with reasons in tests/fixtures/connections/park-city.json |
| Pizol | yes | yes (the resort's piste report on infosnow.ch: number, name and colour, 2026-11-18) | yes | Rebuilt 2026-11-23 with the full method, on the preview only (not live until pushed to R2); dead ends 0 to 0, unreachable runs 0 to 0, the rest listed with reasons in tests/fixtures/connections/pizol.json |
| Saalbach Hinterglemm | yes | yes (the resort's interactive map data, 155 numbered runs matched by piste number, 2026-11-18) | yes | two pieces of "Zwölferkogel - Nordabfahrt" and one of "Sonnenmulde" carry a run number in OpenStreetMap that would make them easier; left at the map rating; Rebuilt 2026-11-23 with the full method, on the preview only (not live until pushed to R2); dead ends 5 to 4, unreachable runs 1 to 1, the rest listed with reasons in tests/fixtures/connections/saalbach.json; trees fall back to the generated ones (the canopy step ran out of memory on this size of map) |
| Saddleback | yes (rebuilt 2026-11-23, `pipeline.py`, connections checked) | yes | yes | |
| SkiWelt | yes | yes (the resort's interactive map data, matched by run name, 2026-11-18) | yes | Rebuilt 2026-11-23 with the full method, on the preview only (not live until pushed to R2); dead ends 2 to 2, unreachable runs 0 to 0, the rest listed with reasons in tests/fixtures/connections/skiwelt.json |
| Smugglers' Notch | yes (rebuilt 2026-11-23, `pipeline.py`, connections checked) | yes | no | |
| Steamboat | yes | yes | yes | Rebuilt 2026-11-23 with the full method, on the preview only (not live until pushed to R2); dead ends 1 to 0, unreachable runs 0 to 0, the rest listed with reasons in tests/fixtures/connections/steamboat.json |
| Stowe | yes (rebuilt 2026-11-23, `pipeline.py`, connections checked) | yes (2026-27 winter trail map the owner uploaded, read by hand, 2026-11-18) | no | glades carry no rating on the resort's map and keep the OpenStreetMap rating; Home Run is a ski-home trail with no lift at its foot (left as is) |
| Sugarbush | yes (rebuilt 2026-11-23, `pipeline.py`, connections checked) | yes | yes | F.I.S. and Lower Exterminator now join the runs their ends lie on; lifts Easy Up and Schoolhouse Lift from the resort's list are not on the map |
| Tignes – Val d'Isère | yes | yes (Tignes – Val d'Isère piste map from tignes.net, read by hand, 2026-11-18) | yes | Rebuilt 2026-11-23 with the full method, on the preview only (not live until pushed to R2); dead ends 5 to 4, unreachable runs 2 to 2, the rest listed with reasons in tests/fixtures/connections/tignes-val-disere.json; area_name and osm_bbox added (the download had spread into Les Arcs and Courchevel) |
| Vail | yes | yes (2026-27 Front Side, Back Bowls and Blue Sky Basin maps from vail.com, read by hand, 2026-11-18) | yes | Rebuilt 2026-11-23 with the full method, on the preview only (not live until pushed to R2); dead ends 0 to 0, unreachable runs 0 to 0, the rest listed with reasons in tests/fixtures/connections/vail.json; OpenStreetMap renamed Ledges and Silk Road: earlier names kept with way_names |
| Val Thorens | yes | yes (Val Thorens piste map from les3vallees.com, read by hand, and the Orelle piste map for the Orelle side, 2026-11-18) | yes | Rebuilt 2026-11-23 with the full method, on the preview only (not live until pushed to R2); dead ends 4 to 4, unreachable runs 1 to 1, the rest listed with reasons in tests/fixtures/connections/val-thorens.json |
| Winter Park | yes | yes | yes | 25 to 40 official runs missing or named differently; Rebuilt 2026-11-23 with the full method, on the preview only (not live until pushed to R2); dead ends 6 to 0, unreachable runs 0 to 0, the rest listed with reasons in tests/fixtures/connections/winter-park.json |
| Zermatt – Cervinia | yes | yes (Cervino Ski Paradise map 2026-27 from cervinia.it, colour badges read and checked against its printed list, 2026-11-18) | yes | planned Breitboden–Rosenritz chair left out until it opens; Rebuilt 2026-11-23 with the full method, on the preview only (not live until pushed to R2); dead ends 1 to 1, unreachable runs 2 to 3, the rest listed with reasons in tests/fixtures/connections/zermatt.json; trees from the previous build (the canopy step ran out of memory) |
| Killington | yes (rebuilt 2026-11-23, `pipeline.py`, connections checked) | yes (trail map, read by hand) | yes | a few old runs OpenStreetMap still lists (Hawkeye, Horn, Old Vagabond) are not reachable; nine old trails OpenStreetMap added in 2026 as freeride lines (Hawkeye, Nor'easter, Thunderball, Old Sundog, Old Sunrise Trail, Gold Dust...) are hidden: not on the resort's map |
| Sunday River | yes (rebuilt 2026-11-23, `pipeline.py`, connections checked) | yes (trail map, read by hand) | yes | |
| Sugarloaf | yes (rebuilt 2026-11-23, `pipeline.py`, connections checked) | yes (trail map, read by hand; Snowfields, Burnt Mountain and Brackett Basin glades take the area's experts-only rating) | yes | Snowfields reached by a short walk from the Timberline lift top (added by hand) |
| Okemo | yes (rebuilt 2026-11-23, `pipeline.py`, connections checked) | yes (trail map, read by hand) | yes | Snow Trak ends among the slopeside homes, away from every lift (left as is) |
| Mount Snow | yes (rebuilt 2026-11-23, `pipeline.py`, connections checked) | yes (trail map, read by hand) | yes | |
| Stratton | yes (rebuilt 2026-11-23, `pipeline.py`, connections checked) | yes (resort feed, mtnpowder id 1) | yes | Tree Top Way is a ski-home trail to the Tree Top homes (left as is) |
| Loon Mountain | yes (rebuilt 2026-11-23, `pipeline.py`, connections checked) | yes (trail map, read by hand) | no (no usable free photo found yet) | |
| Whiteface | yes (rebuilt 2026-11-23, `pipeline.py`, connections checked) | yes (trail map, read by hand) | yes | parts of "The Slides" (hike-to expert terrain) are not joined to a lift |
| Waterville Valley | yes (rebuilt 2026-11-23, `pipeline.py`, connections checked) | yes (2025-26 trail map from skimap.org, read by hand) | yes | Old Tecumseh joined to Terry's Trail by hand |
| Bolton Valley | yes (rebuilt 2026-11-23, `pipeline.py`, connections checked) | yes (2024-25 trail map from skimap.org, read by hand) | yes | Showtime, Spellbinder and Twice as Nice Woods joined to Intro (Timberline midstation) by hand |
| Burke Mountain | yes (rebuilt 2026-11-23, `pipeline.py`, connections checked) | yes (2025 trail map from skimap.org, read by hand) | yes | |
| Magic Mountain | yes (rebuilt 2026-11-23, `pipeline.py`, connections checked) | yes (2026 trail map from skimap.org, read by hand) | yes | Pitch Black and Black Magic joined to Upper Wizard at the summit by hand; lift list from the resort's snow report (2026-11-23, #59), all five on the map |
| Berkshire East | yes (rebuilt 2026-11-23, `pipeline.py`, connections checked) | yes (2024 and 2026 trail maps from skimap.org, read by hand) | no (no free winter photo found) | Gronk Glades and Horace's Grove missing from OpenStreetMap |
| Catamount | yes (rebuilt 2026-11-23, `pipeline.py`, connections checked) | yes (2024-25 and 2025-26 trail maps from skimap.org, read by hand) | no (no free photo found) | Birch Glades East and West missing from OpenStreetMap |
| Ragged Mountain | yes (rebuilt 2026-11-23, `pipeline.py`, connections checked) | yes (2023 trail map from skimap.org, read by hand) | yes (distant view) | Triple Take and Double Take missing from OpenStreetMap |
| Pats Peak | yes (rebuilt 2026-11-23, `pipeline.py`, connections checked) | yes (2026 trail map's printed trail list) | no (no free photo found) | |
| Mohawk Mountain | yes (rebuilt 2026-11-23, `pipeline.py`, connections checked) | yes (2025 trail map) | yes | Back Bowl, Indian Crossing and Ridge Run are not in OpenStreetMap: traced by hand (`extra_trails`) |
| Powder Ridge | yes (rebuilt 2026-11-23, `pipeline.py`, connections checked) | yes (2026 trail map's numbered list; parks left out) | yes | Gun Powder Run and Powder Keg are not in OpenStreetMap: traced by hand |
| Ski Sundown | yes (rebuilt 2026-11-23, `pipeline.py`, connections checked) | yes (2024-25 trail map) | no (no free photo found) | Loop is not in OpenStreetMap: traced by hand |
| Mount Southington | yes (rebuilt 2026-11-23, `pipeline.py`, connections checked) | yes (2025 trail map) | yes (night) | OpenStreetMap maps only 9 of 14 runs; Avalanche, Liftline, Northstar, The Glacier, Thunderbolt and Whoopee traced by hand; links join Turkey Turn and the Thunderbolt top |
| Bretton Woods | yes (rebuilt 2026-11-23, `pipeline.py`, connections checked) | yes (2025-26 trail map; glades from its printed glade lists) | yes | Black Fly, Mom Said No, Old Man, Peppersass, Stinger and Think Pink are not in OpenStreetMap: traced by hand from the map's glade codes (RN to RT, ZF, WI) |
| Hunter Mountain | yes (rebuilt 2026-11-23, `pipeline.py`, connections checked) | yes (trail map, 400 dpi render) | no (only a snowless spring photo) | HP Poma lift added by hand (`extra_lifts`); twelve runs not in OpenStreetMap traced by hand (Macombs, Park Avenue, Park Avenue West, Bucky's Run, Gramercy Park, Madison Square, KMC Drive, Milky Way, The Milky Glades, Belt Parkway Bypass, Mad Box, Woodstock Glades); KMC Drive starts at the Kaatskill Mountain Club, which no run reaches |
| Windham Mountain | yes (rebuilt 2026-11-23, `pipeline.py`, connections checked) | yes (trail map; "advanced" blue recorded as blue-black) | yes | What, Wooly Bear and a line through Whataride Glades traced by hand; a hand-made link that sent skiers 104 m uphill into Whataride Glades was removed (the glade is reached from Windfall) |
| Wachusett | yes (rebuilt 2026-11-23, `pipeline.py`, connections checked) | yes (trail map) | yes | Polar Kids traced by hand; Lower Conifer renamed from OpenStreetMap's Lower Conifer Connection |
| Jackson Hole | yes (2026-11-21, `pipeline.py`) | yes (trail map, skimap.org 37233: label colours only, so a black label is black, or double where OpenStreetMap says double) | yes | 6 listed runs not on the map; Rebuilt 2026-11-23 with the full method, on the preview only (not live until pushed to R2); dead ends 2 to 0, unreachable runs 7 to 7, the rest listed with reasons in tests/fixtures/connections/jackson-hole.json |
| Palisades Tahoe | yes (2026-11-21, `pipeline.py`) | yes (resort feed (mtnpowder 61)) | no | 114 feed entries not on the map (gates, cliffs, named lines inside bowls: to sort into `not_runs`/`same_as`); Alpine Meadows' Beaver and Estelle bowls joined to Summit Six as walks (approximate); Base to Base Gondola two-way; Rebuilt 2026-11-23 with the full method, on the preview only (not live until pushed to R2); dead ends 20 to 3, unreachable runs 1 to 1, the rest listed with reasons in tests/fixtures/connections/palisades-tahoe.json; 2026-11-23 tracing pass (preview only): of 83 listed runs not on the map, 26 drawn from the trail map, terrain and photo (config extra_trails, all approximate), 19 matched to OpenStreetMap lines (rename, way_names, split_ways, same_as) and 3 explained as not runs; 35 left with reasons in the official json's left_untraced (mostly the Shirley Lake/Silverado and Gold Coast insets, which no available map file has) |
| Deer Valley | yes (2026-11-21, `pipeline.py`) | yes (resort feed (mtnpowder 49)) | no | 10 listed runs not on the map; upper/mid/lower parts rated as whole runs; Rebuilt 2026-11-23 with the full method, on the preview only (not live until pushed to R2); dead ends 5 to 5, unreachable runs 1 to 1, the rest listed with reasons in tests/fixtures/connections/deer-valley.json; 2026-11-23 tracing pass (preview only): all 10 listed runs now on the map: 4 glades drawn (DT's Trees, Gumby Glade, Four Ply, Son of Rattler), 6 matched to OpenStreetMap lines under other names |
| Solitude | yes (2026-11-21, `pipeline.py`) | yes (resort feed (mtnpowder 65)) | no | 17 listed runs not on the map; Rebuilt 2026-11-23 with the full method, on the preview only (not live until pushed to R2); dead ends 7 to 6, unreachable runs 0 to 0, the rest listed with reasons in tests/fixtures/connections/solitude.json; 2026-11-23 tracing pass (preview only): all 6 explained: Evergreen Chutes and Highway to Heaven drawn (approximate), Serenity Upper/Lower named on OpenStreetMap's Serenity/F.I.S. ways, the two terrain-park entries listed as not runs |
| Crystal Mountain | yes (2026-11-21, `pipeline.py`) | yes (resort feed (mtnpowder 80)) | no | terrain is 1 m LiDAR only in part, the rest the 10 m national model; Silver Basin joined to Chair 6 as a hike; 6 listed runs not on the map; Rebuilt 2026-11-23 with the full method, on the preview only (not live until pushed to R2); dead ends 14 to 4, unreachable runs 2 to 2, the rest listed with reasons in tests/fixtures/connections/crystal-mountain.json; Silver Basin run-outs and the walk into the Northway area are approximate: check on the trail map; 2026-11-23 tracing pass (preview only): A-Basin and Campbell Basin drawn (approximate, open bowls), Powder Bowl, Three Way Peak, Silver King and The Throne matched to the OpenStreetMap lines in those zones |
| Snowshoe | yes (2026-11-21, `pipeline.py`) | yes (resort feed (mtnpowder 2)) | no | 18 listed runs not on the map; Rebuilt 2026-11-23 with the full method, on the preview only (not live until pushed to R2); dead ends 0 to 0, unreachable runs 0 to 0, the rest listed with reasons in tests/fixtures/connections/snowshoe.json; 2026-11-23 tracing pass (preview only): Shamrock and Black Bear drawn (village condo connectors), Cubb Run Ext. is the lower part of Cubb Run |
| Big Sky | yes (2026-11-21, `pipeline.py`) | yes (2026-27 trail maps (skimap.org), cheaper-model reading plus second look at disagreements) | no | 33 listed runs not on the map; platters Tweener and Homer have no run from their tops (marked isolated: check whether they are public); One and Only gondola two-way; Rudy and Porcupine had no readable symbol; Rebuilt 2026-11-23 with the full method, on the preview only (not live until pushed to R2); dead ends 2 to 2, unreachable runs 5 to 5, the rest listed with reasons in tests/fixtures/connections/big-sky.json |
| Snowbird | yes (2026-11-21, `pipeline.py`) | yes (trail map (skimap.org), two-pass reading) | no | 16 listed runs not on the map; Westward Ho joined from Aggie's Alley; Rebuilt 2026-11-23 with the full method, on the preview only (not live until pushed to R2); dead ends 24 to 19, unreachable runs 0 to 2, the rest listed with reasons in tests/fixtures/connections/snowbird.json |
| Alta | yes (2026-11-21, `pipeline.py`) | yes (trail map (skimap.org), two-pass reading) | no | 11 listed runs not on the map; Rebuilt 2026-11-23 with the full method, on the preview only (not live until pushed to R2); dead ends 25 to 25, unreachable runs 0 to 0, the rest listed with reasons in tests/fixtures/connections/alta.json |
| Telluride | yes (2026-11-21, `pipeline.py`) | yes (2024 winter trail map (skimap.org), two-pass reading) | no | 15 listed runs not on the map; Revelation, Black Iron and Prospect bowls and Goat Path have no symbol on the map (OpenStreetMap rating kept); Rebuilt 2026-11-23 with the full method, on the preview only (not live until pushed to R2); dead ends 36 to 3, unreachable runs 4 to 0, the rest listed with reasons in tests/fixtures/connections/telluride.json |
| Snow Valley | yes (automatic build, 2026-11-23) | yes (2026 trail map, skimap.org 38368, read by hand) | no | AI pass 2026-11-23 (issue #45), preview only, not live: Show Off, Little Bowl and East Bowl joined to the slope above them (approximate); Bobcat Alley, Snake Run, The Edge and West Run are on the resort's map but not in OpenStreetMap (not traced); Chairs 7 and 14 not in OpenStreetMap |
| Sugar Bowl | yes (automatic build, 2026-11-23) | yes (2025 trail map, skimap.org 49331, read by hand) | no | AI pass 2026-11-23 (issue #45), preview only, not live: unreachable runs 6 to 0, dead ends 3 to 0; Mt. Judah's Century Club, Roller Pass and Judah Bowl reached on foot along the ridge from the Summit Chair; South Bowl Road, Turn Roger and Duck's Quack hidden (off the map); Hannes Schroll not in OpenStreetMap |
| Sundance | yes (automatic build, 2026-11-23) | yes (2025 trail map, skimap.org 42894: rated by line and label colour) | no | AI pass 2026-11-23 (issue #45), preview only, not live: connections were already clean; Black Forest not in OpenStreetMap |
| Taos Ski Valley | yes (automatic build, 2026-11-23) | yes (2026 trail map, skimap.org 48818, read by hand) | no | AI pass 2026-11-23 (issue #45), preview only, not live: six lifts (2, 4, 7, 7A, 8, Kachina) were cut off from the base: the Lift 1 top now joins White Feather and Psycho Path (High Five is missing from OpenStreetMap); 13 listed runs not in OpenStreetMap (Rhoda's, Spencer's, Snakedance, Edelweiss and more on the front side): not traced |
| Timberline Lodge | yes (automatic build, 2026-11-23, 10 m terrain) | yes (2025 trail map, skimap.org 45658, read by hand) | no | AI pass 2026-11-23 (issue #45), preview only, not live: unreachable runs 4 to 0: Sand Canyon, Zigzag Glacier, West Crater Rim, Old Chute and Zigzag Side Country are outside the area boundary and hidden |
| Welch Village | yes (automatic build, 2026-11-23) | yes (2025-27 trail map and Back Bowl map, skimap.org 37164 and 45776) | no | AI pass 2026-11-23 (issue #45), preview only, not live: Amazing Grace, Cannon Ball, Jon Jon and Ski Bob are on the map but not in OpenStreetMap |
| Whitewater | yes (automatic build, 2026-11-23, 30 m terrain) | yes (2026-27 trail map's printed trail lists, skimap.org 48860) | no | AI pass 2026-11-23 (issue #45), preview only, not live: Trash Chutes hidden (not on the resort's lists, no way up); False Signal's access not traced; 19 listed runs not in OpenStreetMap (Short Side area and others) |
| Tremblant | yes (automatic build (#106), AI-assisted pass 2026-11-23 (#45), on the preview only) | yes (resort feed, mtnpowder 4; names matched with the 2025-26 and 2026-27 trail maps) | no | The owner saw runs stopping short and stray pieces: short joining pieces between two parts of a run were dropped as copies (fixed in build_data for every map); Curé Deslauriers, Promenade, all of Sissy Schuss, Roger McCarthy and lower Dernier Cri added (tagged as parks in OSM); 21 names matched so every listed run has the resort's rating; Banzaï, Marie-Claude Asselin and Tunnel carried on to Short Cut (hand-drawn); two stray crossing pieces left out; a patrol practice chair and a chair on no resort map hidden; run bottoms at the north base end 28-43 m from the lift loading (left as mapped) |
| Whistler Blackcomb | yes (automatic build, 2026-11-23, 30 m terrain; on the preview only) | no (2026 trail maps found, skimap.org 44243/44244, not yet read) | yes | patrol number from the trail map added to the SOS sheet; 16 Flute and other hike-to runs not reachable and 10 doubled runs left as the gate accepted them |
| Chamonix | coming soon | no | yes | |
| Niseko | coming soon | no | no | |
| Bridger Bowl | yes | yes (trail map, 2026-11-24) | no | Automatic build (#106), AI pass 2026-11-24 (preview only); ridge terrain joined by hike links from the Bridger top; Schlasman's joined from Southbound and Southern Drawl (was cut off); on the resort's list but not on the map: Baby Bear, Cathy's Cross, Eagle, Exit Chute, Fox Den, Glenn's Glade, High Traverse, Kurt's, Last Chance, Lower Nose, Mayo's, Moose Meadows, North Bowl Road, Reggie's Rodeo, Summer Road, The Nose, WASMA, Zits |
| Brighton | yes | yes (trail map, 2026-11-24) | no | Automatic build (#106), AI pass 2026-11-24 (preview only); Barrett's Glade hidden (not on the map); Sol-Bright runs off toward Solitude (allowed with reason); on the resort's list but not on the map: Boll Weevil, Boundary Chute, Captain Hook, Chicken Out, Clark's Roost, Diagonal Chute, Elk Park Access, Great Western, JB's, Majestic Main, Mary Main, Old Western, Pick 'Em Up, Race Course, Randy's Chute, SS Traverse, Sawbuck, Scree Chute, Short Shot, Slalom Hill, Spaghetti, State Street, Waterfall |
| Bromley Mountain | yes | yes (trail map, 2026-11-24) | no | Automatic build (#106), AI pass 2026-11-24 (preview only); on the resort's list but not on the map: Finish Line |
| Bromont Montagne d'Expérience | yes | yes (trail map, 2026-11-24) | no | Automatic build (#106), AI pass 2026-11-24 (preview only); three runs OpenStreetMap marks closed (fermé) hidden; on the resort's list but not on the map: Calgary, Cleveland, Connex Prk, Cornwall, Delray, Evo Prk, Fort Lauderdale, Fulford, Hero Prk, Ini Prk, Knowlford, Miami, Mystic, Napa, Oakland, Plattsburgh, SBX Prk, Santa Monica, Sonoma, Vallée des Bonbons |
| Camelback Mountain | yes | yes (trail map, 2026-11-24) | no | Automatic build (#106), AI pass 2026-11-24 (preview only); on the resort's list but not on the map: Cold Shoulder, Evergreen Alley, Home Again, Kartrite's Connection, Pokawachne Pass, Rabbit Hole, Racer's Edge, Trails End |
| Cascade Mountain | yes | yes (trail map, 2026-11-24) | no | Automatic build (#106), AI pass 2026-11-24 (preview only); on the resort's list but not on the map: Cottontail |
| Castle Mountain | yes | yes (trail map, 2026-11-24) | no | Automatic build (#106), AI pass 2026-11-24 (preview only); 30 m terrain |
| China Peak Mountain | yes | yes (trail map, 2026-11-24) | no | Automatic build (#106), AI pass 2026-11-24 (preview only) |
| Cranmore Mountain | yes | yes (trail map, 2026-11-24) | no | Automatic build (#106), AI pass 2026-11-24 (preview only); on the resort's list but not on the map: Blue Branch, C-More's Return, Gentoo Lane, Quick Way, Redline Glade, Southway, Stemboggen Glades |
| Crested Butte Mountain | yes | yes (trail map, 2026-11-24) | no | Automatic build (#106), AI pass 2026-11-24 (preview only); Teocalli Bowls walk out to Schofield Road (16 dead ends to 0); the Peak a hike from the High Lift; 88 OpenStreetMap lines in the EX areas confirmed as extreme; on the resort's list but not on the map: Alley Loop, Banana High Entrance, Cat Road to Paradise Bowl, Elk Ave., Grand Traverse, Grounds, Houston Canyon, Mary Jo, North Star, Ptarmigan, Roosters, Teocalli 2 Bowl, Teocalli Bowl, Top of High Lift, Topsy, Windy Gap |
| Cypress Mountain | yes | yes (trail map, 2026-11-24) | no | Automatic build (#106), AI pass 2026-11-24 (preview only); 30 m terrain; on the resort's list but not on the map: Cascade, Detention Glades, Fork, Lower Fork, PGS |
| Dodge Ridge | yes | yes (trail map, 2026-11-24) | no | Automatic build (#106), AI pass 2026-11-24 (preview only); T-Bar 643 joined from the Boulder Creek top (was cut off); on the resort's list but not on the map: Fast Eddies, Morningside |
| Eldora | yes | yes (trail map, 2026-11-24) | no | Automatic build (#106), AI pass 2026-11-24 (preview only); on the resort's list but not on the map: Mary's Way |
| Fernie Alpine | yes | yes (trail map, 2026-11-24) | no | Automatic build (#106), AI pass 2026-11-24 (preview only); five climbing runs moved onto the terrain (6 to 1); on the resort's list but not on the map: Ballet, Bear Cub, Big Bang, Deep Space, Fly Line, Hot Spot, Lower Ballet, Mitchy Chutes, Nice Dish, Orange Trail, Shooting Star, Trent's, Up Right, Wilsons Roll, Wimp Chutes |
| Gore Mountain | yes | yes (trail map, 2026-11-24) | no | Automatic build (#106), AI pass 2026-11-24 (preview only); on the resort's list but not on the map: Pipeline |
| Grand Targhee | yes | yes (trail map, 2026-11-24) | no | Automatic build (#106), AI pass 2026-11-24 (preview only); K-1, Lost Warrior and Thunder Trees joined (3 unreachable to 0) |
| Great Divide | yes | yes (trail map, 2026-11-24) | no | Automatic build (#106), AI pass 2026-11-24 (preview only); on the resort's list but not on the map: Bucket Drop, Eldorado Headwall, Gloster, Hal's Traverse, Hayhook, Kinnickinnick, Little's, North Woods, Pluto, Shady Lane |
| Gunstock Recreation Area | yes | yes (trail map, 2026-11-24) | no | Automatic build (#106), AI pass 2026-11-24 (preview only); on the resort's list but not on the map: Penny's Playground |
| Holiday Valley | yes | yes (trail map, 2026-11-24) | no | Automatic build (#106), AI pass 2026-11-24 (preview only); on the resort's list but not on the map: Fiddler's Elbow, Moonshadow |
| Homewood | yes | yes (trail map, 2026-11-24) | no | Automatic build (#106), AI pass 2026-11-24 (preview only); new Homewood Gondola still mapped by OpenStreetMap as the Madden Chair; on the resort's list but not on the map: Wash Pan |
| 49° North Mountain (`49-north-mountain`) | yes (automatic build #106, AI pass 2026-11-24, connections checked) | yes (49 Degrees North trail map (skimap.org/skimaps/view/45104)) | no | ratings read from the trail map; Dreamer #3 is OpenStreetMap's Payday #3. |
| Afton Alps (`afton-alps`) | yes (automatic build #106, AI pass 2026-11-24, connections checked) | yes (Afton Alps trail map (skimap.org/skimaps/view/37396)) | no | ratings read from the trail map; no lift list read. |
| Alyeska (`alyeska`) | yes (automatic build #106, AI pass 2026-11-24, connections checked) | yes (Alyeska winter trail map by James Niehues (skimap.org/skimaps/view/27953) | no | ratings read from the Niehues trail map; Money 1 and 2 joined by the hike from Glacier Bowl Express. |
| Angel Fire (`angel-fire`) | yes (automatic build #106, AI pass 2026-11-24, connections checked) | yes (Angel Fire 2026-27 trail map by James Niehues (skimap.org/skimaps/view/49280)) | no | ratings read from the 2026-27 map; new Angel Express chair added (proposed in OpenStreetMap); hike-to C-4, Nitro, Detonator, Baa-Da-Bing joined. |
| Apex Mountain (`apex-mountain`) | yes (automatic build #106, AI pass 2026-11-24, connections checked) | yes (Apex Mountain trail map (skimap.org/skimaps/view/27990)) | no | ratings read from the trail map; Twenty Two, Gunbarrel, Peashooter joined to Grandfather's Trail. |
| Arapahoe Basin (`arapahoe-basin`) | yes (automatic build #106, AI pass 2026-11-24, connections checked) | yes (Arapahoe Basin trail report (resort feed) | no | ratings and lifts from the resort feed (mtnpowder 93); 5 East Wall lines not on the resort's list hidden; still held: 9 Steep Gullies runs and Lightning Trees, Crags end at the highway or below the Zuma base (the resort lists a hike-back trail, not mapped). Held by the gate: 11 dead-end runs. |
| Aspen Highlands (`aspen-highlands`) | yes (automatic build #106, AI pass 2026-11-24, connections checked) | yes (Aspen Highlands 2026-27 trail map (skimap.org/skimaps/view/49175)) | no | ratings read from the 2026-27 map; Highland Bowl lines joined by the hike from Loge Peak; Five Trees chair (not the resort's) hidden. |
| Aspen Mountain (`aspen-mountain`) | yes (automatic build #106, AI pass 2026-11-24, connections checked) | yes (Aspen Mountain 2026-27 trail map (skimap.org/skimaps/view/49174)) | no | ratings read from the 2026-27 map; America's Downhill (drawn along Ruthie's Run) hidden. |
| Aspen Snowmass (`aspen-snowmass`) | yes (automatic build #106, AI pass 2026-11-24, connections checked) | yes (Snowmass 2026-27 trail map (skimap.org/skimaps/view/49176)) | no | ratings read from the 2026-27 map. |
| Attitash Mountain (`attitash-mountain`) | yes (automatic build #106, AI pass 2026-11-24, connections checked) | yes (Attitash trail map 2023 (skimap.org/skimaps/view/25217)) | no | ratings read from the 2023 map (the 2025 one is too blurred). |
| Banff Sunshine Village (`banff-sunshine-village`) | yes (automatic build #106) | no (OpenStreetMap ratings, labelled not checked) | no | not done in the AI pass (ratings not read). |
| Bear Valley (`bear-valley`) | yes (automatic build #106, AI pass 2026-11-24, connections checked) | yes (Bear Valley trail map 2025 (skimap.org/skimaps/view/45900)) | no | ratings read from the 2025 map; still held: 19 runs end in Bear Valley Village, which the trail map says has no return lift (shuttle). Held by the gate: 19 dead-end runs. |
| Beaver Creek (Arrowhead Mountain) (`beaver-creek-arrowhead-mountain`) | yes (automatic build #106) | no (OpenStreetMap ratings, labelled not checked) | no | not done in the AI pass (ratings not read). |
| Belleayre Mountain Ski Center (`belleayre-mountain-center`) | yes (automatic build #106, AI pass 2026-11-24, connections checked) | yes (Belleayre 2024-26 trail map (skimap.org/skimaps/view/39221)) | no | ratings read from the 2024-26 map; 12 pieces of the old Highmount area hidden (not on the map). |
| Big White (`big-white`) | yes (automatic build #106) | no (OpenStreetMap ratings, labelled not checked) | no | not done in the AI pass (ratings not read). |
| Blue Mountain (`blue-mountain-ontario`) | yes (automatic build #106, AI pass 2026-11-24, connections checked) | yes (Blue trail report (resort feed) | no | Craigleith Ski Club's V-Hill chair and 6 runs (a separate private club) taken out; all runs reachable. |
| Blue Mountain (`blue-mountain-pennsylvania`) | yes (automatic build #106) | no (OpenStreetMap ratings, labelled not checked) | no | not done in the AI pass (ratings not read). |
| Bogus Basin Mountain Recreation Area (`bogus-basin-mountain-recreation`) | yes (automatic build #106, AI pass 2026-11-24, connections checked) | yes (Bogus Basin day map by James Niehues (skimap.org/skimaps/view/40248)) | no | ratings read from the Niehues day map. |
| Boyne Mountain (`boyne-mountain`) | yes (automatic build #106, AI pass 2026-11-24, connections checked) | yes (Boyne Mountain 2023 trail map by James Niehues (skimap.org/skimaps/view/28488)) | no | ratings read from the 2023 Niehues map. |
| Brian Head (`brian-head`) | yes (automatic build #106, AI pass 2026-11-24, connections checked) | yes (Brian Head 2026 trail map (skimap.org/skimaps/view/43896)) | no | ratings read from the 2026 map; Navajo side joined to the rest (Kodachrome pieces OpenStreetMap lacks). |

Not yet tracked per mountain (do these as each mountain is next worked on): the lift-list check, the
directions check to every lift top, place names, and the browser close-ups in sections 4 and 5. Several
mountains also have a few dead-end runs listed in their build's connectivity report.
Connections (2026-11-23): `tools/check_connections.py` (see "Connections" in `docs/ADDING_MOUNTAINS.md`); the 30 rows
marked "connections checked" have an allow-list in `tests/fixtures/connections/` that the tests hold them to.


Automatic builds (2026-11-23): the 100 mountains of the first automatic batch are not in the table above. Their state
is in `tools/bulk/batch-1.md` (gate result, why held, numbers) and each one's card in `tools/cards/<id>.md`. They meet
this checklist only in part: ratings are OpenStreetMap's (not checked against the resort, and the app says so), no
photo, no browser close-ups, and no person has looked at their joins.

AI checking pass, group 4 of 5 (2026-11-24, issue #45, branch `claude/45-ai-pass-4`): Mt. Hood Skibowl, Mt Norquay,
Mt Seymour, Mt. Spokane, Northstar, Pajarito, Panorama, Pico, Powder Mountain, Purgatory, Red Mountain, Red River,
Revelstoke, Sandia Peak, Ski Santa Fe, Schweitzer, Seven Springs, Sierra-at-Tahoe, Silver Mountain and SilverStar now have
`tools/official/<id>.json` (ratings and lift list read by hand from each resort's trail map on skimap.org, with the
easier-than-OpenStreetMap readings looked at a second time), connections checked with reasons in
`tests/fixtures/connections/<id>.json`, and patrol numbers where the trail map prints one. All 20 pass the gate. Powder
Mountain (follow-up 2026-11-24, branch `claude/45-powder-mountain`, owner's decision): its five member lifts (Village,
Mary's, Raintree, Primetime, Foxtrot) are hidden with the terrain only they reach (Primetime and Raintree areas, Mary's
Bowl, the east side of Lefty's Canyon below the Village top); James Peak is joined by the hike from Lightning Ridge and
Lefty's Canyon by its uptracks; the 13 Powder Country runs end at the shuttle stop (a bus, not a lift) and are explained
in the config's `dead_end_notes`, which `tools/bulk/gate.py` no longer counts against the dead-end limit. Still to do at all 20: the runs each card
lists as "on the resort's list but not on the map" (not traced), photos, browser close-ups.

## Runs on the resort's list but not yet on the map (2026-11-19)

`python3 tools/official_ratings.py check <id>` gives the names. 165 were missing on 2026-11-18; 11 remain (2026-11-20). The rest
were found under another name (`rename`, `way_names`, `split_ways`, `same_as`), explained as not separate runs
(`not_runs`: lift numbers misread, area names, play areas, backcountry gates), or drawn by hand (`extra_trails`,
marked `traced`, approximate: placed from the trail map between neighbouring runs on aerial photos).

| Mountain | Still missing | Notes |
| --- | --- | --- |
| SkiWelt | 0 | 2026-11-20, from the 2025-26 map the owner uploaded: 33 (practice slope at Itter) drawn; the other seven are not on that map and are explained in `not_runs` |
| Big Sky | 7 | 2026-11-23: 33 -> 7. Gullies 1-6, Erika's Glade, Lost Frontier renamed; Three Forks 1-3, Lady Yaya, Secret Meadow named on OpenStreetMap ways; Bone Crusher = Bonecrusher Hiking Area; 12 drawn by hand (`why` in the config). Left: Class 5 and 6 (no room between Class 4 and Rock Creek without drawing over mapped lines), Oxbow, Launcher Road, Final Final (tie error near 300 m in that corner, no free strip in the canopy map), Half Moon and Ore Cart (could not be told apart from mapped runs) |
| Snowbird | 2 | 2026-11-23: 15 -> 2. W. 2nd Long/Short, 2nd S. On-Ramp, Chip's Run/Phone 3 Road, Get Serious Chutes renamed; Thunder Bowl is the lower part of High Saddle (`split_ways`); Mozzarella Bowl named on an unnamed way; 6 drawn by hand. Left: Roger's Run (label not found on the map), Y'ser Gully (label too small to read on the 1920 px map) |
| Telluride | 3 | 2026-11-23: 15 -> 3. Humboldt Draw renamed; Sundance upper/lower, Bail Out black/blue and Dew Drop Drain named on OpenStreetMap ways; Gold Hill Chutes 6-10 = Gold Hill 6 to 10 (`same_as`, `confirm`); 5 drawn by hand. Left: Grouse Glade and Heritage Trail (Prospect Nordic area: could not be placed apart from Enchanted Forest, Holy Cow and Double Cabins), Nastar (label not found) |
| Kimberley Alpine | yes (automatic build (#106), AI-assisted pass 2026-11-23 (#45), on the preview only) | no (no usable trail map found: skimap.org 25206 has no text and was not read) | no | no connection problems; 30 m terrain |
| Kirkwood | yes (automatic build (#106), AI-assisted pass 2026-11-23 (#45), on the preview only) | no (skimap.org 38415 seen, not read run by run) | no | Palisades and Reuter bowls (Lightning, KGF, Jeff's Line) joined by walks from Cornice Express |
| Lake Louise | yes (automatic build (#106), AI-assisted pass 2026-11-23 (#45), on the preview only) | no (skimap.org 37301/37302 too small to read reliably) | no | no connection problems; 30 m terrain |
| Le Massif | yes (automatic build (#106), AI-assisted pass 2026-11-23 (#45), on the preview only) | no (only a summer bike map on skimap.org was read) | no | nine off-piste zones no lift reaches left out (drop_ways); now passes the gate; emergency line from the resort's summer map |
| Lost Trail | yes (automatic build (#106), AI-assisted pass 2026-11-23 (#45), on the preview only) | no (skimap.org 45770 symbols stand apart from labels; not read) | no | no connection problems |
| Loveland Basin | yes (automatic build (#106), AI-assisted pass 2026-11-23 (#45), on the preview only) | no (skimap.org 35275 too small to read reliably) | no | Continental Divide ridge terrain joined by walks from Lift 9 (gates 1S-5S, 1N-5N, Ridge Cat); now passes the gate |
| Lutsen Mountains | yes (automatic build (#106), AI-assisted pass 2026-11-23 (#45), on the preview only) | no (two PDF maps without text, not read) | no | no connection problems |
| Mad River Glen | yes (automatic build (#106), AI-assisted pass 2026-11-23 (#45), on the preview only) | yes (2025 trail map, label colours read by hand) | no | no connection problems; patrol number from the map |
| Marmot Basin | yes (automatic build (#106), AI-assisted pass 2026-11-23 (#45), on the preview only) | no (not read) | no | Marmot Cirque joined by walks from the Knob Quad; 30 m terrain |
| Monarch Mountain | yes (automatic build (#106), AI-assisted pass 2026-11-23 (#45), on the preview only) | no (no recent winter map read) | no | Mirkwood Basin and the ridge east of it joined by walks from Breezeway; now passes the gate |
| Mont-Sainte-Anne | yes (automatic build (#106), AI-assisted pass 2026-11-23 (#45), on the preview only) | no (no recent winter map on skimap.org) | no | no connection problems |
| Mont Sutton | yes (automatic build (#106), AI-assisted pass 2026-11-23 (#45), on the preview only) | yes (2026-27 trail map: printed trail list, symbols read from a 500 dpi render) | no | two old chairs not on the resort map hidden; Starlet and Coucou joined to chair I; Sous-bois IV B not in OSM |
| Montana Snowbowl | yes (automatic build (#106), AI-assisted pass 2026-11-23 (#45), on the preview only) | no (skimap.org 30534 too small; lift list readable only) | no | no connection problems |
| Mount Ashland | yes (automatic build (#106), AI-assisted pass 2026-11-23 (#45), on the preview only) | yes (2025-26 trail map, read by hand) | no | now passes the gate (24% unrated length is now rated); boundary-line traverses kept as unlisted links |
| Mount Rose | yes (automatic build (#106), AI-assisted pass 2026-11-23 (#45), on the preview only) | no (not read) | no | no connection problems |
| Mount Sunapee | yes (automatic build (#106), AI-assisted pass 2026-11-23 (#45), on the preview only) | yes (2025-26 trail map, read by hand from enlarged crops) | no | Hawes's Hideout and Sunrise Glades share their last 145 m (allow-listed) |
| Mount Washington | yes (automatic build (#106), AI-assisted pass 2026-11-23 (#45), on the preview only) | no (2024-25 PDF read for names and the First Aid number only) | no | Gold Rush glades, D1 Trees and the Outback joined from Eagle Express and Boomerang; Billabong and an unnamed Outback track still lead nowhere (allow-listed); 30 m terrain |
| Mt. Bachelor | yes (automatic build (#106), AI-assisted pass 2026-11-23 (#45), on the preview only) | no (winter map not downloaded) | no | catch lines joined from the Summit Express top |
| Mt. Hood Meadows | yes (automatic build (#106), AI-assisted pass 2026-11-23 (#45), on the preview only) | no (skimap.org 39646 not read) | no | upper bowls joined from Cascade Express; Sunrise Parking Runout ends at a car park (allow-listed) |
| Alta | 4 | 2026-11-23: 11 -> 4. 180 Bend, Nina's, Patsey Marley, Piney Glade, EBT to Collins renamed (the map's spellings); Christmas Tree and Fred's Slot drawn by hand. Left: High Race Course, High Sunspot, West Rustler, Baldy Shoulder (area labels with no drawn line; the slopes are already crossed by High Traverse, Race Course Saddle and Shoulder Traverse) |
| Jackson Hole | 6 | Easiest Way, Fig's Cut, Headwall, Moran Face, Saratoga Bowl, Teewinot Face: the trail map is a painting with labels and no drawn lines, and the four faces and bowls are area names over slopes already crossed by mapped runs; Fig's Cut not found on the map |
| Zermatt | 4 | Paradise (10), Mittelritz (30), Platte (31), Pre de Veau-Pirovano; 30 and 31 are orange ski routes below Hohtälli on the Cervino map |
| La Plagne | 2 | Croes, Jarsey |
| Tignes | 2 | Combe du Géant, Les Champions |
| Stratton | 0 | "Stevek" is Stevek's Competition Arena on the 2026-27 map (an area, `not_runs`) |
| Sugarbush | 0 | Rob Roy drawn on Mt. Ellen from the uploaded 2025-26 map (approximate) |
| Geto Kogen | 1 | C4 |
| Saalbach | 104 numbers | the resort lists runs by number only; OpenStreetMap carries a number on few runs. Those runs keep OpenStreetMap's rating. A colour comparison with the resort's own drawn runs found about 40 places to look at by eye |
