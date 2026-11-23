# Aspen Highlands (aspen-highlands)

Built 2026-11-23 by tools/pipeline.py. Terrain: reused from the work folder.

**129 runs (111 named, 68.7 km), 6 lifts. 2 things to look at.**

- **LOOK**: ratings NOT checked: not ready to go live  
  make tools/official/<id>.json (a feed if there is one, else the trail map: see docs/ADDING_MOUNTAINS.md)
- **LOOK**: reachable from the base: 105 of 129 run pieces  
  not reachable: ['B-Fore', 'Ballroom', 'Be-One', 'Boxcar', 'Canopy Cruiser', "Flip's Leap", 'Full Curl', 'G-0', 'G-1', 'G-2', 'G-3', 'G-4', 'G-6', 'G-8', "Grahamster's", 'Hines-Sight', 'Hyde Park', 'Mosh Pit', 'Ozone', "Steep 'N Deep", "Whip's Veneration", 'White Kitchen', 'Y-12']
- info: 21 joins made automatically (look at the longest ones on the map)  
  Be-One top ski 66 m; White Kitchen top walk 77 m; Steep 'N Deep top ski 54 m; B-Fore top ski 38 m; Grahamster's top ski 39 m; Boxcar top ski 60 m; Mosh Pit top ski 62 m; Ballroom top ski 67 m; Flip's Leap top ski 66 m; Mushroom top walk 93 m; Lucky Find top walk 51 m; Lucky Find top ski 103 m; Red Onion bottom ski 40 m; Powder Bowl bottom ski 82 m; Limelight bottom ski 45 m; Lower Stein bottom ski 41 m; Lower Golden Horn #2 top ski 56 m; Lucky Find ski 305 m; Lucky Find ski 129 m; Hot Y's (Y-3 to Y-8) ski 184 m; North Fork ski 340 m
- info: audit: flat black: 4
- info: same counts as the previous build
- info: resort feed mtnpowder 53 gave no trail list: KeyError: 'MountainAreas'
- info: lifts fixed by rule (two-way gondola, or isolated: not joined to the rest): Five Trees
- pass: 0 shown runs rated by guess
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
- pass: 0 runs climb more than 12 m
