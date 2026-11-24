# Alpental (alpental)

Built 2026-11-24 by tools/pipeline.py. Terrain: USGS WA_KingCounty_2021_B21 (gaps filled from WA_CentralWildfire_D22, WA_EasternCascades_2019_B19, 10 m national elevation model (1/3 arc-second)).

**46 runs (40 named, 19.8 km), 6 lifts. 3 things to look at.**

- **LOOK**: ratings NOT checked: not ready to go live  
  make tools/official/<id>.json (a feed if there is one, else the trail map: see docs/ADDING_MOUNTAINS.md)
- **LOOK**: 3 shown runs rated by guess  
  Alpental Goat Trail, Crooked Couloir, Slot Couloir
- **LOOK**: reachable from the base: 42 of 46 run pieces  
  not reachable: ['Crooked Couloir', 'Slot Couloir', 'Snot Couloir', 'The Phantom']
- info: 11 joins made automatically (look at the longest ones on the map)  
  The Phantom bottom ski 172 m; Chicken Shot top walk 142 m; Pumpkin Patch top ski 75 m; Pumpkin Patch bottom ski 68 m; High Traverse bottom ski 38 m; Shot 5 top walk 98 m; Shot 4 top walk 150 m; Lower Return to Lifts top ski 240 m; Slot Couloir bottom walk 40 m; Snot Couloir bottom walk 42 m; Upper Snake Dance ski 6 m
- info: audit: no rating: 6, run climbs: 1, run missing: 9, stub: 1
- info: FOUND MORE: the resort reaches beyond its download box; the box was widened from [-121.4497, 47.4304, -121.4188, 47.4514] to [-121.4561, 47.4266, -121.4045, 47.4705]
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
- pass: 0 runs climb more than 12 m
