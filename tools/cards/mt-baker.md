# Mt. Baker (mt-baker)

Built 2026-11-24 by tools/pipeline.py. Terrain: reused from the work folder.

**60 runs (36 named, 27.5 km), 10 lifts. 2 things to look at.**

- **LOOK**: 8 runs on the resort's list are not on the map  
  7/8 Road, 8 to 5, Bobcat, Chair 2 Access, Holiday, Hoofers, Little Red Riding Hood, Roly Poly (draw them, or explain them in the official json: same_as / not_runs / elsewhere)
- **LOOK**: change from the previous build: runs 61 -> 60, named 37 -> 36, km 28.2 -> 27.5  
  fewer lifts or named runs than before: compare before pushing
- info: 1 joins made automatically (look at the longest ones on the map)  
  Expresso ski 32 m
- info: 8 run pieces hidden (not on the resort's list and not a link)  
  (no name) (386884581, 1296 m): OpenStreetMap: backcountry, no name (not a resort run); Chair #5 Chutes and Cliffs (386884327, 650 m): hidden by hand: OpenStreetMap line through the area the 2026-27 trail map marks 'Extreme danger zone / danger cliffs' beside Chair 5; not a run on the resort's map; (no name) (386884403, 487 m): OpenStreetMap: backcountry, no name (not a resort run); (no name) (386882330, 463 m): OpenStreetMap: backcountry, no name (not a resort run); (no name) (386884486, 418 m):
- pass: ratings checked against the resort's own list  
  46 on the list, 51 matched, 0 corrected from OpenStreetMap
- pass: lifts on the resort's list: 8 of 8 on the map
- pass: 0 shown runs rated by guess
- pass: reachable from the base: 68 of 68 run pieces
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
- pass: 0 runs climb more than 12 m
- pass: audit: nothing flagged
