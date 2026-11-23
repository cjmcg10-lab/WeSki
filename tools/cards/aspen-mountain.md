# Aspen Mountain (aspen-mountain)

Built 2026-11-23 by tools/pipeline.py. Terrain: reused from the work folder.

**174 runs (144 named, 71.6 km), 6 lifts. 3 things to look at.**

- **LOOK**: ratings NOT checked: not ready to go live  
  make tools/official/<id>.json (a feed if there is one, else the trail map: see docs/ADDING_MOUNTAINS.md)
- **LOOK**: 1 shown runs rated by guess  
  America's Downhill
- **LOOK**: 1 runs climb more than 12 m  
  Lud's Lane 14 m
- info: 16 joins made automatically (look at the longest ones on the map)  
  Schuss Gully bottom ski 55 m; Franklin Dump bottom ski 40 m; Silver Rush top ski 64 m; Bonnie Bell top ski 73 m; Niagara bottom ski 74 m; Legel Tender bottom ski 58 m; Here's Too... bottom ski 59 m; Lens Cap top ski 47 m; Copper Connector top ski 55 m; Bingo Glades bottom walk 75 m; Buckhorn ski 5 m; Sunrise/Sunset ski 66 m; Face of Bell ski 45 m; Face of Bell ski 41 m; Powerline II ski 110 m; Rewrite ski 55 m
- info: audit: no rating: 1, run climbs: 1, run missing: 1
- info: same counts as the previous build
- info: resort feed mtnpowder 52 gave no trail list: KeyError: 'MountainAreas'
- pass: reachable from the base: 174 of 174 run pieces
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
