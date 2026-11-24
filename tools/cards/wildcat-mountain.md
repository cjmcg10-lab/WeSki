# Wildcat Mountain (wildcat-mountain)

Built 2026-11-24 by tools/pipeline.py. Terrain: reused from the work folder.

**53 runs (47 named, 25.7 km), 4 lifts. 2 things to look at.**

- **LOOK**: 4 runs on the resort's list are not on the map  
  Cat & Mouse, Copy Cat, Ocelot Way, Tomcat (draw them, or explain them in the official json: same_as / not_runs / elsewhere)
- **LOOK**: change from the previous build: runs 55 -> 53, named 48 -> 47, km 27.6 -> 25.7  
  fewer lifts or named runs than before: compare before pushing
- info: 1 joins made automatically (look at the longest ones on the map)  
  Cat-Walk ski 145 m
- info: 2 run pieces hidden (not on the resort's list and not a link)  
  Thompson Brook Trail (1504242101, 1659 m): hidden by hand: backcountry hiking path (OpenStreetMap highway=path, piste:grooming=backcountry), not on the resort's trail map; Thompson Brook Trail (1504242100, 698 m): hidden by hand: backcountry hiking path (OpenStreetMap highway=path, piste:grooming=backcountry), not on the resort's trail map
- info: audit: no rating: 2
- pass: ratings checked against the resort's own list  
  48 on the list, 66 matched, 0 corrected from OpenStreetMap
- pass: lifts on the resort's list: 5 of 5 on the map
- pass: 0 shown runs rated by guess
- pass: reachable from the base: 55 of 55 run pieces
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
- pass: 0 runs climb more than 12 m
