# China Peak Mountain (china-peak-mountain)

Built 2026-11-23 by tools/pipeline.py. Terrain: reused from the work folder.

**92 runs (45 named, 35.8 km), 11 lifts. 1 things to look at.**

- **LOOK**: ratings NOT checked: not ready to go live  
  make tools/official/<id>.json (a feed if there is one, else the trail map: see docs/ADDING_MOUNTAINS.md)
- info: 1 joins made automatically (look at the longest ones on the map)  
  Westridge ski 45 m
- info: same counts as the previous build
- info: the resort's outline relation/15717134 has no name or is not in the download: the build starts from the resort's lifts instead (include_ways)
- info: lifts fixed by rule (two-way gondola, or isolated: not joined to the rest): Tubing Hill Carpet
- pass: 0 shown runs rated by guess
- pass: reachable from the base: 92 of 92 run pieces
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
- pass: 0 runs climb more than 12 m
- pass: audit: nothing flagged
