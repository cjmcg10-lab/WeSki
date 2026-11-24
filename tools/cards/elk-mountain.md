# Elk Mountain (elk-mountain)

Built 2026-11-24 by tools/pipeline.py. Terrain: USGS PA_Northcentral_2019_B19 (gaps filled from 10 m national elevation model (1/3 arc-second)).

**30 runs (30 named, 16.7 km), 7 lifts. 1 things to look at.**

- **LOOK**: ratings NOT checked: not ready to go live  
  make tools/official/<id>.json (a feed if there is one, else the trail map: see docs/ADDING_MOUNTAINS.md)
- info: audit: run missing: 1
- pass: 0 shown runs rated by guess
- pass: reachable from the base: 30 of 30 run pieces
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
- pass: 0 runs climb more than 12 m
