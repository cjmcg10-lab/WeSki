# Massanutten (massanutten)

Built 2026-11-24 by tools/pipeline.py. Terrain: USGS VA_NorthernShenandoah_2020_D20 (gaps filled from VA ChesapeakeBayNorth 2015, 10 m national elevation model (1/3 arc-second)).

**21 runs (21 named, 9.1 km), 9 lifts. 1 things to look at.**

- **LOOK**: ratings NOT checked: not ready to go live  
  make tools/official/<id>.json (a feed if there is one, else the trail map: see docs/ADDING_MOUNTAINS.md)
- info: 2 joins made automatically (look at the longest ones on the map)  
  Paul's Way ski 3 m; Lift 1 (top) ski 148 m
- info: the resort's outline relation/5881053 has no name or is not in the download: the build starts from the resort's lifts instead (include_ways)
- info: lifts fixed by rule (two-way gondola, or isolated: not joined to the rest): Lift 1
- pass: 0 shown runs rated by guess
- pass: reachable from the base: 21 of 21 run pieces
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
- pass: 0 runs climb more than 12 m
- pass: audit: nothing flagged
