# Cypress Mountain (cypress-mountain)

Built 2026-11-23 by tools/pipeline.py. Terrain: reused from the work folder.

**103 runs (63 named, 31.3 km), 7 lifts. 2 things to look at.**

- **LOOK**: ratings NOT checked: not ready to go live  
  make tools/official/<id>.json (a feed if there is one, else the trail map: see docs/ADDING_MOUNTAINS.md)
- **LOOK**: 1 shown runs rated by guess  
  (no name)
- info: 2 joins made automatically (look at the longest ones on the map)  
  Sunshine Face Glades top ski 39 m; Sunshine Face Glades bottom ski 55 m
- info: audit: no rating: 10
- info: same counts as the previous build
- pass: reachable from the base: 103 of 103 run pieces
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
- pass: 0 runs climb more than 12 m
