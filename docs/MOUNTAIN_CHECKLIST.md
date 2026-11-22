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
| Breckenridge | yes | yes | yes | |
| Brundage Mountain | yes | yes (four trail maps from brundage.com, read by hand, 2026-11-18) | no | |
| Cannon Mountain | yes | yes | yes | |
| Copper Mountain | yes | yes (2026-27 trail map and the Copper Bowl and Spaulding insets, read by hand, 2026-11-18) | yes | six runs OpenStreetMap lacks are drawn by hand (approximate) |
| Geto Kogen | yes | yes (course map and course page on getokogen.com, colours read by hand, 2026-11-18) | no | |
| Heavenly | yes | yes | yes | |
| Jay Peak | yes | yes (2025-26 trail map; symbols read automatically next to each printed name, 2026-11-18) | yes | |
| Keystone | yes | yes | yes | |
| La Plagne | yes | yes (La Plagne piste map 2026 from la-plagne.com, line colours read by hand, 2026-11-18) | yes | |
| Les Arcs | yes | yes (Paradiski piste map 2026, Les Arcs and Peisey-Vallandry side, read by hand, 2026-11-18) | yes | loose "Droset" piece |
| Les Contamines | yes | yes (piste map 2025-26 from the resort's ski pass site, read by hand, 2026-11-18) | yes | |
| Mammoth Mountain | yes | yes | yes | 20 official runs still to trace (see below) |
| Park City | yes | yes | yes | |
| Pizol | yes | yes (the resort's piste report on infosnow.ch: number, name and colour, 2026-11-18) | yes | |
| Saalbach Hinterglemm | yes | yes (the resort's interactive map data, 155 numbered runs matched by piste number, 2026-11-18) | yes | two pieces of "Zwölferkogel - Nordabfahrt" and one of "Sonnenmulde" carry a run number in OpenStreetMap that would make them easier; left at the map rating |
| Saddleback | yes | yes | yes | "Morning Glory" not reachable from the base |
| SkiWelt | yes | yes (the resort's interactive map data, matched by run name, 2026-11-18) | yes | |
| Smugglers' Notch | yes | yes | no | |
| Steamboat | yes | yes | yes | |
| Stowe | yes | yes (2026-27 winter trail map the owner uploaded, read by hand, 2026-11-18) | no | glades carry no rating on the resort's map and keep the OpenStreetMap rating |
| Sugarbush | yes | yes | yes | |
| Tignes – Val d'Isère | yes | yes (Tignes – Val d'Isère piste map from tignes.net, read by hand, 2026-11-18) | yes | |
| Vail | yes | yes (2026-27 Front Side, Back Bowls and Blue Sky Basin maps from vail.com, read by hand, 2026-11-18) | yes | |
| Val Thorens | yes | yes (Val Thorens piste map from les3vallees.com, read by hand, and the Orelle piste map for the Orelle side, 2026-11-18) | yes | |
| Winter Park | yes | yes | yes | 25 to 40 official runs missing or named differently |
| Zermatt – Cervinia | yes | yes (Cervino Ski Paradise map 2026-27 from cervinia.it, colour badges read and checked against its printed list, 2026-11-18) | yes | planned Breitboden–Rosenritz chair left out until it opens |
| Killington | yes (2026-11-18) | yes (trail map, read by hand) | yes | a few old runs OpenStreetMap still lists (Hawkeye, Horn, Old Vagabond) are not reachable |
| Sunday River | yes (2026-11-18) | yes (trail map, read by hand) | yes | |
| Sugarloaf | yes (2026-11-18) | yes (trail map, read by hand; Snowfields, Burnt Mountain and Brackett Basin glades take the area's experts-only rating) | yes | Snowfields reached by a short walk from the Timberline lift top (added by hand) |
| Okemo | yes (2026-11-18) | yes (trail map, read by hand) | yes | "Hot Dog Hill" (beginner run at the base) not joined to a lift |
| Mount Snow | yes (2026-11-18) | yes (trail map, read by hand) | yes | |
| Stratton | yes (2026-11-18) | yes (resort feed, mtnpowder id 1) | yes | |
| Loon Mountain | yes (2026-11-18) | yes (trail map, read by hand) | no (no usable free photo found yet) | "Wildwood" glade and "Brookway Extension" not joined |
| Whiteface | yes (2026-11-18) | yes (trail map, read by hand) | yes | parts of "The Slides" (hike-to expert terrain) are not joined to a lift |
| Waterville Valley | yes (2026-11-18) | yes (2025-26 trail map from skimap.org, read by hand) | yes | Old Tecumseh joined to Terry's Trail by hand |
| Bolton Valley | yes (2026-11-18) | yes (2024-25 trail map from skimap.org, read by hand) | yes | Showtime, Spellbinder and Twice as Nice Woods joined to Intro (Timberline midstation) by hand |
| Burke Mountain | yes (2026-11-18) | yes (2025 trail map from skimap.org, read by hand) | yes | |
| Magic Mountain | yes (2026-11-18) | yes (2026 trail map from skimap.org, read by hand) | yes | Pitch Black and Black Magic joined to Upper Wizard at the summit by hand |
| Berkshire East | yes (2026-11-18) | yes (2024 and 2026 trail maps from skimap.org, read by hand) | no (no free winter photo found) | Gronk Glades and Horace's Grove missing from OpenStreetMap |
| Catamount | yes (2026-11-18) | yes (2024-25 and 2025-26 trail maps from skimap.org, read by hand) | no (no free photo found) | Birch Glades East and West missing from OpenStreetMap |
| Ragged Mountain | yes (2026-11-18) | yes (2023 trail map from skimap.org, read by hand) | yes (distant view) | Triple Take and Double Take missing from OpenStreetMap |
| Pats Peak | yes (2026-11-18) | yes (2026 trail map's printed trail list) | no (no free photo found) | |
| Mohawk Mountain | yes (2026-11-18) | yes (2025 trail map) | yes | Back Bowl, Indian Crossing and Ridge Run are not in OpenStreetMap: traced by hand (`extra_trails`) |
| Powder Ridge | yes (2026-11-18) | yes (2026 trail map's numbered list; parks left out) | yes | Gun Powder Run and Powder Keg are not in OpenStreetMap: traced by hand |
| Ski Sundown | yes (2026-11-18) | yes (2024-25 trail map) | no (no free photo found) | Loop is not in OpenStreetMap: traced by hand |
| Mount Southington | yes (2026-11-18) | yes (2025 trail map) | yes (night) | OpenStreetMap maps only 9 of 14 runs; Avalanche, Liftline, Northstar, The Glacier, Thunderbolt and Whoopee traced by hand; links join Turkey Turn and the Thunderbolt top |
| Bretton Woods | yes (2026-11-18) | yes (2025-26 trail map; glades from its printed glade lists) | yes | Black Fly, Mom Said No, Old Man, Peppersass, Stinger and Think Pink are not in OpenStreetMap: traced by hand from the map's glade codes (RN to RT, ZF, WI) |
| Hunter Mountain | yes (2026-11-18) | yes (trail map, 400 dpi render) | no (only a snowless spring photo) | HP Poma lift added by hand (`extra_lifts`); twelve runs not in OpenStreetMap traced by hand (Macombs, Park Avenue, Park Avenue West, Bucky's Run, Gramercy Park, Madison Square, KMC Drive, Milky Way, The Milky Glades, Belt Parkway Bypass, Mad Box, Woodstock Glades); KMC Drive starts at the Kaatskill Mountain Club, which no run reaches |
| Windham Mountain | yes (2026-11-18) | yes (trail map; "advanced" blue recorded as blue-black) | yes | What, Wooly Bear and a line through Whataride Glades traced by hand |
| Wachusett | yes (2026-11-18) | yes (trail map) | yes | Polar Kids traced by hand; Lower Conifer renamed from OpenStreetMap's Lower Conifer Connection |
| Jackson Hole | yes (2026-11-21, `pipeline.py`) | yes (trail map, skimap.org 37233: label colours only, so a black label is black, or double where OpenStreetMap says double) | yes | 6 listed runs not on the map |
| Palisades Tahoe | yes (2026-11-21, `pipeline.py`) | yes (resort feed (mtnpowder 61)) | no | 114 feed entries not on the map (gates, cliffs, named lines inside bowls: to sort into `not_runs`/`same_as`); Alpine Meadows' Beaver and Estelle bowls joined to Summit Six as walks (approximate); Base to Base Gondola two-way |
| Deer Valley | yes (2026-11-21, `pipeline.py`) | yes (resort feed (mtnpowder 49)) | no | 10 listed runs not on the map; upper/mid/lower parts rated as whole runs |
| Solitude | yes (2026-11-21, `pipeline.py`) | yes (resort feed (mtnpowder 65)) | no | 17 listed runs not on the map |
| Crystal Mountain | yes (2026-11-21, `pipeline.py`) | yes (resort feed (mtnpowder 80)) | no | terrain is 1 m LiDAR only in part, the rest the 10 m national model; Silver Basin joined to Chair 6 as a hike; 6 listed runs not on the map |
| Snowshoe | yes (2026-11-21, `pipeline.py`) | yes (resort feed (mtnpowder 2)) | no | 18 listed runs not on the map |
| Big Sky | yes (2026-11-21, `pipeline.py`) | yes (2026-27 trail maps (skimap.org), cheaper-model reading plus second look at disagreements) | no | 33 listed runs not on the map; platters Tweener and Homer have no run from their tops (marked isolated: check whether they are public); One and Only gondola two-way; Rudy and Porcupine had no readable symbol |
| Snowbird | yes (2026-11-21, `pipeline.py`) | yes (trail map (skimap.org), two-pass reading) | no | 16 listed runs not on the map; Westward Ho joined from Aggie's Alley |
| Alta | yes (2026-11-21, `pipeline.py`) | yes (trail map (skimap.org), two-pass reading) | no | 11 listed runs not on the map |
| Telluride | yes (2026-11-21, `pipeline.py`) | yes (2024 winter trail map (skimap.org), two-pass reading) | no | 15 listed runs not on the map; Revelation, Black Iron and Prospect bowls and Goat Path have no symbol on the map (OpenStreetMap rating kept) |
| Tremblant | coming soon | no | yes | |
| Whistler Blackcomb | coming soon | no | yes | |
| Chamonix | coming soon | no | yes | |
| Niseko | coming soon | no | no | |

Not yet tracked per mountain (do these as each mountain is next worked on): the lift-list check, the
directions check to every lift top, place names, and the browser close-ups in sections 4 and 5. Several
mountains also have a few dead-end runs listed in their build's connectivity report.


## Runs on the resort's list but not yet on the map (2026-11-19)

`python3 tools/official_ratings.py check <id>` gives the names. 165 were missing on 2026-11-18; 11 remain (2026-11-20). The rest
were found under another name (`rename`, `way_names`, `split_ways`, `same_as`), explained as not separate runs
(`not_runs`: lift numbers misread, area names, play areas, backcountry gates), or drawn by hand (`extra_trails`,
marked `traced`, approximate: placed from the trail map between neighbouring runs on aerial photos).

| Mountain | Still missing | Notes |
| --- | --- | --- |
| SkiWelt | 0 | 2026-11-20, from the 2025-26 map the owner uploaded: 33 (practice slope at Itter) drawn; the other seven are not on that map and are explained in `not_runs` |
| Zermatt | 4 | Paradise (10), Mittelritz (30), Platte (31), Pre de Veau-Pirovano; 30 and 31 are orange ski routes below Hohtälli on the Cervino map |
| La Plagne | 2 | Croes, Jarsey |
| Tignes | 2 | Combe du Géant, Les Champions |
| Stratton | 0 | "Stevek" is Stevek's Competition Arena on the 2026-27 map (an area, `not_runs`) |
| Sugarbush | 0 | Rob Roy drawn on Mt. Ellen from the uploaded 2025-26 map (approximate) |
| Geto Kogen | 1 | C4 |
| Saalbach | 104 numbers | the resort lists runs by number only; OpenStreetMap carries a number on few runs. Those runs keep OpenStreetMap's rating. A colour comparison with the resort's own drawn runs found about 40 places to look at by eye |
