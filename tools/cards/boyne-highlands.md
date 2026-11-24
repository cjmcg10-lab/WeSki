# The Highlands (boyne-highlands)

Built 2026-11-24 by tools/pipeline.py. Terrain: USGS MI_13County_2015_C16 (gaps filled from 10 m national elevation model (1/3 arc-second)).

**55 runs (54 named, 23.4 km), 7 lifts. 2 things to look at.**

- **LOOK**: ratings NOT checked: not ready to go live  
  make tools/official/<id>.json (a feed if there is one, else the trail map: see docs/ADDING_MOUNTAINS.md)
- **LOOK**: 1 shown runs rated by guess  
  Amy's Terrain Park
- info: 5 joins made automatically (look at the longest ones on the map)  
  North Camelot top ski 45 m; Couloir bottom ski 63 m; Steins Chute Glade bottom ski 39 m; The Sound of Skiing ski 62 m; North Challenger ski 3 m
- info: audit: flat black: 1, no rating: 1
- pass: reachable from the base: 55 of 55 run pieces
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
- pass: 0 runs climb more than 12 m
