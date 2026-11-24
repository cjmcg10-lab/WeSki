# Yellowstone Club (yellowstone-club)

Built 2026-11-23 by tools/pipeline.py. Terrain: reused from the work folder.

**120 runs (94 named, 107.3 km), 21 lifts. 2 things to look at.**

- **LOOK**: ratings NOT checked: not ready to go live  
  make tools/official/<id>.json (a feed if there is one, else the trail map: see docs/ADDING_MOUNTAINS.md)
- **LOOK**: 3 runs climb more than 12 m  
  Namaste 23 m; In the Rough 25 m; Hell-Jam 14 m
- info: 9 joins made automatically (look at the longest ones on the map)  
  Marty's Party top ski 84 m; None top walk 101 m; None bottom ski 86 m; Mockingbird top ski 116 m; Apron top walk 163 m; Return to Yellowstone Club top walk 190 m; Big Sky Entrance bottom ski 119 m; Alpine Greens walk 84 m; Bluebird ski 253 m
- info: audit: run climbs: 3
- info: same counts as the previous build
- info: the resort's outline relation/18653810 has no name or is not in the download: the build starts from the resort's lifts instead (include_ways)
- info: lifts fixed by rule (two-way gondola, or isolated: not joined to the rest): Alpine Greens, Cow Flats, Eglise Gondola Stage 1, Eglise Gondola Stage 2, Fandango, Great Bear, Len's Hill, Little Dipper Triple, Silver Tip - High SPeed
- pass: 0 shown runs rated by guess
- pass: reachable from the base: 120 of 120 run pieces
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
