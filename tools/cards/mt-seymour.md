# Mt Seymour (mt-seymour)

Built 2026-11-23 by tools/pipeline.py. Terrain: reused from the work folder.

**66 runs (44 named, 17.1 km), 5 lifts. 2 things to look at.**

- **LOOK**: ratings NOT checked: not ready to go live  
  make tools/official/<id>.json (a feed if there is one, else the trail map: see docs/ADDING_MOUNTAINS.md)
- **LOOK**: 3 shown runs rated by guess  
  Mystery Glades, Uncle Al's Glades, Unicorn Glades
- info: 3 joins made automatically (look at the longest ones on the map)  
  None top ski 56 m; Mushroom bottom ski 39 m; Pete's Glades ski 96 m
- info: audit: lift missing: 1, no rating: 8
- info: same counts as the previous build
- info: lifts fixed by rule (two-way gondola, or isolated: not joined to the rest): Enquist Tube Park Lift
- pass: reachable from the base: 66 of 66 run pieces
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
- pass: 0 runs climb more than 12 m
