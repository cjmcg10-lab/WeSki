# Perfect North Slopes (perfect-north-slopes)

Built 2026-11-24 by tools/pipeline.py. Terrain: USGS OH_Statewide_Phase3_2021_B21 (gaps filled from KY_WesternKY_A22, IN_Indiana_Statewide_LiDAR_2017_B17, 10 m national elevation model (1/3 arc-second)).

**24 runs (24 named, 6.6 km), 14 lifts. 1 things to look at.**

- **LOOK**: ratings NOT checked: not ready to go live  
  make tools/official/<id>.json (a feed if there is one, else the trail map: see docs/ADDING_MOUNTAINS.md)
- info: 3 joins made automatically (look at the longest ones on the map)  
  Hollywood bottom ski 44 m; Magic carpet (top) ski 118 m; Magic carpet (top) ski 111 m
- pass: 0 shown runs rated by guess
- pass: reachable from the base: 24 of 24 run pieces
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
- pass: 0 runs climb more than 12 m
- pass: audit: nothing flagged
