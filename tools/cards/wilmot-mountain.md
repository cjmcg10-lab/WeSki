# Wilmot Mountain (wilmot-mountain)

Built 2026-11-24 by tools/pipeline.py. Terrain: USGS IL_4_County_QL1_LiDAR_2016_B16 (gaps filled from WI_Kenosha_Racine_Counties_SEWI_Lidar_2017_B17, IL McHenryCo 2008, WI SEWRPC 2017, 10 m national elevation model (1/3 arc-second)).

**23 runs (22 named, 5.2 km), 13 lifts. 2 things to look at.**

- **LOOK**: ratings NOT checked: not ready to go live  
  make tools/official/<id>.json (a feed if there is one, else the trail map: see docs/ADDING_MOUNTAINS.md)
- **LOOK**: 2 shown runs rated by guess  
  The Gully, The Rope
- info: audit: no rating: 2
- info: lifts fixed by rule (two-way gondola, or isolated: not joined to the rest): Magic carpet
- pass: reachable from the base: 23 of 23 run pieces
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
- pass: 0 runs climb more than 12 m
