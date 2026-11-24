# Lake Louise (lake-louise)

Built 2026-11-23 by tools/pipeline.py. Terrain: reused from the work folder.

**178 runs (161 named, 104.1 km), 13 lifts. 3 things to look at.**

- **LOOK**: ratings NOT checked: not ready to go live  
  make tools/official/<id>.json (a feed if there is one, else the trail map: see docs/ADDING_MOUNTAINS.md)
- **LOOK**: 3 shown runs rated by guess  
  (no name)
- **LOOK**: 1 runs climb more than 12 m  
  Free Spirit 18 m
- info: 34 joins made automatically (look at the longest ones on the map)  
  Lower 5 top ski 40 m; Upper Kiddies' top ski 44 m; Upper Kiddies' bottom ski 75 m; Kiddies' Corner top ski 89 m; Split Rock top ski 77 m; Flight Chutes Cat Track bottom ski 58 m; C Gully bottom ski 68 m; B Gully bottom ski 68 m; A Gully bottom walk 74 m; D Gully bottom ski 68 m; Wounded Knee bottom ski 54 m; E Gully bottom ski 42 m; F Gully bottom ski 42 m; I Gully top ski 56 m; Upper Boomerang top walk 97 m; Brown Cow 1st top ski 67 m; Brown Cow 1st bottom ski 56 m; Brown Cow Main top ski 74 m; Brown Cow Main bottom ski 56 m; UNC top walk 79 m; Wild Gully bottom ski 48 m; Ghostly Gully bottom walk 57 m; Lake Pitch bottom walk 119 m; Boundary Bowl top ski 78 m; Brown Cow Main walk 186 m; UNC
- info: audit: lift missing: 1, no rating: 3, run climbs: 1
- info: same counts as the previous build
- info: resort feed mtnpowder 74 gave no trail list: KeyError: 'MountainAreas'
- pass: reachable from the base: 178 of 178 run pieces
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
