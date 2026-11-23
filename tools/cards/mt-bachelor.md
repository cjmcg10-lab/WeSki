# Mt. Bachelor (mt-bachelor)

Built 2026-11-23 by tools/pipeline.py. Terrain: reused from the work folder.

**135 runs (106 named, 101.6 km), 15 lifts. 4 things to look at.**

- **LOOK**: ratings NOT checked: not ready to go live  
  make tools/official/<id>.json (a feed if there is one, else the trail map: see docs/ADDING_MOUNTAINS.md)
- **LOOK**: 1 shown runs rated by guess  
  The Moraine
- **LOOK**: reachable from the base: 128 of 135 run pieces  
  not reachable: ['East Catchline', 'Hourglass', 'Sunrise Getback', 'The Low East', 'West Catchline', 'West Ridge']
- **LOOK**: 3 runs climb more than 12 m  
  Sunrise Getback 44 m; East Catchline 14 m; East Bowls 13 m
- info: 24 joins made automatically (look at the longest ones on the map)  
  Northwest Crossover bottom ski 47 m; West Bowls top ski 312 m; West Bowls bottom ski 446 m; Back Bowls top ski 244 m; West Ridge bottom ski 288 m; Modo top ski 62 m; None top ski 89 m; Seaside bottom ski 114 m; Pinnacles walk 229 m; Cows Face ski 129 m; Cirque Bowl ski 201 m; West Bowls ski 361 m; Serengeti Plains ski 241 m; East Bowls ski 171 m; Northwest Crossover ski 14 m; The Moraine ski 183 m; unnamed#52 ski 7 m; Skyliner Liftline ski 14 m; I-5 ski 16 m; Alpenglow ski 19 m; Marshmallow ski 22 m; Red Lift Line ski 89 m; Cirque Bowl ski 124 m; Cows Face ski 57 m
- info: audit: flat black: 2, no rating: 1, run climbs: 3
- info: same counts as the previous build
- info: lifts fixed by rule (two-way gondola, or isolated: not joined to the rest): Lava Tube Carpet
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
