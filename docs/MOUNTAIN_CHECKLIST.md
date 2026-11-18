# Mountain checklist

Every mountain in SkiWithMe, new or already live, should pass every item on this list. When a
mountain is added, copy the "New mountain" list into the commit or session notes and tick it off.
When a mountain already live is improved, update its row in "Where each mountain stands" at the end.

The commands are in `tools/` and are explained in `README.md` and `CLAUDE.md` ("Building and checking a
resort"). The owner does not need to run them; this list is also how to see what is left.

## New mountain

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

### 4. Map accuracy
- [ ] `tools/audit.py --list` shows no run missing inside the resort boundary.
- [ ] Every lift on the resort's lift list is on the map, with the right kind (chair, gondola, cable car,
      T-bar, platter, rope tow, carpet, train). No removed, planned or summer-only lifts.
- [ ] Runs join where they really join: no runs stopping short of a junction, none running past it.
- [ ] Directions work from the base to the top of every lift, and every run can be reached.
- [ ] Lodges, base areas, restaurants, ticket offices and car parks have the right names.
- [ ] Night-skiing runs marked, if the resort has any.
- [ ] Glades and terrain parks show correctly.

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
| Copper Mountain | yes | yes (2026-27 trail map and the Copper Bowl and Spaulding insets, read by hand, 2026-11-18) | yes | a few official names (Spillway, Guthrie's Chute, Union Meadows) are not runs in OpenStreetMap |
| Geto Kogen | yes | yes (course map and course page on getokogen.com, colours read by hand, 2026-11-18) | no | |
| Heavenly | yes | yes | yes | |
| Jay Peak | yes | yes (2025-26 trail map; symbols read automatically next to each printed name, 2026-11-18) | yes | |
| Keystone | yes | yes | yes | |
| La Plagne | yes | yes (La Plagne piste map 2026 from la-plagne.com, line colours read by hand, 2026-11-18) | yes | |
| Les Arcs | yes | yes (Paradiski piste map 2026, Les Arcs and Peisey-Vallandry side, read by hand, 2026-11-18) | yes | loose "Droset" piece |
| Les Contamines | yes | yes (piste map 2025-26 from the resort's ski pass site, read by hand, 2026-11-18) | yes | |
| Mammoth Mountain | yes | yes | yes | 25 to 40 official runs missing or named differently |
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
| Tremblant | coming soon | no | yes | |
| Jackson Hole | coming soon | no | yes | |
| Whistler Blackcomb | coming soon | no | yes | |
| Chamonix | coming soon | no | yes | |
| Niseko | coming soon | no | no | |

Not yet tracked per mountain (do these as each mountain is next worked on): the lift-list check, the
directions check to every lift top, place names, and the browser close-ups in sections 4 and 5. Several
mountains also have a few dead-end runs listed in their build's connectivity report.
