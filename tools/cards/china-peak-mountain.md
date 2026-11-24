# China Peak Mountain (china-peak-mountain)

Built 2026-11-23 by tools/pipeline.py. Terrain: reused from the work folder.

**88 runs (44 named, 35.2 km), 11 lifts. 1 things to look at.**

- **LOOK**: change from the previous build: runs 92 -> 88, named 45 -> 44, km 35.8 -> 35.2  
  fewer lifts or named runs than before: compare before pushing
- info: 1 joins made automatically (look at the longest ones on the map)  
  Westridge ski 45 m
- info: 1 run pieces hidden (not on the resort's list and not a link)  
  Waterfall Bowl (1223615403, 265 m): hidden by hand: the bowl Waterfall runs through: OpenStreetMap draws it on the same ground as Waterfall, and the trail map names the area only
- info: the resort's outline relation/15717134 has no name or is not in the download: the build starts from the resort's lifts instead (include_ways)
- pass: ratings checked against the resort's own list  
  37 on the list, 52 matched, 0 corrected from OpenStreetMap
- pass: lifts on the resort's list: 6 of 6 on the map
- pass: 0 shown runs rated by guess
- pass: reachable from the base: 89 of 89 run pieces
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
- pass: 0 runs climb more than 12 m
- pass: audit: nothing flagged
