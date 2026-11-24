# Automatic batch 2: the owner's list of 50 (2026-11-24)

The 50 mountains the owner picked, in their order (Mountain Creek to Niseko United), built with the automatic builder:
`tools/bulk/run_batch.py`, then `tools/bulk/gate.py --write --table`. The maps are on disk only: nothing was uploaded to
R2, live or preview. Some of the 50 are more than one OpenSkiMap area, so the table has 54 maps.

**Result: 40 of 54 maps publish through the gate, 14 held.** By the owner's numbering, 36 of the 50 pass completely,
and 14 have at least one held map.

How the 50 were matched to OpenSkiMap's list (`tools/bulk/candidates.json`):
- Arapahoe Basin was already built (held since batch 1, 11 dead ends); rebuilt, still held.
- "Summit at Snoqualmie": Summit West, Central and East are already live as `three-summits`; Alpental (same company,
  separate area) was built as the new part.
- Boston Mills and Brandywine are two areas (7 and 9 runs in OpenStreetMap, under the list's 10-run minimum): added to
  the candidate list by hand from OpenSkiMap's own entries, built as two maps. Boston Mills is held (7 runs).
- Courchevel and Méribel are two OpenSkiMap areas; built as one map `courchevel-meribel` (config `combined_note`): as
  two maps they cut each other off at the shared ridge tops (Saulire, Loze). Val Thorens and Les Menuires stay apart;
  the overlap check found no overlap with Val Thorens's map.
- Chamonix is three separate areas in OpenSkiMap, built as three maps: Brévent-Flégère, Grands Montets (held), and Balme
  (Le Tour, Vallorcine). Les Houches was not on the list.
- St. Anton: OpenSkiMap's "St. Anton/St. Christoph/Stuben" (40 lifts). Lech/Zürs and Warth-Schröcken (the rest of Ski
  Arlberg) are separate entries, not built.
- Val Gardena and Alta Badia (Sella Ronda) are two maps; Dolomiti Superski (486 lifts) is the umbrella, not built.
- Kitzbühel is OpenSkiMap's "KitzSki". Verbier is "4 Vallées" (Verbier, La Tzoumaz, Nendaz, Veysonnaz, Thyon).

Builder fixes made for this batch (they change nothing for maps already built until they are rebuilt):
- `tools/extent.py`: an umbrella outline around nearly all of a resort's own lifts (Les 3 Vallées, Ski Arlberg) no
  longer counts as a neighbour's when the resort has no outline of its own. It blocked every run: Courchevel and
  Méribel first built with no runs (the build stopped), St. Anton with 16 of its runs.
- `tools/extent.py`: avalanche-blasting ropeways (`aerialway=avalanche`, `explosive`) are not lifts; one beside St.
  Anton's Valfagehr was taken for a neighbour's lift and stopped the search there.
- `tools/build_canopy.py`: big resorts read the canopy map coarser (above 60 million pixels); KitzSki and Verbier were
  killed for lack of memory.
- `tools/bulk/gate.py`: Italy's general number (112) for the SOS sheet; a map with 7 runs or fewer is held (the app's
  tests need more than 7).
- `tools/build_forecast_catalog.py`: a built resort is never folded into another built one (with OpenSkiMap's
  2026-11-23 data Aspen Snowmass took in Aspen Mountain's entry). Five catalog ids that OpenSkiMap renumbered got
  `id_aliases`.
- `tools/build_globe.py`: `GLOBE_NPM_DIR` reads the map packages from a local folder (cdn.jsdelivr.net is not on this
  environment's network; the npm registry is).
- `tests/resorts.test.js`: a map with exactly 30 runs (Elk Mountain) could never pass the run-count check.

Measured:
- **Time:** 13 minutes for the 41 North American maps (3 at a time), 27 minutes for the 14 European and Japanese ones,
  then about 17 minutes of rebuilds after the fixes; about 82 minutes from the candidate list to the final gate.
- **Lifts:** 969 on the maps against OpenSkiMap's 1,001 (Val Gardena's gap is its funicular railway, counted by
  OpenSkiMap as 26 pieces). **Runs:** 4,880 run pieces shown; 4,845 of 4,915 reachable from a lift.
- **Ratings:** resort feed for 3 (Arapahoe Basin, Bear Mountain feed 57, June Mountain feed 59); the other 51 from
  OpenStreetMap, labelled "not yet checked" in the app.
- **Terrain:** 1 m lidar for the US (Mt. Baker 89%, Arizona Snowbowl 97%, the rest from 10 m), Quebec and Ontario,
  IGN 1 m in France, swisstopo in Switzerland, GSI 5 m in Japan; 30 m for Kicking Horse, Grouse and Nakiska (MRDEM)
  and the Austrian and Italian maps (Copernicus GLO-30).
- **Disk:** 45 MB of map files for the 54; the work folder (OpenStreetMap extracts and terrain) about 3.6 GB more.

## Per mountain

| Resort | Region | Time (s) | Lifts (ours / OpenSkiMap) | Runs shown / named (OpenSkiMap runs) | Run pieces reachable | Ratings | Terrain | Gate | Why held / notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Mountain Creek (`mountain-creek`) | New Jersey, USA | 114 | 11 / 11 | 35 / 32 (44) | 35 / 35 | OpenStreetMap, not checked | 1 m | hold | lifts not joined to the rest of the map (isolated by rule): South Peak Express, Bear Peak Express; ratings not checked against the resort |
| Arapahoe Basin (`arapahoe-basin`) | Colorado, USA | 73 | 9 / 9 | 170 / 164 (103) | 170 / 175 | resort feed (Arapahoe Basin trail report (resort feed) | 1 m | hold | 11 dead-end runs |
| Bear Mountain (`bear-mountain`) | California, USA | 55 | 11 / 11 | 26 / 25 (26) | 26 / 26 | resort feed (Bear Mountain trail report (resort feed,) | 1 m | publish | 1 lift ends joined by rule |
| Mountain High (`mountain-high`) | California, USA | 50 | 12 / 12 | 43 / 37 (43) | 27 / 43 | OpenStreetMap, not checked | 1 m | hold | only 27 of 43 run pieces reachable from a lift; lifts not joined to the rest of the map (isolated by rule): Mtn High Express, Discovery; ratings not checked against the resort |
| Alpental (`alpental`) | Washington, USA | 105 | 6 / 6 | 46 / 40 (35) | 42 / 46 | OpenStreetMap, not checked | 1 m | hold | 4 runs no lift reaches; 3 dead-end runs; ratings not checked against the resort |
| Jiminy Peak (`jiminy-peak`) | Massachusetts, USA | 48 | 8 / 8 | 44 / 44 (40) | 44 / 44 | OpenStreetMap, not checked | 1 m | publish | lift ends: 0 outside the network, 1 with no run; ratings not checked against the resort |
| Wildcat Mountain (`wildcat-mountain`) | New Hampshire, USA | 48 | 4 / 4 | 53 / 49 (50) | 53 / 53 | OpenStreetMap, not checked | 1 m | hold | 2 runs climb more than 12 m; ratings not checked against the resort |
| Liberty Mountain (`liberty-mountain`) | Pennsylvania, USA | 40 | 8 / 8 | 23 / 20 (25) | 23 / 23 | OpenStreetMap, not checked | 1 m | publish | ratings not checked against the resort; 1 lift ends joined by rule |
| Whitetail (`whitetail`) | Pennsylvania, USA | 58 | 8 / 8 | 22 / 22 (21) | 22 / 22 | OpenStreetMap, not checked | 1 m | publish | isolated by rule: Magic carpet; ratings not checked against the resort |
| Roundtop Mountain (`roundtop-mountain`) | Pennsylvania, USA | 47 | 9 / 9 | 32 / 21 (29) | 32 / 32 | OpenStreetMap, not checked | 1 m | publish | ratings not checked against the resort |
| Jack Frost Mountain (`jack-frost-mountain`) | Pennsylvania, USA | 38 | 7 / 7 | 21 / 21 (21) | 21 / 21 | OpenStreetMap, not checked | 1 m | publish | ratings not checked against the resort |
| Big Boulder (`big-boulder`) | Pennsylvania, USA | 38 | 7 / 7 | 18 / 18 (18) | 18 / 18 | OpenStreetMap, not checked | 1 m | publish | ratings not checked against the resort |
| Wilmot Mountain (`wilmot-mountain`) | Wisconsin, USA | 44 | 13 / 13 | 23 / 22 (24) | 23 / 23 | OpenStreetMap, not checked | 1 m | publish | isolated by rule: Magic carpet, Magic carpet; ratings not checked against the resort |
| Mt. Brighton (`mt-brighton`) | Michigan, USA | 43 | 12 / 12 | 22 / 21 (23) | 22 / 22 | OpenStreetMap, not checked | 1 m | publish | ratings not checked against the resort |
| Boston Mills (`boston-mills`) | Ohio, USA | 67 | 7 / 7 | 7 / 7 (7) | 7 / 7 | OpenStreetMap, not checked | 1 m | hold | only 7 runs on the map (OpenStreetMap is missing most of them); ratings not checked against the resort |
| Brandywine (`brandywine`) | Ohio, USA | 43 | 9 / 9 | 9 / 9 (9) | 9 / 9 | OpenStreetMap, not checked | 1 m | publish | ratings not checked against the resort; 1 lift ends joined by rule |
| Mad River Mountain (`mad-river-mountain`) | Ohio, USA | 36 | 11 / 11 | 14 / 14 (10) | 14 / 14 | OpenStreetMap, not checked | 1 m | publish | ratings not checked against the resort; 2 lift ends joined by rule |
| Perfect North Slopes (`perfect-north-slopes`) | Indiana, USA | 51 | 14 / 14 | 24 / 24 (21) | 24 / 24 | OpenStreetMap, not checked | 1 m | publish | ratings not checked against the resort; 2 lift ends joined by rule |
| Hidden Valley (`hidden-valley-pennsylvania`) | Pennsylvania, USA | 40 | 7 / 7 | 34 / 29 (35) | 34 / 34 | OpenStreetMap, not checked | 1 m | publish | ratings not checked against the resort |
| Wintergreen (`wintergreen`) | Virginia, USA | 57 | 9 / 9 | 24 / 24 (21) | 24 / 24 | OpenStreetMap, not checked | 1 m | publish | ratings not checked against the resort |
| Massanutten (`massanutten`) | Virginia, USA | 49 | 9 / 9 | 21 / 21 (22) | 21 / 21 | OpenStreetMap, not checked | 1 m | publish | isolated by rule: Lift 1, Lift 1; ratings not checked against the resort; 1 lift ends joined by rule |
| Sugar Mountain (`sugar-mountain`) | North Carolina, USA | 48 | 8 / 8 | 27 / 21 (26) | 27 / 27 | OpenStreetMap, not checked | 1 m | publish | ratings not checked against the resort |
| Beech Mountain (`beech-mountain`) | North Carolina, USA | 54 | 8 / 8 | 14 / 11 (12) | 14 / 14 | OpenStreetMap, not checked | 1 m | publish | ratings not checked against the resort; 1 lift ends joined by rule |
| Bristol Mountain (`bristol-mountain`) | New York, USA | 45 | 6 / 6 | 39 / 39 (39) | 39 / 39 | OpenStreetMap, not checked | 1 m | publish | ratings not checked against the resort |
| Elk Mountain (`elk-mountain`) | Pennsylvania, USA | 43 | 7 / 7 | 30 / 30 (28) | 30 / 30 | OpenStreetMap, not checked | 1 m | publish | ratings not checked against the resort |
| Wisp (`wisp`) | Maryland, USA | 58 | 12 / 12 | 34 / 32 (36) | 34 / 34 | OpenStreetMap, not checked | 1 m | publish | ratings not checked against the resort |
| Nashoba Valley (`nashoba-valley`) | Massachusetts, USA | 49 | 12 / 12 | 17 / 17 (17) | 17 / 17 | OpenStreetMap, not checked | 1 m | publish | isolated by rule: Magic carpet, Magic carpet; ratings not checked against the resort |
| Crotched Mountain (`crotched-mountain-ride`) | New Hampshire, USA | 60 | 5 / 5 | 25 / 25 (22) | 25 / 25 | OpenStreetMap, not checked | 1 m | publish | ratings not checked against the resort |
| Granite Peak (`granite-peak`) | Wisconsin, USA | 48 | 7 / 7 | 60 / 59 (52) | 60 / 60 | OpenStreetMap, not checked | 1 m | publish | ratings not checked against the resort |
| Crystal Mountain (`crystal-mountain-michigan`) | Michigan, USA | 42 | 8 / 8 | 63 / 53 (55) | 63 / 63 | OpenStreetMap, not checked | 1 m | publish | ratings not checked against the resort |
| The Highlands (`boyne-highlands`) | Michigan, USA | 64 | 7 / 7 | 55 / 54 (48) | 55 / 55 | OpenStreetMap, not checked | 1 m | publish | ratings not checked against the resort |
| Kicking Horse (`kicking-horse`) | British Columbia, Canada | 94 | 5 / 5 | 82 / 58 (58) | 74 / 82 | OpenStreetMap, not checked | 30 m | hold | 8 runs no lift reaches; ratings not checked against the resort; 30 m terrain; 1 runs raised by the steepness check |
| Grouse Mountain (`grouse-mountain`) | British Columbia, Canada | 82 | 8 / 8 | 62 / 42 (52) | 62 / 62 | OpenStreetMap, not checked | 30 m | publish | ratings not checked against the resort; 30 m terrain |
| Mt. Baker (`mt-baker`) | Washington, USA | 92 | 10 / 10 | 62 / 37 (47) | 68 / 68 | OpenStreetMap, not checked | 1 m | publish | ratings not checked against the resort |
| Mission Ridge (`mission-ridge`) | Washington, USA | 65 | 7 / 7 | 71 / 59 (54) | 71 / 71 | OpenStreetMap, not checked | 1 m | hold | 4 runs climb more than 12 m; ratings not checked against the resort |
| June Mountain (`june-mountain`) | California, USA | 54 | 7 / 7 | 35 / 29 (36) | 35 / 35 | resort feed (June Mountain trail report (resort feed,) | 1 m | publish |  |
| Arizona Snowbowl (`arizona-snowbowl`) | Arizona, USA | 102 | 8 / 8 | 56 / 51 (53) | 55 / 56 | OpenStreetMap, not checked | 1 m | publish | ratings not checked against the resort |
| Nakiska (`nakiska`) | Alberta, Canada | 50 | 7 / 7 | 83 / 72 (55) | 84 / 84 | OpenStreetMap, not checked | 30 m | publish | ratings not checked against the resort; 30 m terrain |
| Stoneham (`touristique-stoneham`) | Quebec, Canada | 61 | 6 / 6 | 63 / 42 (55) | 63 / 63 | OpenStreetMap, not checked | 1 m | publish | ratings not checked against the resort |
| Mont Orford (`mont-orford`) | Quebec, Canada | 66 | 8 / 8 | 66 / 61 (37) | 66 / 66 | OpenStreetMap, not checked | 1 m | publish | ratings not checked against the resort |
| Mount St. Louis Moonstone (`mount-st-louis-moonstone`) | Ontario, Canada | 44 | 10 / 10 | 41 / 41 (41) | 41 / 41 | OpenStreetMap, not checked | 1 m | publish | ratings not checked against the resort |
| Courchevel – Méribel (`courchevel-meribel`) | Savoie, France | 712 | 102 / 104 | 592 / 194 (510) | 583 / 595 | OpenStreetMap, not checked | 1 m | hold | lifts not joined to the rest of the map (isolated by rule): Roc de Tougne, Tougnète 2, Bouquetin, Côte Brune; ratings not checked against the resort |
| Chamonix: Brévent-Flégère (`brevent-flegere-chamonix`) | Haute-Savoie, France | 114 | 18 / 18 | 66 / 36 (65) | 66 / 66 | OpenStreetMap, not checked | 1 m | publish | ratings not checked against the resort; 1 lift ends joined by rule |
| Chamonix: Grands Montets (`les-grands-montets`) | Haute-Savoie, France | 73 | 9 / 9 | 48 / 26 (40) | 40 / 48 | OpenStreetMap, not checked | 1 m | hold | only 40 of 48 run pieces reachable from a lift; 5 runs no lift reaches; ratings not checked against the resort; 1 lift ends joined by rule |
| Chamonix: Balme – Le Tour – Vallorcine (`balme-vallorcine`) | Haute-Savoie, France | 82 | 9 / 9 | 40 / 22 (99) | 41 / 41 | OpenStreetMap, not checked | 1 m | publish | ratings not checked against the resort |
| St. Anton am Arlberg (`st-anton-st-christoph-stuben`) | Tyrol, Austria | 77 | 40 / 40 | 239 / 113 (189) | 240 / 242 | OpenStreetMap, not checked | 30 m | hold | 11 runs climb more than 12 m; lifts not joined to the rest of the map (isolated by rule): Albonagratbahn, Albonabahn I, Albonabahn II, Valfagehrbahn, Flexenbahn, St. Christophbahn, Arlenmähderbahn, Schindlergratbahn, Osthangbahn, Zammermoosbahn, Tanzbödenbahn, Vallugabahn I, Vallugabahn II; ratings  |
| Ischgl – Samnaun (Silvretta Arena) (`silvretta-arena-ischgl-samnaun`) | Tyrol, Austria | 272 | 47 / 47 | 304 / 87 (279) | 305 / 305 | OpenStreetMap, not checked | 30 m | publish | isolated by rule: Übungslift Mathon; ratings not checked against the resort; 30 m terrain; 1 lift ends joined by rule |
| Kitzbühel (KitzSki) (`kitzski`) | Tyrol, Austria | 603 | 63 / 63 | 283 / 97 (244) | 276 / 286 | OpenStreetMap, not checked | 30 m | hold | lifts not joined to the rest of the map (isolated by rule): Gaisberg, Bichlalmlift; ratings not checked against the resort; 30 m terrain; 1 lift ends joined by rule |
| Sölden (`solden`) | Tyrol, Austria | 229 | 37 / 39 | 175 / 61 (172) | 176 / 176 | OpenStreetMap, not checked | 30 m | hold | lifts not joined to the rest of the map (isolated by rule): ; ratings not checked against the resort; 30 m terrain |
| Val Gardena (`val-gardena-groden-gherdeina`) | Bolzano/Bozen, Italy | 330 | 55 / 79 | 192 / 101 (208) | 194 / 195 | OpenStreetMap, not checked | 30 m | hold | lifts 55 of OpenSkiMap's 79; only 52 of the 79 lifts OpenSkiMap assigns are on the map; ratings not checked against the resort; 30 m terrain |
| Alta Badia (`alta-badia`) | Bolzano/Bozen, Italy | 450 | 58 / 59 | 203 / 92 (221) | 202 / 203 | OpenStreetMap, not checked | 30 m | publish | isolated by rule: Val Setus; ratings not checked against the resort; 30 m terrain |
| Verbier – 4 Vallées (`4-vallees-verbier-la-tzoumaz-nendaz-veys`) | Valais, Switzerland | 811 | 75 / 76 | 480 / 97 (352) | 481 / 483 | OpenStreetMap, not checked | 1 m | publish | isolated by rule: Magic carpet, Lift, Magic carpet, Magic carpet, Magic carpet, Magic carpet, Magic carpet; ratings not checked against the resort; 2 lift ends joined by rule |
| Alpe d'Huez (`alpe-d-huez-grand-domaine`) | Isère, France | 284 | 80 / 82 | 385 / 136 (335) | 385 / 385 | OpenStreetMap, not checked | 1 m | publish | lift ends: 0 outside the network, 1 with no run; ratings not checked against the resort |
| Niseko United (`niseko-united`) | Hokkaido Prefecture, Japan | 348 | 29 / 29 | 177 / 77 (164) | 182 / 182 | OpenStreetMap, not checked | 1 m | publish | ratings not checked against the resort |
