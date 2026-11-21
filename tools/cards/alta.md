# Alta (alta)

Built 2026-11-21 by tools/pipeline.py. Terrain: USGS NV_USFSR4_D23 (gaps filled from UT_FEMAHQ_2018_D18, UT_StatewideNCentral_2020_A20, UT Central QL1 B1 2018, 10 m national elevation model (1/3 arc-second)).

**160 runs (141 named, 88.6 km), 11 lifts. 3 things to look at.**

- **LOOK**: 11 runs on the resort's list are not on the map  
  180 Bend, Baldy Shoulder, Christmas Tree, EBT to Collins, Fred's Slot, High Race Course, High Sunspot, Nina's, Patsey Marley, Piney Glade, West Rustler (draw them, or explain them in the official json: same_as / not_runs / elsewhere)
- **LOOK**: 7 shown runs rated by guess  
  (no name)
- **LOOK**: 2 runs climb more than 12 m  
  Baldy Chutes 77 m; High Greeley 27 m
- info: 28 joins made automatically (look at the longest ones on the map)  
  Mid-Baldy Traverse top ski 101 m; Venus Line bottom ski 58 m; Middle Chip's Run top ski 58 m; Who Dunnit top ski 50 m; Who Dunnit bottom walk 109 m; The Back Door bottom ski 55 m; Bird's Nest top ski 51 m; Bird's Nest bottom walk 128 m; High Ridge 3 bottom ski 101 m; High Baldy Traverse top walk 72 m; East Castle top walk 433 m; Castle Apron top walk 296 m; Castle Apron bottom ski 234 m; Devil's Castle top walk 300 m; Cecret Chutes top ski 128 m; Chamonix Chutes top walk 73 m; Chamonix Chutes bottom ski 176 m; Main Chute top ski 57 m; Little Chute top walk 57 m; Eddie's High Nowhere top walk 45 m; Crooked Mile bottom walk 100 m; Livin' the Dream walk 239 m; Little Chute ski 104 m; Main Chute
- info: 1 run pieces hidden (not on the resort's list and not a link)  
  (no name) (1335849267, 58 m): unnamed piece, not on the resort's list, leads nowhere on it
- info: 1 lifts flagged for review were already on the previous build (checked then)
- info: audit: flat black: 3, no rating: 9, run climbs: 4
- info: change from the previous build: runs 153 -> 160, named 134 -> 141, km 84.2 -> 88.6
- info: FOUND MORE: the resort reaches beyond its download box; the box was widened from [-111.6624, 40.5568, -111.5866, 40.6096] to [-111.6624, 40.5498, -111.5866, 40.6096]
- pass: ratings checked against the resort's own list  
  108 on the list, 163 matched, 0 corrected from OpenStreetMap
- pass: lifts on the resort's list: 11 of 11 on the map
- pass: reachable from the base: 161 of 161 run pieces
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
