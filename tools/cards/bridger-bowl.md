# Bridger Bowl (bridger-bowl)

Built 2026-11-23 by tools/pipeline.py. Terrain: reused from the work folder.

**77 runs (59 named, 42.9 km), 12 lifts. 4 things to look at.**

- **LOOK**: ratings NOT checked: not ready to go live  
  make tools/official/<id>.json (a feed if there is one, else the trail map: see docs/ADDING_MOUNTAINS.md)
- **LOOK**: 1 shown runs rated by guess  
  (no name)
- **LOOK**: reachable from the base: 77 of 79 run pieces  
  not reachable: ['Apron', 'Bridger Gully']
- **LOOK**: 1 runs climb more than 12 m  
  Pierre's Return 20 m
- info: 9 joins made automatically (look at the longest ones on the map)  
  Fingers top walk 232 m; Southbound top ski 119 m; None bottom walk 70 m; Missouri Breaks top ski 40 m; Avalanche Gulch top ski 155 m; Slushman's Ravine walk 189 m; Emil's Mile ski 85 m; Alpine Return ski 355 m; Bridger Gully ski 123 m
- info: 2 run pieces hidden (not on the resort's list and not a link)  
  Pierre's Return (129611845, 2168 m): OpenStreetMap: private; (no name) (810030254, 145 m): OpenStreetMap: private
- info: audit: no rating: 2, run climbs: 1
- info: same counts as the previous build
- info: lifts fixed by rule (two-way gondola, or isolated: not joined to the rest): Schlasman's
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
