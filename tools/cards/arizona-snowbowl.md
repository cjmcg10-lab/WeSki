# Arizona Snowbowl (arizona-snowbowl)

Built 2026-11-24 by tools/pipeline.py. Terrain: USGS AZ_CentralCoconino_B22 (gaps filled from AZ_Coconino_2019_B19, AZ VerdeKaibab B1 2018, AZ VerdeKaibab B2 2018, 10 m national elevation model (1/3 arc-second)).

**56 runs (51 named, 23.1 km), 8 lifts. 2 things to look at.**

- **LOOK**: ratings NOT checked: not ready to go live  
  make tools/official/<id>.json (a feed if there is one, else the trail map: see docs/ADDING_MOUNTAINS.md)
- **LOOK**: reachable from the base: 55 of 56 run pieces  
  not reachable: ['Rustler']
- info: 5 joins made automatically (look at the longest ones on the map)  
  Chipmunk Chase top ski 87 m; Big Bowl top walk 248 m; Upper Sundance top ski 88 m; Ship Rocks top ski 89 m; Ship Rocks ski 354 m
- info: the resort's outline relation/3187211 has no name or is not in the download: the build starts from the resort's lifts instead (include_ways)
- info: FOUND MORE: the resort reaches beyond its download box; the box was widened from [-111.7168, 35.3234, -111.6823, 35.3368] to [-111.7225, 35.3184, -111.6713, 35.3429]
- pass: 0 shown runs rated by guess
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
- pass: 0 runs climb more than 12 m
- pass: audit: nothing flagged
