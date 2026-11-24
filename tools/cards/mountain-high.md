# Mountain High (mountain-high)

Built 2026-11-24 by tools/pipeline.py. Terrain: USGS CA_LosAngeles_B23 (gaps filled from CA LosAngeles 2016, CA SoCal Wildfires B2 2018, 10 m national elevation model (1/3 arc-second)).

**43 runs (37 named, 18.5 km), 12 lifts. 2 things to look at.**

- **LOOK**: ratings NOT checked: not ready to go live  
  make tools/official/<id>.json (a feed if there is one, else the trail map: see docs/ADDING_MOUNTAINS.md)
- **LOOK**: reachable from the base: 27 of 43 run pieces  
  not reachable: ['Boardwalk', 'Cascade', 'Catalina', 'First Tracks', 'Goldrush', 'Olympic Bowl', 'Round-A-Bout', 'Sundance', 'Sunset', 'Wildcard', 'unnamed#29', 'unnamed#30', 'unnamed#31', 'unnamed#32', 'unnamed#39', 'unnamed#40']
- info: 3 joins made automatically (look at the longest ones on the map)  
  First Tracks top ski 140 m; First Tracks bottom walk 187 m; Cascade walk 128 m
- info: audit: lift missing: 3
- info: the resort's outline relation/3185646 has no name or is not in the download: the build starts from the resort's lifts instead (include_ways)
- info: lifts fixed by rule (two-way gondola, or isolated: not joined to the rest): Discovery, Magic carpet, Mtn High Express
- pass: 0 shown runs rated by guess
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
- pass: 0 runs climb more than 12 m
