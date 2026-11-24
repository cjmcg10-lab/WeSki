# Stoneham (touristique-stoneham)

Built 2026-11-24 by tools/pipeline.py. Terrain: not rebuilt (--checks-only).

**63 runs (42 named, 31.6 km), 6 lifts. 2 things to look at.**

- **LOOK**: 1 runs on the resort's list are not on the map  
  La Pic-Bois (draw them, or explain them in the official json: same_as / not_runs / elsewhere)
- **LOOK**: lifts on the resort's list: 4 of 6 on the map  
  MISSING: La Montée Magique, Le Mille-Pattes. A missing chair or gondola usually means a missing area: find it before going live (not in OpenStreetMap: extra_lifts; removed by the resort: explain it in the official json under lifts_explained)
- info: same counts as the previous build
- pass: ratings checked against the resort's own list  
  42 on the list, 75 matched, 0 corrected from OpenStreetMap
- pass: 0 shown runs rated by guess
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
- pass: 0 runs climb more than 12 m
- pass: audit: nothing flagged
