# Aspen Snowmass (aspen-snowmass)

Built 2026-11-23 by tools/pipeline.py. Terrain: reused from the work folder.

**146 runs (130 named, 143.7 km), 18 lifts. 2 things to look at.**

- **LOOK**: ratings NOT checked: not ready to go live  
  make tools/official/<id>.json (a feed if there is one, else the trail map: see docs/ADDING_MOUNTAINS.md)
- **LOOK**: 1 runs climb more than 12 m  
  Trestle 17 m
- info: 7 joins made automatically (look at the longest ones on the map)  
  Gowdy's top ski 74 m; Ptarmigan top ski 184 m; AMF top ski 154 m; Little Headwall top ski 170 m; Blue Grouse bottom ski 81 m; Cabin bottom ski 59 m; Split Tree walk 239 m
- info: audit: flat black: 1, run climbs: 1
- info: same counts as the previous build
- info: resort feed mtnpowder 51 gave no trail list: KeyError: 'MountainAreas'
- info: lifts fixed by rule (two-way gondola, or isolated: not joined to the rest): Pines Lower, Pines Upper
- pass: 0 shown runs rated by guess
- pass: reachable from the base: 146 of 146 run pieces
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
