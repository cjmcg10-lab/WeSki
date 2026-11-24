# Mission Ridge (mission-ridge)

Built 2026-11-24 by tools/pipeline.py. Terrain: USGS WA_CentralWildfire_D22 (gaps filled from 10 m national elevation model (1/3 arc-second)).

**71 runs (59 named, 40.1 km), 7 lifts. 3 things to look at.**

- **LOOK**: ratings NOT checked: not ready to go live  
  make tools/official/<id>.json (a feed if there is one, else the trail map: see docs/ADDING_MOUNTAINS.md)
- **LOOK**: 2 shown runs rated by guess  
  (no name)
- **LOOK**: 4 runs climb more than 12 m  
  Otto's Outback 19 m; Central 1 20 m; Jackson's 28 m; Chute 5 15 m
- info: 7 joins made automatically (look at the longest ones on the map)  
  Windy Ridge/Microwave Traverse bottom ski 178 m; Windy 5 bottom ski 53 m; Windy 2 bottom ski 51 m; Windy 4 bottom ski 50 m; Castle Face ski 147 m; Windy 5 ski 107 m; Windy 4 ski 91 m
- info: audit: flat black: 1, no rating: 3, run climbs: 5
- pass: reachable from the base: 71 of 71 run pieces
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
