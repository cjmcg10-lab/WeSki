# Sommet Saint-Sauveur (sommet-saint-sauveur)

Built 2026-11-23 by tools/pipeline.py. Terrain: reused from the work folder.

**55 runs (39 named, 25.7 km), 17 lifts. 2 things to look at.**

- **LOOK**: ratings NOT checked: not ready to go live  
  make tools/official/<id>.json (a feed if there is one, else the trail map: see docs/ADDING_MOUNTAINS.md)
- **LOOK**: 1 shown runs rated by guess  
  (no name)
- info: 1 joins made automatically (look at the longest ones on the map)  
  Côte 69 bottom ski 76 m
- info: audit: no rating: 1
- info: same counts as the previous build
- info: the resort's outline relation/5365963 has no name or is not in the download: the build starts from the resort's lifts instead (include_ways)
- info: lifts fixed by rule (two-way gondola, or isolated: not joined to the rest): Surface lift, Tapis roulant versant Bobsleigh + Vortex360, Tapis roulant versant Tube, Télérafting, Télésiège
- pass: reachable from the base: 55 of 55 run pieces
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
- pass: 0 runs climb more than 12 m
