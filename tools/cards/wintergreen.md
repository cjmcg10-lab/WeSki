# Wintergreen (wintergreen)

Built 2026-11-24 by tools/pipeline.py. Terrain: USGS VA_NorthernShenandoah_2020_D20 (gaps filled from VA_West_Chesapeake_Bay_Watershed_Lidar_2017_B17, VA ChesapeakeBaySouth 2015, 10 m national elevation model (1/3 arc-second)).

**24 runs (24 named, 10.4 km), 9 lifts. 1 things to look at.**

- **LOOK**: ratings NOT checked: not ready to go live  
  make tools/official/<id>.json (a feed if there is one, else the trail map: see docs/ADDING_MOUNTAINS.md)
- info: audit: no rating: 1, run missing: 1, stub: 1
- pass: 0 shown runs rated by guess
- pass: reachable from the base: 24 of 24 run pieces
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
- pass: 0 runs climb more than 12 m
