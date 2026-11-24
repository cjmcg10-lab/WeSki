# Cypress Mountain (cypress-mountain)

Built 2026-11-23 by tools/pipeline.py. Terrain: canada.

**96 runs (63 named, 31.0 km), 8 lifts. 3 things to look at.**

- **LOOK**: 5 runs on the resort's list are not on the map  
  Cascade, Detention Glades, Fork, Lower Fork, PGS (draw them, or explain them in the official json: same_as / not_runs / elsewhere)
- **LOOK**: 1 shown runs rated by guess  
  (no name)
- **LOOK**: change from the previous build: runs 103 -> 96, lifts 7 -> 8, km 31.3 -> 31.0  
  fewer lifts or named runs than before: compare before pushing
- info: 2 joins made automatically (look at the longest ones on the map)  
  Sunshine Face Glades top ski 39 m; Sunshine Face Glades bottom ski 55 m
- info: 1 run pieces hidden (not on the resort's list and not a link)  
  (no name) (91317050, 45 m): unnamed piece, not on the resort's list, leads nowhere on it
- info: audit: no rating: 7
- info: FOUND MORE: the resort reaches beyond its download box; the box was widened from [-123.2188, 49.371, -123.1646, 49.4133] to [-123.2253, 49.371, -123.068, 49.4175]; lifts added: Magic Carpet
- info: lifts fixed by rule (two-way gondola, or isolated: not joined to the rest): Magic Carpet
- pass: ratings checked against the resort's own list  
  63 on the list, 96 matched, 0 corrected from OpenStreetMap
- pass: lifts on the resort's list: 7 of 7 on the map
- pass: reachable from the base: 97 of 97 run pieces
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
- pass: 0 runs climb more than 12 m
