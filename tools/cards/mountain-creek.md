# Mountain Creek (mountain-creek)

Built 2026-11-24 by tools/pipeline.py. Terrain: USGS NJ_NW_New_Jersey_6_County_Lidar_2017_B17 (gaps filled from NY_SouthEast4County_A22, NY Sandy-Ul-Du-Or 2013, 10 m national elevation model (1/3 arc-second)).

**35 runs (32 named, 14.6 km), 11 lifts. 1 things to look at.**

- **LOOK**: ratings NOT checked: not ready to go live  
  make tools/official/<id>.json (a feed if there is one, else the trail map: see docs/ADDING_MOUNTAINS.md)
- info: 5 joins made automatically (look at the longest ones on the map)  
  Kamikaze bottom ski 85 m; Bear Paw top ski 61 m; Tail Spin top walk 154 m; None top ski 79 m; unnamed#20 ski 145 m
- info: audit: run missing: 1
- info: lifts fixed by rule (two-way gondola, or isolated: not joined to the rest): Bear Peak Express, South Peak Express, Surface lift
- pass: 0 shown runs rated by guess
- pass: reachable from the base: 35 of 35 run pieces
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
- pass: 0 runs climb more than 12 m
