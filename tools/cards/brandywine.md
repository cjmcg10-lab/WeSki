# Brandywine (brandywine)

Built 2026-11-24 by tools/pipeline.py. Terrain: USGS OH_Statewide_Phase1_2019_B19 (gaps filled from 10 m national elevation model (1/3 arc-second)).

**9 runs (9 named, 2.0 km), 9 lifts. 1 things to look at.**

- **LOOK**: ratings NOT checked: not ready to go live  
  make tools/official/<id>.json (a feed if there is one, else the trail map: see docs/ADDING_MOUNTAINS.md)
- info: 2 joins made automatically (look at the longest ones on the map)  
  Grizzly ski 19 m; Tubing Carpet Lift (bottom) ski 150 m
- info: lifts fixed by rule (two-way gondola, or isolated: not joined to the rest): Tubing Carpet Lift
- pass: 0 shown runs rated by guess
- pass: reachable from the base: 9 of 9 run pieces
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
- pass: 0 runs climb more than 12 m
- pass: audit: nothing flagged
