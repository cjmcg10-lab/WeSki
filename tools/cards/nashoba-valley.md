# Nashoba Valley (nashoba-valley)

Built 2026-11-24 by tools/pipeline.py. Terrain: USGS MA_CentralEastern_2021_B21 (gaps filled from 10 m national elevation model (1/3 arc-second)).

**17 runs (17 named, 4.3 km), 12 lifts. 1 things to look at.**

- **LOOK**: ratings NOT checked: not ready to go live  
  make tools/official/<id>.json (a feed if there is one, else the trail map: see docs/ADDING_MOUNTAINS.md)
- info: 1 joins made automatically (look at the longest ones on the map)  
  Nashoba Glades ski 23 m
- info: lifts fixed by rule (two-way gondola, or isolated: not joined to the rest): Magic carpet
- pass: 0 shown runs rated by guess
- pass: reachable from the base: 17 of 17 run pieces
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
- pass: 0 runs climb more than 12 m
- pass: audit: nothing flagged
