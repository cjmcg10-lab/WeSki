# Liberty Mountain (liberty-mountain)

Built 2026-11-24 by tools/pipeline.py. Terrain: USGS PA_17County_D24 (gaps filled from PA South Central B1 2017, 10 m national elevation model (1/3 arc-second)).

**23 runs (20 named, 8.5 km), 8 lifts. 1 things to look at.**

- **LOOK**: ratings NOT checked: not ready to go live  
  make tools/official/<id>.json (a feed if there is one, else the trail map: see docs/ADDING_MOUNTAINS.md)
- info: 4 joins made automatically (look at the longest ones on the map)  
  Vertigo ski 164 m; Sneaky Pete ski 4 m; First Class Area ski 20 m; Boulder Ridge Carpet (bottom) ski 131 m
- info: audit: lift missing: 1
- info: the resort's outline relation/13532755 has no name or is not in the download: the build starts from the resort's lifts instead (include_ways)
- pass: 0 shown runs rated by guess
- pass: reachable from the base: 23 of 23 run pieces
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
- pass: 0 runs climb more than 12 m
