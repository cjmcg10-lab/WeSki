# Wisp (wisp)

Built 2026-11-24 by tools/pipeline.py. Terrain: USGS MD_4County_D24 (gaps filled from WV_FEMAR3_Southcentral_2018_D19, MD Garret Co 2014, 10 m national elevation model (1/3 arc-second)).

**34 runs (32 named, 15.6 km), 12 lifts. 1 things to look at.**

- **LOOK**: ratings NOT checked: not ready to go live  
  make tools/official/<id>.json (a feed if there is one, else the trail map: see docs/ADDING_MOUNTAINS.md)
- info: 3 joins made automatically (look at the longest ones on the map)  
  Ace's Run ski 6 m; Boulder Run ski 134 m; Beaver ski 59 m
- info: lifts fixed by rule (two-way gondola, or isolated: not joined to the rest): Tubing Tow
- pass: 0 shown runs rated by guess
- pass: reachable from the base: 34 of 34 run pieces
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
- pass: 0 runs climb more than 12 m
- pass: audit: nothing flagged
