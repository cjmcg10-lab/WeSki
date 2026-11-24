# Roundtop Mountain (roundtop-mountain)

Built 2026-11-24 by tools/pipeline.py. Terrain: USGS PA_17County_D24 (gaps filled from PA Sandy 2014, PA South Central B1 2017, 10 m national elevation model (1/3 arc-second)).

**32 runs (21 named, 7.8 km), 9 lifts. 1 things to look at.**

- **LOOK**: ratings NOT checked: not ready to go live  
  make tools/official/<id>.json (a feed if there is one, else the trail map: see docs/ADDING_MOUNTAINS.md)
- info: audit: no rating: 5, run missing: 1
- info: lifts fixed by rule (two-way gondola, or isolated: not joined to the rest): Snow Tubing Lift
- pass: 0 shown runs rated by guess
- pass: reachable from the base: 32 of 32 run pieces
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
- pass: 0 runs climb more than 12 m
