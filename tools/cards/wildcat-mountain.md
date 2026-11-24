# Wildcat Mountain (wildcat-mountain)

Built 2026-11-24 by tools/pipeline.py. Terrain: USGS NH_Umbagog_LiDAR_2016_D16 (gaps filled from NH CT RiverNorthL6 2015, NH CT RiverNorthL6 P2 2015, 10 m national elevation model (1/3 arc-second)).

**53 runs (49 named, 28.2 km), 4 lifts. 3 things to look at.**

- **LOOK**: ratings NOT checked: not ready to go live  
  make tools/official/<id>.json (a feed if there is one, else the trail map: see docs/ADDING_MOUNTAINS.md)
- **LOOK**: 2 shown runs rated by guess  
  Thompson Brook Trail
- **LOOK**: 2 runs climb more than 12 m  
  Cat-Walk 28 m; Upper Polecat 17 m
- info: 1 joins made automatically (look at the longest ones on the map)  
  Upper Polecat bottom ski 44 m
- info: audit: no rating: 2, run climbs: 2
- pass: reachable from the base: 53 of 53 run pieces
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
