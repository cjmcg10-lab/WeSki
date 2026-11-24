# Granite Peak (granite-peak)

Built 2026-11-24 by tools/pipeline.py. Terrain: USGS WI_Statewide_2021_B21 (gaps filled from 10 m national elevation model (1/3 arc-second)).

**60 runs (59 named, 21.8 km), 7 lifts. 2 things to look at.**

- **LOOK**: ratings NOT checked: not ready to go live  
  make tools/official/<id>.json (a feed if there is one, else the trail map: see docs/ADDING_MOUNTAINS.md)
- **LOOK**: 6 shown runs rated by guess  
  Beyond, Buffett's Pass, Cottonwood, Kingdom, Meadow Ridge, Westwood
- info: 4 joins made automatically (look at the longest ones on the map)  
  Elk Run top ski 43 m; Slalom top ski 43 m; Sundance top ski 43 m; Slalom ski 121 m
- info: audit: flat black: 1, no rating: 6
- pass: reachable from the base: 60 of 60 run pieces
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
- pass: 0 runs climb more than 12 m
