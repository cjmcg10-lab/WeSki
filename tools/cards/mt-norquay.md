# Mt Norquay (mt-norquay)

Built 2026-11-23 by tools/pipeline.py. Terrain: reused from the work folder.

**88 runs (74 named, 30.2 km), 7 lifts. 3 things to look at.**

- **LOOK**: ratings NOT checked: not ready to go live  
  make tools/official/<id>.json (a feed if there is one, else the trail map: see docs/ADDING_MOUNTAINS.md)
- **LOOK**: 1 shown runs rated by guess  
  (no name)
- **LOOK**: 1 runs climb more than 12 m  
  Stoney Trail 12 m
- info: 2 joins made automatically (look at the longest ones on the map)  
  Sunny Side top walk 85 m; Take a Hike walk 241 m
- info: audit: no rating: 1, run climbs: 1
- info: same counts as the previous build
- info: resort feed mtnpowder 75 gave no trail list: KeyError: 'MountainAreas'
- info: lifts fixed by rule (two-way gondola, or isolated: not joined to the rest): Tubing Carpet
- pass: reachable from the base: 88 of 88 run pieces
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
