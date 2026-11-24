# Nakiska (nakiska)

Built 2026-11-24 by tools/pipeline.py. Terrain: not rebuilt (--checks-only).

**80 runs (70 named, 34.1 km), 6 lifts. 1 things to look at.**

- **LOOK**: 3 runs on the resort's list are not on the map  
  Lower Elbow, Sweetgrass, Upper Elbow (draw them, or explain them in the official json: same_as / not_runs / elsewhere)
- info: 4 run pieces hidden (not on the resort's list and not a link)  
  (no name) (1325579196, 868 m): OpenStreetMap: backcountry, no name (not a resort run); Upper North Axe (1325579197, 511 m): hidden by hand: not on the resort's 2025 trail map or its trail list, and no public lift reaches its top (checked 2026-11-24); Bearspaw (1325579198, 360 m): hidden by hand: not on the resort's 2025 trail map or its trail list, and no public lift reaches its top (checked 2026-11-24); (no name) (305915922, 58 m): unnamed piece, not on the resort's list, leads nowhere on it
- info: audit: run climbs: 2
- info: same counts as the previous build
- info: the resort's outline relation/4080380 has no name or is not in the download: the build starts from the resort's lifts instead (include_ways)
- pass: ratings checked against the resort's own list  
  71 on the list, 107 matched, 0 corrected from OpenStreetMap
- pass: lifts on the resort's list: 4 of 4 on the map
- pass: 0 shown runs rated by guess
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
- pass: 0 runs climb more than 12 m
