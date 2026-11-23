# Mount Ashland (mount-ashland)

Built 2026-11-23 by tools/pipeline.py. Terrain: reused from the work folder.

**55 runs (52 named, 19.9 km), 6 lifts. 2 things to look at.**

- **LOOK**: ratings NOT checked: not ready to go live  
  make tools/official/<id>.json (a feed if there is one, else the trail map: see docs/ADDING_MOUNTAINS.md)
- **LOOK**: 11 shown runs rated by guess  
  Birnam Wood, Brutus, Caliban Crossover, Dream Traverse, Lower Boundary Line, Moraine Glade, Second Bowl, Titus, Upper Boundary Line, Wormhole
- info: audit: no rating: 12
- info: same counts as the previous build
- info: the resort's outline relation/4764744 has no name or is not in the download: the build starts from the resort's lifts instead (include_ways)
- pass: reachable from the base: 55 of 55 run pieces
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
- pass: 0 runs climb more than 12 m
