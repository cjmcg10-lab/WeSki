# Zermatt – Cervinia (zermatt)

Built 2026-11-23 by tools/pipeline.py. Terrain: reused from the work folder.

**352 runs (149 named, 230.5 km), 66 lifts. 5 things to look at.**

- **LOOK**: 4 runs on the resort's list are not on the map  
  Mittelritz, Paradise, Platte, Pre de Veau-Pirovano (draw them, or explain them in the official json: same_as / not_runs / elsewhere)
- **LOOK**: no lift list from the resort: put the trail map's lift names in the official json as "lifts"  
  without it a missing chair or area cannot be noticed (map_read.py notes: lines "Lift: <name>")
- **LOOK**: reachable from the base: 356 of 360 run pieces  
  not reachable: ['unnamed#104', 'unnamed#130', 'unnamed#191', 'unnamed#52']
- **LOOK**: 130 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)  
  Salette (base): no way back; Salette (top): no way back; Motta (base): no way back; Motta (top): no way back; Bec Carré (base): no way back; Bec Carré (top): no way back; Baby Salette (base): no way back; Baby Salette (top): no way back; Becca d'Aran (base): no way back; Becca d'Aran (top): no way back; Snowpark (base): no way back; Snowpark (top): no way back; Tappeto (base): no way back; Tappeto (top): no way back; Magic carpet (base): no way back; Magic carpet (top): no way back; Plan Maison  (a one-way lift that carries skiers both ways: two_way_lifts; a lift top with no run down: links; a private or club lift: isolated_lifts with a note)
- **LOOK**: 7 runs climb more than 12 m  
  Raccordo Cieloalto-Bardoney 13 m; Trecar 13 m; Ventina Ghiacciaio 18 m; Stafelalp 12 m; Moos 19 m; Balmbrunnen 18 m; Chamois 17 m
- info: 13 joins made automatically (look at the longest ones on the map)  
  Pirovano - Cervinia bottom ski 152 m; None top ski 180 m; Cieloalto-Cervinia top ski 71 m; None top walk 156 m; None bottom ski 179 m; Kuhbodmen bottom ski 98 m; Balmbrunnen top ski 45 m; Landtunnel bottom ski 52 m; Schweigmatten bottom ski 142 m; White Hare top ski 181 m; Gornergrat ski 6 m; unnamed#205 ski 47 m; unnamed#285 ski 8 m
- info: 8 run pieces hidden (not on the resort's list and not a link)  
  (no name) (1461646631, 209 m): OpenStreetMap: backcountry, no name (not a resort run); (no name) (1551200375, 197 m): OpenStreetMap: backcountry, no name (not a resort run); (no name) (905018122, 71 m): unnamed piece, not on the resort's list, leads nowhere on it; (no name) (903540910, 64 m): unnamed piece, not on the resort's list, leads nowhere on it; (no name) (23398081, 63 m): unnamed piece, not on the resort's list, leads nowhere on it; (no name) (905048252, 59 m): unnamed piece, not on the
- info: 8 lifts flagged for review were already on the previous build (checked then)
- info: audit: flat black: 2, lift missing: 3, run climbs: 11, stub: 1
- info: same counts as the previous build
- info: build_canopy.py did not finish: build_canopy.py failed:
- pass: ratings checked against the resort's own list  
  127 on the list, 185 matched, 0 corrected from OpenStreetMap
- pass: 0 shown runs rated by guess
