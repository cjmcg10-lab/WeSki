# Beech Mountain (beech-mountain)

Built 2026-11-24 by tools/pipeline.py. Terrain: USGS NC_Phase5_2018_A18 (gaps filled from TN Eastern 2 16 B16 Del4 2016, 10 m national elevation model (1/3 arc-second)).

**14 runs (11 named, 5.2 km), 8 lifts. 1 things to look at.**

- **LOOK**: ratings NOT checked: not ready to go live  
  make tools/official/<id>.json (a feed if there is one, else the trail map: see docs/ADDING_MOUNTAINS.md)
- info: 1 joins made automatically (look at the longest ones on the map)  
  Magic carpet (top) ski 142 m
- info: audit: stub: 1
- info: the resort's outline relation/5886546 has no name or is not in the download: the build starts from the resort's lifts instead (include_ways)
- pass: 0 shown runs rated by guess
- pass: reachable from the base: 14 of 14 run pieces
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
- pass: 0 runs climb more than 12 m
