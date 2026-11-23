# Eldora (eldora)

Built 2026-11-23 by tools/pipeline.py. Terrain: reused from the work folder.

**73 runs (62 named, 35.3 km), 10 lifts. 1 things to look at.**

- **LOOK**: ratings NOT checked: not ready to go live  
  make tools/official/<id>.json (a feed if there is one, else the trail map: see docs/ADDING_MOUNTAINS.md)
- info: 1 joins made automatically (look at the longest ones on the map)  
  Sunset ski 51 m
- info: same counts as the previous build
- info: resort feed mtnpowder 56 gave no trail list: KeyError: 'MountainAreas'
- pass: 0 shown runs rated by guess
- pass: reachable from the base: 73 of 73 run pieces
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
- pass: 0 runs climb more than 12 m
- pass: audit: nothing flagged
