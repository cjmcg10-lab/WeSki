# Saalbach Hinterglemm (saalbach)

Built 2026-11-23 by tools/pipeline.py. Terrain: cog.

**436 runs (100 named, 213.2 km), 82 lifts. 4 things to look at.**

- **LOOK**: 1 shown runs rated by guess  
  Übungslift Schischule
- **LOOK**: 2 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)  
  Schanteilift (base): no way back; Schanteilift (top): no way back (a one-way lift that carries skiers both ways: two_way_lifts; a lift top with no run down: links; a private or club lift: isolated_lifts with a note)
- **LOOK**: 2 new lifts to review (no listed run at the top, or no listed terrain at the bottom)  
  Magic 6er (Bergeralm) (26561945, chair, 1267 m): no run on the resort's list starts at its top; Schanteilift (440938271, surface, 459 m): no run on the resort's list starts at its top
- **LOOK**: 1 runs climb more than 12 m  
  F6 28 m
- info: 8 joins made automatically (look at the longest ones on the map)  
  Zum Stererhof bottom walk 235 m; None bottom ski 160 m; Eibingabfahrt bottom ski 118 m; None top ski 66 m; Skiroute 203a bottom walk 235 m; Abfahrt Viehhofen bottom ski 53 m; Skiroute Leogang bottom walk 185 m; Women DH Start ski 96 m
- info: 8 run pieces hidden (not on the resort's list and not a link)  
  (no name) (1033746498, 2818 m): OpenStreetMap: backcountry, no name (not a resort run); (no name) (845518420, 1255 m): OpenStreetMap: backcountry, no name (not a resort run); (no name) (325944113, 943 m): OpenStreetMap: backcountry, no name (not a resort run); (no name) (104394866, 905 m): OpenStreetMap: backcountry, no name (not a resort run); (no name) (104401160, 590 m): OpenStreetMap: backcountry, no name (not a resort run); (no name) (1137756677, 389 m): OpenStreetMap: backcountry, no name 
- info: 44 lifts flagged for review were already on the previous build (checked then)
- info: audit: dead end: 3, flat black: 6, no rating: 2, run climbs: 3, steep green: 9, stub: 1
- info: change from the previous build: runs 434 -> 436, lifts 81 -> 82, km 212.2 -> 213.2
- info: config has no osm_bbox: used the built map's extent (add osm_bbox to the config)
- info: the map reaches past the old build: terrain downloaded again for the larger extent
- info: build_canopy.py did not finish: build_canopy.py failed:
- pass: ratings checked against the resort's own list  
  0 on the list, 50 matched, 1 corrected from OpenStreetMap
- pass: lifts on the resort's list: 73 of 73 on the map
- pass: reachable from the base: 444 of 444 run pieces
