# Taos Ski Valley (taos-valley)

Built 2026-11-23 by tools/pipeline.py. Terrain: reused from the work folder.

**170 runs (111 named, 59.9 km), 14 lifts. 3 things to look at.**

- **LOOK**: 13 runs on the resort's list are not on the map  
  Edelweiss, Edelweiss Glade, Ernie's Run, High Five, Jess's, Pollux, Rhoda's, Showdown, Sir Arnold Lunn, Snakedance, Spencer's, Wayne Abbey, Winston (draw them, or explain them in the official json: same_as / not_runs / elsewhere)
- **LOOK**: 8 shown runs rated by guess  
  (no name), Cabin Trees
- **LOOK**: 2 runs climb more than 12 m  
  Highline Ridge 34 m; West Basin Ridge 17 m
- info: 17 joins made automatically (look at the longest ones on the map)  
  Hidalgo top ski 45 m; Juarez top ski 94 m; North Face top walk 62 m; Psycho Path top ski 91 m; None bottom ski 55 m; None bottom walk 137 m; Powderhorn Gully bottom ski 50 m; None bottom walk 50 m; Lower Inferno bottom ski 84 m; Raspberry Hill top ski 57 m; Bambi Glade top ski 44 m; Bambi Glade bottom ski 44 m; Lower Inferno bottom walk 75 m; unnamed#76 ski 90 m; Lower Inferno ski 259 m; unnamed#74 ski 254 m; Tell Trees ski 50 m
- info: 3 run pieces hidden (not on the resort's list and not a link)  
  (no name) (580637618, 261 m): unnamed piece, not on the resort's list, leads nowhere on it; (no name) (1013176900, 90 m): unnamed piece, not on the resort's list, leads nowhere on it; (no name) (1318547840, 48 m): unnamed piece, not on the resort's list, leads nowhere on it
- info: 1 lifts flagged for review were already on the previous build (checked then)
- info: audit: no rating: 12, run climbs: 3
- info: same counts as the previous build
- pass: ratings checked against the resort's own list  
  109 on the list, 148 matched, 0 corrected from OpenStreetMap
- pass: lifts on the resort's list: 12 of 12 on the map
- pass: reachable from the base: 173 of 173 run pieces
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
