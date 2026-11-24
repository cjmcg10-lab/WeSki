# Crystal Mountain (crystal-mountain-michigan)

Built 2026-11-24 by tools/pipeline.py. Terrain: USGS MI_13County_2015_C16 (gaps filled from 10 m national elevation model (1/3 arc-second)).

**63 runs (53 named, 16.9 km), 8 lifts. 2 things to look at.**

- **LOOK**: ratings NOT checked: not ready to go live  
  make tools/official/<id>.json (a feed if there is one, else the trail map: see docs/ADDING_MOUNTAINS.md)
- **LOOK**: 6 shown runs rated by guess  
  (no name), Buckaroo, Leo's Legacy, Megan's Way
- info: 1 joins made automatically (look at the longest ones on the map)  
  The Learning Center ski 30 m
- info: audit: no rating: 7
- pass: reachable from the base: 63 of 63 run pieces
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
- pass: 0 runs climb more than 12 m
