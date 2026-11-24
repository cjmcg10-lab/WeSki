# Sugar Mountain (sugar-mountain)

Built 2026-11-24 by tools/pipeline.py. Terrain: USGS NC_Phase5_2018_A18 (gaps filled from TN Eastern 2 16 B16 Del4 2016, 10 m national elevation model (1/3 arc-second)).

**27 runs (21 named, 7.4 km), 8 lifts. 1 things to look at.**

- **LOOK**: ratings NOT checked: not ready to go live  
  make tools/official/<id>.json (a feed if there is one, else the trail map: see docs/ADDING_MOUNTAINS.md)
- info: audit: stub: 1
- pass: 0 shown runs rated by guess
- pass: reachable from the base: 27 of 27 run pieces
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
- pass: 0 runs climb more than 12 m
