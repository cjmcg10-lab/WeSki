# Automatic batch 1: 100 mountains in the USA and Canada (2026-11-23, issue #106)

The next 100 candidates from `tools/bulk/candidates.json` (US and Canada first, biggest first, built ones skipped),
built with no hand edits: `tools/bulk/run_batch.py`, then `tools/bulk/gate.py --write --table`. The maps are on the
preview only (https://skiwithme-preview.cjmcg10.workers.dev, R2 `preview/data/<id>/`, all 100 including the held
ones); nothing was written to the live `data/` in R2.

**Result: 79 publish straight through the gate, 21 held** (target in #45: 80%). 74 US (56 publish), 26 Canada (23 publish).

Why held (a mountain can have more than one reason): runs no lift reaches 9; lifts cut off from the rest of the map 7
(Taos, Purgatory, Schweitzer, Brian Head, Aspen Highlands, Sandia's tram from the city, Yellowstone Club); dead-end
runs 6; runs that climb 2 (Fernie, Powder Mountain); too much unrated run length 2 (Mount Ashland, Le Massif); the
name says "club", maybe private 2 (Yellowstone Club, The Hermitage Club). No build failed.

Measured:
- **Time:** 44.5 minutes for the first build of all 100 with 3 at a time (sum of single builds 133 minutes, median 67 s
  a mountain, OpenStreetMap and terrain downloads included); a full rebuild of the 100 from the downloads took 13 minutes.
- **Lifts:** 1,073 on the maps against OpenSkiMap's 1,068; 97 of 100 have at least OpenSkiMap's count; 1,063 of the
  1,068 lifts OpenSkiMap assigns to these areas (by OpenStreetMap id) are on them.
- **Runs:** 11,510 run pieces shown (OpenSkiMap counts 9,528 runs; we split runs where they join); 11,432 of 11,615 run
  pieces reachable from a lift (98.4%), 8,961 of 9,057 at the published ones (98.9%).
- **Ratings:** resort feed for 3 (Blue Mountain, Tremblant, Snow Summit); the other 97 from OpenStreetMap, labelled "not
  yet checked" in the app (10 other feed ids tried return no trail list). Median share of run length with no rating: 0%.
  The steepness check raised 4 runs.
- **Terrain:** 1 m lidar for 76, 10 m for 7, 30 m for 17 (British Columbia and Alberta: little of NRCan's 1 m lidar
  covers the mountains, so MRDEM 30 m fills in; the app shows the lower-detail note there).
- **Rule-based fixes:** 13 lift ends joined by rule, 55 lifts marked isolated (most are tubing lifts and beginner
  carpets; the rest held the map when it was a chair), 2 village gondolas made two-way, 939 automatic run joins.
- **Checks on the published 79:** connection check totals: 81 runs no lift reaches (each map at most 5% of its runs), 24
  dead ends, 2 lift ends with no run, 0 uphill joins, 26 doubled runs; all written to each mountain's allow-list in
  `tests/fixtures/connections/` as "accepted by the gate, not looked at by a person". The existence check
  (`verify_exists.py`) ran on all 100: with no resort list it only hides private, ski-touring and unnamed backcountry
  pieces.
- **Storage:** 92 MB for the 100 in R2 (0.92 MB a mountain: 44 MB map and route files, 48 MB height grids and trees).

## How many the free plan allows (estimate, not started)

- **R2 storage (10 GB):** at 0.92 MB a mountain, about 10,000 mountains, or about 5,000 while every map also has a
  preview copy. OpenSkiMap lists 1,816 still to build (1,716 after this batch), which would add about 1.6 GB. Storage
  is not the limit.
- **R2 operations:** a first upload is about 8 writes a mountain (about 14,000 for all 1,716; the free allowance is
  1 million a month); reads are 10 million a month.
- **Worker requests (100,000 a day):** each map file goes through the Worker, about 6 requests per mountain opened,
  so about 16,000 mountain opens a day whatever the number of mountains. This limit is about use, not how many maps.
- **App bundle:** the index grows about 330 bytes a mountain (about 640 KB for all 1,882, about 130 KB gzipped, loaded
  at the start screen). The preview Worker bundles the app at 3.1 MB raw / 2.0 MB gzipped against the free limit of
  3 MB gzipped: it fits, with less room as the index grows.
- **So:** all 1,716 remaining OpenSkiMap candidates fit the free plan. At this batch's rate about 79% (about 1,350)
  would pass the gate as built. Build time is the cost: about 13 hours of machine time with 3 at a time; Alpine and
  Japanese resorts need the European and Japanese ratings schemes checked by the gate first (not tried in this batch).

## Per mountain

| Resort | Region | Time (s) | Lifts (ours / OpenSkiMap) | Runs shown / named (OpenSkiMap runs) | Run pieces reachable | Ratings | Terrain | Gate | Why held / notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 49° North Mountain (`49-north-mountain`) | Washington, USA | 63 | 7 / 7 | 88 / 83 (84) | 88 / 88 | resort feed (49 Degrees North trail map (skimap.org/s) | 1 m | publish |; AI pass 2026-11-24: ratings read from the trail map; Dreamer #3 is OpenStreetMap's Payday #3 |
| Afton Alps (`afton-alps`) | Minnesota, USA | 43 | 20 / 20 | 50 / 37 (61) | 53 / 53 | resort feed (Afton Alps trail map (skimap.org/skimaps) | 1 m | publish |; AI pass 2026-11-24: ratings read from the trail map; no lift list read |
| Alyeska (`alyeska`) | Alaska, USA | 63 | 7 / 7 | 100 / 92 (73) | 99 / 100 | resort feed (Alyeska winter trail map by James Niehue) | 10 m | publish |; AI pass 2026-11-24: ratings read from the Niehues trail map; Money 1 and 2 joined by the hike from Glacier Bowl Express |
| Angel Fire (`angel-fire`) | New Mexico, USA | 63 | 9 / 8 | 102 / 89 (101) | 109 / 109 | resort feed (Angel Fire 2026-27 trail map by James Ni) | 1 m | publish | 1 lift ends joined by rule; AI pass 2026-11-24: ratings read from the 2026-27 map; new Angel Express chair added (proposed in OpenStreetMap); hike-to C-4, Nitro, Detonator, Baa-Da-Bing joined |
| Apex Mountain (`apex-mountain`) | British Columbia, Canada | 79 | 4 / 4 | 75 / 63 (75) | 76 / 76 | resort feed (Apex Mountain trail map (skimap.org/skim) | 30 m | publish | 30 m terrain; AI pass 2026-11-24: ratings read from the trail map; Twenty Two, Gunbarrel, Peashooter joined to Grandfather's Trail |
| Arapahoe Basin (`arapahoe-basin`) | Colorado, USA | 73 | 9 / 9 | 169 / 164 (103) | 169 / 174 | resort feed (Arapahoe Basin trail report (resort feed) | 1 m | hold | 11 dead-end runs; AI pass 2026-11-24: ratings and lifts from the resort feed (mtnpowder 93); 5 East Wall lines not on the resort's list hidden; still held: 9 Steep Gullies runs and Lightning Trees, Crags end at the highway or below the Zuma base (the resort lists a hike-back trail, not mapped) |
| Aspen Highlands (`aspen-highlands`) | Colorado, USA | 107 | 5 / 6 | 129 / 111 (76) | 129 / 129 | resort feed (Aspen Highlands 2026-27 trail map (skima) | 1 m | publish |; AI pass 2026-11-24: ratings read from the 2026-27 map; Highland Bowl lines joined by the hike from Loge Peak; Five Trees chair (not the resort's) hidden |
| Aspen Mountain (`aspen-mountain`) | Colorado, USA | 87 | 6 / 6 | 173 / 142 (138) | 176 / 176 | resort feed (Aspen Mountain 2026-27 trail map (skimap) | 1 m | publish |; AI pass 2026-11-24: ratings read from the 2026-27 map; America's Downhill (drawn along Ruthie's Run) hidden |
| Aspen Snowmass (`aspen-snowmass`) | Colorado, USA | 107 | 18 / 19 | 146 / 129 (107) | 146 / 146 | resort feed (Snowmass 2026-27 trail map (skimap.org/s) | 1 m | publish | isolated by rule: Pines Upper, Pines Lower; AI pass 2026-11-24: ratings read from the 2026-27 map |
| Attitash Mountain (`attitash-mountain`) | New Hampshire, USA | 81 | 8 / 8 | 88 / 72 (87) | 89 / 89 | resort feed (Attitash trail map 2023 (skimap.org/skim) | 1 m | publish |; AI pass 2026-11-24: ratings read from the 2023 map (the 2025 one is too blurred) |
| Banff Sunshine Village (`banff-sunshine-village`) | Alberta, Canada | 73 | 14 / 14 | 200 / 160 (155) | 195 / 200 | OpenStreetMap, not checked | 30 m | publish | ratings not checked against the resort; 30 m terrain; AI pass 2026-11-24: not done in the AI pass (ratings not read) |
| Bear Valley (`bear-valley`) | California, USA | 54 | 9 / 9 | 99 / 97 (61) | 99 / 99 | resort feed (Bear Valley trail map 2025 (skimap.org/s) | 1 m | hold | 19 dead-end runs; AI pass 2026-11-24: ratings read from the 2025 map; still held: 19 runs end in Bear Valley Village, which the trail map says has no return lift (shuttle) |
| Beaver Creek (Arrowhead Mountain) (`beaver-creek-arrowhead-mountain`) | Colorado, USA | 150 | 25 / 25 | 286 / 163 (247) | 286 / 286 | OpenStreetMap, not checked | 1 m | publish | ratings not checked against the resort; AI pass 2026-11-24: not done in the AI pass (ratings not read) |
| Belleayre Mountain Ski Center (`belleayre-mountain-center`) | New York, USA | 89 | 8 / 8 | 74 / 51 (66) | 95 / 95 | resort feed (Belleayre 2024-26 trail map (skimap.org/) | 1 m | publish |; AI pass 2026-11-24: ratings read from the 2024-26 map; 12 pieces of the old Highmount area hidden (not on the map) |
| Big White (`big-white`) | British Columbia, Canada | 82 | 16 / 16 | 128 / 106 (114) | 128 / 128 | OpenStreetMap, not checked | 30 m | publish | ratings not checked against the resort; 30 m terrain; 1 lift ends joined by rule; AI pass 2026-11-24: not done in the AI pass (ratings not read) |
| Blue Mountain (`blue-mountain-ontario`) | Ontario, Canada | 86 | 13 / 13 | 63 / 50 (60) | 65 / 65 | resort feed (Blue trail report (resort feed, mtnpowde) | 1 m | publish |; AI pass 2026-11-24: Craigleith Ski Club's V-Hill chair and 6 runs (a separate private club) taken out; all runs reachable |
| Blue Mountain (`blue-mountain-pennsylvania`) | Pennsylvania, USA | 59 | 15 / 15 | 35 / 33 (44) | 35 / 35 | OpenStreetMap, not checked | 1 m | publish | ratings not checked against the resort; AI pass 2026-11-24: not done in the AI pass (ratings not read) |
| Bogus Basin Mountain Recreation Area (`bogus-basin-mountain-recreation`) | Idaho, USA | 76 | 11 / 11 | 142 / 105 (117) | 152 / 152 | resort feed (Bogus Basin day map by James Niehues (sk) | 1 m | publish |; AI pass 2026-11-24: ratings read from the Niehues day map |
| Boyne Mountain (`boyne-mountain`) | Michigan, USA | 74 | 10 / 10 | 62 / 62 (58) | 62 / 62 | resort feed (Boyne Mountain 2023 trail map by James N) | 1 m | publish |; AI pass 2026-11-24: ratings read from the 2023 Niehues map |
| Brian Head (`brian-head`) | Utah, USA | 65 | 13 / 13 | 72 / 59 (69) | 72 / 72 | resort feed (Brian Head 2026 trail map (skimap.org/sk) | 1 m | publish | 1 lift ends joined by rule; AI pass 2026-11-24: ratings read from the 2026 map; Navajo side joined to the rest (Kodachrome pieces OpenStreetMap lacks) |
| Bridger Bowl (`bridger-bowl`) | Montana, USA | 65 | 12 / 12 | 77 / 59 (64) | 77 / 79 | OpenStreetMap, not checked | 1 m | hold | 4 dead-end runs; isolated by rule: Schlasman's; ratings not checked against the resort |
| Brighton (`brighton`) | Utah, USA | 147 | 8 / 8 | 90 / 63 (90) | 88 / 90 | OpenStreetMap, not checked | 1 m | publish | ratings not checked against the resort |
| Bromley Mountain Ski Resort;Bromley Mountain (`bromley-mountain-bromley-mountain`) | Vermont, USA | 67 | 8 / 8 | 76 / 47 (67) | 76 / 76 | OpenStreetMap, not checked | 1 m | publish | ratings not checked against the resort |
| Bromont Montagne d'Expérience (`bromont-montagne-d-experience`) | Quebec, Canada | 67 | 11 / 11 | 117 / 110 (92) | 117 / 117 | OpenStreetMap, not checked | 1 m | publish | ratings not checked against the resort |
| Camelback Mountain (`camelback-mountain`) | Pennsylvania, USA | 42 | 15 / 15 | 36 / 35 (37) | 36 / 36 | OpenStreetMap, not checked | 1 m | publish | ratings not checked against the resort; 3 lift ends joined by rule |
| Cascade Mountain (`cascade-mountain`) | Wisconsin, USA | 41 | 11 / 11 | 49 / 47 (48) | 60 / 60 | OpenStreetMap, not checked | 1 m | publish | ratings not checked against the resort |
| Castle Mountain (`castle-mountain`) | Alberta, Canada | 97 | 7 / 7 | 167 / 153 (104) | 167 / 167 | OpenStreetMap, not checked | 30 m | publish | ratings not checked against the resort; 30 m terrain; 1 runs raised by the steepness check |
| China Peak Mountain (`china-peak-mountain`) | California, USA | 46 | 11 / 11 | 92 / 45 (104) | 92 / 92 | OpenStreetMap, not checked | 1 m | publish | ratings not checked against the resort |
| Cranmore Mountain (`cranmore-mountain`) | New Hampshire, USA | 51 | 8 / 8 | 63 / 55 (60) | 63 / 63 | OpenStreetMap, not checked | 1 m | publish | isolated by rule: Magic carpet; ratings not checked against the resort |
| Crested Butte Mountain (`crested-butte-mountain`) | Colorado, USA | 83 | 15 / 15 | 269 / 244 (93) | 269 / 270 | OpenStreetMap, not checked | 1 m | hold | 16 dead-end runs; ratings not checked against the resort |
| Cypress Mountain (`cypress-mountain`) | British Columbia, Canada | 105 | 7 / 7 | 103 / 63 (79) | 103 / 103 | OpenStreetMap, not checked | 30 m | publish | ratings not checked against the resort; 30 m terrain |
| Dodge Ridge (`dodge-ridge`) | California, USA | 49 | 11 / 11 | 67 / 67 (61) | 67 / 67 | OpenStreetMap, not checked | 1 m | publish | isolated by rule: T-Bar 643; ratings not checked against the resort |
| Eldora (`eldora`) | Colorado, USA | 51 | 10 / 10 | 73 / 62 (67) | 73 / 73 | OpenStreetMap, not checked | 1 m | publish | ratings not checked against the resort |
| Fernie Alpine (`fernie-alpine`) | British Columbia, Canada | 136 | 10 / 10 | 157 / 133 (120) | 157 / 157 | OpenStreetMap, not checked | 1 m | hold | 6 runs climb more than 12 m; ratings not checked against the resort |
| Gore Mountain (`gore-mountain`) | New York, USA | 73 | 14 / 14 | 118 / 112 (104) | 118 / 118 | OpenStreetMap, not checked | 1 m | publish | ratings not checked against the resort |
| Grand Targhee (`grand-targhee`) | Wyoming, USA | 63 | 6 / 6 | 121 / 94 (93) | 121 / 125 | OpenStreetMap, not checked | 1 m | publish | ratings not checked against the resort |
| Great Divide (`great-divide`) | Montana, USA | 62 | 6 / 6 | 127 / 125 (109) | 127 / 127 | OpenStreetMap, not checked | 1 m | publish | ratings not checked against the resort |
| Gunstock Recreation Area (`gunstock-recreation`) | New Hampshire, USA | 93 | 6 / 6 | 76 / 51 (73) | 76 / 76 | OpenStreetMap, not checked | 1 m | publish | ratings not checked against the resort |
| Holiday Valley (`holiday-valley`) | New York, USA | 160 | 13 / 13 | 69 / 69 (79) | 69 / 69 | OpenStreetMap, not checked | 1 m | publish | ratings not checked against the resort |
| Homewood (`homewood`) | California, USA | 49 | 7 / 7 | 97 / 65 (70) | 98 / 98 | OpenStreetMap, not checked | 1 m | publish | ratings not checked against the resort |
| Kimberley Alpine (`kimberley-alpine`) | British Columbia, Canada | 81 | 5 / 5 | 72 / 62 (70) | 72 / 72 | OpenStreetMap, not checked | 30 m | publish | isolated by rule: Owl T-Bar; ratings not checked against the resort; 30 m terrain |
| Kirkwood Mountain (`kirkwood-mountain`) | California, USA | 60 | 13 / 13 | 74 / 74 (58) | 71 / 74 | OpenStreetMap, not checked | 1 m | publish | ratings not checked against the resort |
| Lake Louise (`lake-louise`) | Alberta, Canada | 61 | 13 / 13 | 178 / 161 (120) | 178 / 178 | OpenStreetMap, not checked | 30 m | publish | ratings not checked against the resort; 30 m terrain |
| Le Massif (`le-massif`) | Quebec, Canada | 144 | 9 / 9 | 94 / 66 (84) | 85 / 94 | OpenStreetMap, not checked | 1 m | hold | 7 runs no lift reaches; 19% of the run length has no rating in OpenStreetMap; ratings not checked against the resort |
| Lost Trail (`lost-trail`) | Idaho, USA | 78 | 8 / 8 | 80 / 69 (56) | 80 / 80 | OpenStreetMap, not checked | 1 m | publish | ratings not checked against the resort |
| Loveland Basin (`loveland-basin`) | Colorado, USA | 64 | 7 / 7 | 118 / 86 (97) | 106 / 118 | OpenStreetMap, not checked | 1 m | hold | only 106 of 118 run pieces reachable from a lift; 8 runs no lift reaches; ratings not checked against the resort |
| Lutsen Mountains (`lutsen-mountains`) | Minnesota, USA | 67 | 7 / 8 | 110 / 90 (76) | 110 / 110 | OpenStreetMap, not checked | 1 m | publish | ratings not checked against the resort |
| Mad River Glen (`mad-river-glen`) | Vermont, USA | 107 | 5 / 5 | 85 / 60 (77) | 85 / 85 | OpenStreetMap, not checked | 1 m | publish | ratings not checked against the resort |
| Marmot Basin (`marmot-basin`) | Alberta, Canada | 75 | 6 / 6 | 136 / 91 (76) | 134 / 136 | OpenStreetMap, not checked | 30 m | publish | ratings not checked against the resort; 30 m terrain |
| Monarch Mountain (`monarch-mountain`) | Colorado, USA | 52 | 9 / 9 | 86 / 77 (78) | 79 / 86 | OpenStreetMap, not checked | 1 m | hold | 7 runs no lift reaches; ratings not checked against the resort |
| Mont-Sainte-Anne (`mont-sainte-anne`) | Quebec, Canada | 73 | 9 / 9 | 80 / 70 (67) | 80 / 80 | OpenStreetMap, not checked | 1 m | publish | ratings not checked against the resort |
| Mont Sutton (`mont-sutton`) | Quebec, Canada | 62 | 9 / 9 | 89 / 60 (87) | 89 / 89 | OpenStreetMap, not checked | 1 m | publish | ratings not checked against the resort |
| Mont Tremblant Resort, Station Mont Tremblant (`mont-tremblant-mont-tremblant`) | Quebec, Canada | 125 | 16 / 12 | 146 / 114 (152) | 152 / 152 | resort feed (Tremblant trail report (resort feed, mtn) | 1 m | publish | 1 lift ends joined by rule |
| Montana Snowbowl (`montana-snowbowl`) | Montana, USA | 64 | 6 / 6 | 67 / 60 (64) | 67 / 67 | OpenStreetMap, not checked | 1 m | publish | ratings not checked against the resort |
| Mount Ashland (`mount-ashland`) | Oregon, USA | 43 | 6 / 6 | 55 / 52 (64) | 55 / 55 | OpenStreetMap, not checked | 10 m | hold | 24% of the run length has no rating in OpenStreetMap; ratings not checked against the resort |
| Mount Rose Ski Tahoe (`mount-rose-tahoe`) | Nevada, USA | 56 | 8 / 8 | 75 / 69 (60) | 78 / 78 | OpenStreetMap, not checked | 1 m | publish | ratings not checked against the resort |
| Mount Sunapee (`mount-sunapee`) | New Hampshire, USA | 66 | 10 / 10 | 92 / 75 (77) | 93 / 93 | OpenStreetMap, not checked | 1 m | publish | ratings not checked against the resort |
| Mount Washington Alpine (`mount-washington-alpine`) | British Columbia, Canada | 22 | 10 / 10 | 199 / 100 (196) | 217 / 217 | OpenStreetMap, not checked | 30 m | publish | ratings not checked against the resort; 30 m terrain |
| Mt. Bachelor (`mt-bachelor`) | Oregon, USA | 77 | 15 / 15 | 135 / 106 (128) | 128 / 135 | OpenStreetMap, not checked | 10 m | publish | ratings not checked against the resort |
| Mt. Hood Meadows (`mt-hood-meadows`) | Oregon, USA | 62 | 11 / 11 | 138 / 126 (94) | 138 / 140 | OpenStreetMap, not checked | 10 m | publish | ratings not checked against the resort |
| Mt. Hood Skibowl (`mt-hood-skibowl`) | Oregon, USA | 46 | 9 / 9 | 73 / 70 (62) | 73 / 73 | resort trail map (skimap.org), read 2026-11-23/24 | 10 m | publish | 2 lift ends joined by rule; AI checking pass 2026-11-24 (#45) |
| Mt Norquay (`mt-norquay`) | Alberta, Canada | 59 | 7 / 7 | 87 / 74 (68) | 87 / 87 | resort trail map (skimap.org), read 2026-11-23/24 | 30 m | publish | 30 m terrain; AI checking pass 2026-11-24 (#45) |
| Mt Seymour (`mt-seymour`) | British Columbia, Canada | 66 | 5 / 5 | 63 / 44 (71) | 64 / 64 | resort trail map (skimap.org), read 2026-11-23/24 | 30 m | publish | 30 m terrain; AI checking pass 2026-11-24 (#45) |
| Mt. Spokane (`mt-spokane`) | Washington, USA | 59 | 8 / 8 | 71 / 65 (61) | 71 / 71 | resort trail map (skimap.org), read 2026-11-23/24 | 1 m | publish | AI checking pass 2026-11-24 (#45) |
| Northstar at Tahoe (`northstar-at-tahoe`) | California, USA | 77 | 20 / 20 | 136 / 92 (130) | 139 / 139 | resort trail map (skimap.org), read 2026-11-23/24 | 1 m | publish | AI checking pass 2026-11-24 (#45) |
| Pajarito Mountain (`pajarito-mountain`) | New Mexico, USA | 40 | 6 / 6 | 64 / 42 (62) | 64 / 64 | resort trail map (skimap.org), read 2026-11-23/24 | 1 m | publish | AI checking pass 2026-11-24 (#45) |
| Panorama Mountain (`panorama-mountain`) | British Columbia, Canada | 105 | 10 / 10 | 171 / 132 (127) | 173 / 173 | resort trail map (skimap.org), read 2026-11-23/24 | 30 m | publish | 30 m terrain; AI checking pass 2026-11-24 (#45) |
| Pico Mountain (`pico-mountain`) | Vermont, USA | 48 | 7 / 7 | 85 / 57 (68) | 85 / 85 | resort trail map (skimap.org), read 2026-11-23/24 | 1 m | publish | AI checking pass 2026-11-24 (#45) |
| Powder Mountain (`powder-mountain`) | Utah, USA | 206 | 9 / 14 | 225 / 205 (155) | 213 / 225 | resort trail map (skimap.org), read 2026-11-23/24 | 1 m | hold | lifts 9 of OpenSkiMap's 14; only 9 of the 14 lifts OpenSkiMap assigns are on the map; 49 runs no lift reaches; 71 dead-end runs; 10 runs climb more than 12 m; AI checking pass 2026-11-24 (#45): five lifts (Village, Mary's, Raintree, Primetime, Foxtrot) are tagged private homeowners-only in OpenStreetMap and hidden, which cuts off the terrain they serve; needs the owner's decision on private terrain |
| Purgatory (`purgatory`) | Colorado, USA | 151 | 12 / 14 | 112 / 103 (92) | 113 / 113 | resort trail map (skimap.org), read 2026-11-23/24 | 1 m | publish | AI checking pass 2026-11-24 (#45) |
| Red Mountain (`red-mountain`) | British Columbia, Canada | 68 | 8 / 8 | 108 / 103 (84) | 109 / 112 | resort trail map (skimap.org), read 2026-11-23/24 | 30 m | publish | 30 m terrain; AI checking pass 2026-11-24 (#45) |
| Red River (`red-river`) | New Mexico, USA | 47 | 7 / 7 | 80 / 68 (85) | 81 / 81 | resort trail map (skimap.org), read 2026-11-23/24 | 1 m | publish | AI checking pass 2026-11-24 (#45) |
| Revelstoke Mountain (`revelstoke-mountain`) | British Columbia, Canada | 230 | 7 / 7 | 94 / 71 (83) | 103 / 112 | resort trail map (skimap.org), read 2026-11-23/24 | 1 m | publish | AI checking pass 2026-11-24 (#45) |
| Sandia Peak (`sandia-peak`) | New Mexico, USA | 63 | 5 / 6 | 63 / 62 (67) | 63 / 63 | resort trail map (skimap.org), read 2026-11-23/24 | 10 m | publish | AI checking pass 2026-11-24 (#45) |
| Ski Santa Fe, Santa Fe, Q38555 (`santa-fe-santa-fe-q38555`) | New Mexico, USA | 43 | 7 / 7 | 95 / 79 (88) | 97 / 97 | resort trail map (skimap.org), read 2026-11-23/24 | 1 m | publish | 1 lift ends joined by rule; AI checking pass 2026-11-24 (#45) |
| Schweitzer Mountain (`schweitzer-mountain`) | Idaho, USA | 80 | 10 / 10 | 103 / 92 (104) | 107 / 107 | resort trail map (skimap.org), read 2026-11-23/24 | 1 m | publish | AI checking pass 2026-11-24 (#45) |
| Seven Springs Mountain (`seven-springs-mountain`) | Pennsylvania, USA | 47 | 16 / 16 | 54 / 41 (54) | 57 / 57 | resort trail map (skimap.org), read 2026-11-23/24 | 1 m | publish | isolated by rule: Magic carpet, Magic carpet; 1 lift ends joined by rule; AI checking pass 2026-11-24 (#45) |
| Sierra-at-Tahoe (`sierra-at-tahoe`) | California, USA | 59 | 13 / 13 | 52 / 49 (41) | 53 / 53 | resort trail map (skimap.org), read 2026-11-23/24 | 1 m | publish | AI checking pass 2026-11-24 (#45) |
| Silver Mountain (`silver-mountain`) | Idaho, USA | 89 | 7 / 7 | 92 / 75 (79) | 96 / 96 | resort trail map (skimap.org), read 2026-11-23/24 | 1 m | publish | AI checking pass 2026-11-24 (#45) |
| Silver Star Mountain (`silver-star-mountain`) | British Columbia, Canada | 127 | 11 / 11 | 193 / 142 (192) | 195 / 204 | resort trail map (skimap.org), read 2026-11-23/24 | 30 m | publish | 30 m terrain; AI checking pass 2026-11-24 (#45) |
| Snow Summit (`snow-summit`) | California, USA | 53 | 15 / 15 | 37 / 30 (36) | 37 / 37 | resort feed (Snow Summit trail report (resort feed, m) | 1 m | publish | 1 lift ends joined by rule |
| Snow Valley Mountain (`snow-valley-mountain`) | California, USA | 64 | 13 / 13 | 41 / 28 (42) | 41 / 41 | OpenStreetMap, not checked | 1 m | publish | ratings not checked against the resort |
| Snowbasin (`snowbasin`) | Utah, USA | 38 | 13 / 13 | 185 / 137 (157) | 182 / 185 | OpenStreetMap, not checked | 1 m | publish | ratings not checked against the resort; 1 lift ends joined by rule |
| Sommet Saint-Sauveur (`sommet-saint-sauveur`) | Quebec, Canada | 66 | 17 / 17 | 55 / 39 (63) | 55 / 55 | OpenStreetMap, not checked | 1 m | publish | isolated by rule: Télérafting, Surface lift, Tapis roulant versant Bobsleigh + Vortex360, Télésiège; ratings not checked against the resort |
| Stevens Pass (`stevens-pass`) | Washington, USA | 73 | 14 / 14 | 116 / 75 (79) | 119 / 120 | OpenStreetMap, not checked | 1 m | publish | ratings not checked against the resort |
| Sugar Bowl (`sugar-bowl`) | California, USA | 115 | 13 / 13 | 123 / 114 (94) | 117 / 123 | OpenStreetMap, not checked | 1 m | publish | lift ends: 0 outside the network, 1 with no run; isolated by rule: Magic carpet; ratings not checked against the resort; 1 lift ends joined by rule |
| Sun Peaks (`sun-peaks`) | British Columbia, Canada | 63 | 13 / 13 | 251 / 174 (260) | 251 / 251 | OpenStreetMap, not checked | 30 m | publish | ratings not checked against the resort; 30 m terrain |
| Sun Valley - Bald Mountain (`sun-valley-bald-mountain`) | Idaho, USA | 93 | 12 / 12 | 160 / 101 (143) | 161 / 161 | OpenStreetMap, not checked | 1 m | publish | ratings not checked against the resort |
| Sundance (`sundance`) | Utah, USA | 49 | 10 / 10 | 94 / 71 (80) | 95 / 95 | OpenStreetMap, not checked | 1 m | publish | ratings not checked against the resort |
| Tamarack (`tamarack`) | Idaho, USA | 109 | 7 / 7 | 103 / 75 (87) | 102 / 104 | OpenStreetMap, not checked | 1 m | publish | ratings not checked against the resort |
| Taos Ski Valley (`taos-valley`) | New Mexico, USA | 59 | 14 / 14 | 176 / 111 (105) | 176 / 176 | OpenStreetMap, not checked | 1 m | hold | lifts not joined to the rest of the map (isolated by rule): Lift 2, Lift 7A, Lift 7, Lift 8, Lift 4, Kachina Peak Lift; ratings not checked against the resort |
| The Hermitage Club at Haystack Mountain (`the-hermitage-club-at-haystack-mountain`) | Vermont, USA | 41 | 5 / 5 | 68 / 49 (65) | 73 / 73 | OpenStreetMap, not checked | 1 m | hold | the name says club: it may be private (members only); check before publishing; lift ends: 2 outside the network, 0 with no run; ratings not checked against the resort |
| Three Summits (`three-summits`) | Washington, USA | 86 | 20 / 20 | 104 / 72 (106) | 105 / 105 | OpenStreetMap, not checked | 1 m | publish | isolated by rule: Magic carpet; ratings not checked against the resort |
| Timberline Lodge (`timberline-lodge`) | Oregon, USA | 111 | 12 / 12 | 72 / 56 (62) | 68 / 72 | OpenStreetMap, not checked | 10 m | hold | 4 runs no lift reaches; ratings not checked against the resort |
| Welch Village (`welch-village`) | Minnesota, USA | 40 | 10 / 10 | 57 / 48 (54) | 57 / 57 | OpenStreetMap, not checked | 1 m | publish | ratings not checked against the resort |
| Whistler Blackcomb (`whistler-blackcomb`) | British Columbia, Canada | 259 | 36 / 36 | 747 / 529 (618) | 734 / 753 | OpenStreetMap, not checked | 30 m | publish | ratings not checked against the resort; 30 m terrain; 1 runs raised by the steepness check |
| Whitefish Mountain (`whitefish-mountain`) | Montana, USA | 93 | 16 / 16 | 140 / 113 (137) | 141 / 141 | OpenStreetMap, not checked | 1 m | publish | lift ends: 0 outside the network, 1 with no run; ratings not checked against the resort |
| Whitewater (`whitewater`) | British Columbia, Canada | 80 | 5 / 5 | 106 / 96 (88) | 105 / 106 | OpenStreetMap, not checked | 30 m | publish | ratings not checked against the resort; 30 m terrain; 1 runs raised by the steepness check |
| Wolf Creek (`wolf-creek`) | Colorado, USA | 73 | 11 / 11 | 185 / 170 (89) | 181 / 185 | OpenStreetMap, not checked | 1 m | publish | ratings not checked against the resort |
| Yellowstone Club (`yellowstone-club`) | Montana, USA | 142 | 21 / 17 | 120 / 94 (99) | 120 / 120 | OpenStreetMap, not checked | 1 m | hold | lifts not joined to the rest of the map (isolated by rule): Great Bear, Silver Tip - High SPeed, Eglise Gondola Stage 1, Eglise Gondola Stage 2, Little Dipper Triple, Alpine Greens; the name says club: it may be private (members only); check before publishing; ratings not checked against the resort; |
