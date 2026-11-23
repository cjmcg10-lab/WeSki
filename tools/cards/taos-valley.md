# Taos Ski Valley (taos-valley)

Built 2026-11-23 by tools/pipeline.py. Terrain: reused from the work folder.

**176 runs (111 named, 60.4 km), 14 lifts. 3 things to look at.**

- **LOOK**: ratings NOT checked: not ready to go live  
  make tools/official/<id>.json (a feed if there is one, else the trail map: see docs/ADDING_MOUNTAINS.md)
- **LOOK**: 9 shown runs rated by guess  
  (no name), Cabin Trees, Ruby Gully
- **LOOK**: 2 runs climb more than 12 m  
  Highline Ridge 34 m; West Basin Ridge 17 m
- info: 17 joins made automatically (look at the longest ones on the map)  
  Hidalgo top ski 45 m; Juarez top ski 94 m; North Face top walk 62 m; Psycho Path top ski 91 m; None bottom ski 55 m; None bottom walk 137 m; Powderhorn Gully bottom ski 50 m; None bottom walk 50 m; Lower Inferno bottom ski 84 m; Raspberry Hill top ski 57 m; Bambi Glade top ski 44 m; Bambi Glade bottom ski 44 m; Lower Inferno bottom walk 75 m; unnamed#77 ski 90 m; Lower Inferno ski 259 m; unnamed#75 ski 254 m; Tell Trees ski 50 m
- info: audit: no rating: 12, run climbs: 3
- info: same counts as the previous build
- info: resort feed mtnpowder 78 gave no trail list: KeyError: 'MountainAreas'
- info: lifts fixed by rule (two-way gondola, or isolated: not joined to the rest): Kachina Peak Lift, Lift 2, Lift 4, Lift 7, Lift 7A, Lift 8
- pass: reachable from the base: 176 of 176 run pieces
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
