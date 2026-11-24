# Whitetail (whitetail)

Built 2026-11-24 by tools/pipeline.py. Terrain: USGS PA_17County_D24 (gaps filled from MD_Western_2021_D21, PA_Northcentral_2019_B19, PA South Central B1 2017, 10 m national elevation model (1/3 arc-second)).

**22 runs (22 named, 10.9 km), 8 lifts. 1 things to look at.**

- **LOOK**: ratings NOT checked: not ready to go live  
  make tools/official/<id>.json (a feed if there is one, else the trail map: see docs/ADDING_MOUNTAINS.md)
- info: the resort's outline relation/13532756 has no name or is not in the download: the build starts from the resort's lifts instead (include_ways)
- info: lifts fixed by rule (two-way gondola, or isolated: not joined to the rest): Magic carpet
- pass: 0 shown runs rated by guess
- pass: reachable from the base: 22 of 22 run pieces
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
- pass: 0 runs climb more than 12 m
- pass: audit: nothing flagged
