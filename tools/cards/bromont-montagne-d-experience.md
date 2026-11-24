# Bromont Montagne d'Expérience (bromont-montagne-d-experience)

Built 2026-11-23 by tools/pipeline.py. Terrain: reused from the work folder.

**114 runs (107 named, 48.4 km), 11 lifts. 2 things to look at.**

- **LOOK**: 20 runs on the resort's list are not on the map  
  Calgary, Cleveland, Connex Prk, Cornwall, Delray, Evo Prk, Fort Lauderdale, Fulford, Hero Prk, Ini Prk, Knowlford, Miami, Mystic, Napa, Oakland, Plattsburgh, SBX Prk, Santa Monica, Sonoma, Vallée des Bonbons (draw them, or explain them in the official json: same_as / not_runs / elsewhere)
- **LOOK**: change from the previous build: runs 117 -> 114, named 110 -> 107, km 49.0 -> 48.4  
  fewer lifts or named runs than before: compare before pushing
- info: 9 joins made automatically (look at the longest ones on the map)  
  Regina bottom ski 60 m; Vancouver bottom ski 104 m; Pompano top ski 55 m; Daytona top ski 55 m; Kananaskis bottom ski 46 m; Keys bottom ski 45 m; Daytona ski 137 m; Forêt des Cantons ski 122 m; Kingston ski 65 m
- info: 3 run pieces hidden (not on the resort's list and not a link)  
  Monterey (fermé) (1026532707, 239 m): hidden by hand: marked closed (fermé) in OpenStreetMap and not on the resort's 2025 trail list; Sarnia (fermé) (1367116535, 144 m): hidden by hand: marked closed (fermé) in OpenStreetMap and not on the resort's 2025 trail list; Gilroy (fermé) (1026532706, 137 m): hidden by hand: marked closed (fermé) in OpenStreetMap and not on the resort's 2025 trail list
- pass: ratings checked against the resort's own list  
  124 on the list, 137 matched, 0 corrected from OpenStreetMap
- pass: lifts on the resort's list: 11 of 11 on the map
- pass: 0 shown runs rated by guess
- pass: reachable from the base: 117 of 117 run pieces
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
- pass: 0 runs climb more than 12 m
- pass: audit: nothing flagged
