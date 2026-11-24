# Big Boulder (big-boulder)

Built 2026-11-24 by tools/pipeline.py. Terrain: USGS PA_Northcentral_2019_B19 (gaps filled from 10 m national elevation model (1/3 arc-second)).

**18 runs (18 named, 6.4 km), 7 lifts. 1 things to look at.**

- **LOOK**: ratings NOT checked: not ready to go live  
  make tools/official/<id>.json (a feed if there is one, else the trail map: see docs/ADDING_MOUNTAINS.md)
- info: 2 joins made automatically (look at the longest ones on the map)  
  The Elbow ski 54 m; Ski School Slopes ski 48 m
- info: lifts fixed by rule (two-way gondola, or isolated: not joined to the rest): Tubing Only Carpet
- pass: 0 shown runs rated by guess
- pass: reachable from the base: 18 of 18 run pieces
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
- pass: 0 runs climb more than 12 m
- pass: audit: nothing flagged
