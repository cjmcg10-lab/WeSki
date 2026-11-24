# Sun Peaks (sun-peaks)

Built 2026-11-23 by tools/pipeline.py. Terrain: reused from the work folder.

**251 runs (174 named, 161.1 km), 13 lifts. 3 things to look at.**

- **LOOK**: ratings NOT checked: not ready to go live  
  make tools/official/<id>.json (a feed if there is one, else the trail map: see docs/ADDING_MOUNTAINS.md)
- **LOOK**: 2 shown runs rated by guess  
  (no name), Sunburst Connector to 5 Mile Road
- **LOOK**: 2 runs climb more than 12 m  
  Burfield Return 24 m; Home Run 17 m
- info: 9 joins made automatically (look at the longest ones on the map)  
  Skunk Glades top walk 159 m; Back in Time bottom ski 38 m; Fairways Ski Back bottom walk 89 m; Back in Time top ski 38 m; Mid-Mountain top walk 136 m; Sunburst Connector to 5 Mile Road bottom ski 54 m; Ski to Pinetree Chalet bottom walk 125 m; None bottom walk 169 m; Centre-East Village Path top ski 211 m
- info: audit: flat black: 2, no rating: 6, overlap: 1, run climbs: 4, run missing: 3, stub: 1
- info: same counts as the previous build
- info: lifts fixed by rule (two-way gondola, or isolated: not joined to the rest): Tube Time Lift
- pass: reachable from the base: 251 of 251 run pieces
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
