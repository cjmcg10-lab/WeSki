# Lifts and buildings on the 3D map: plan (2026-11-23)

What the lifts, towers, stations and buildings looked like, what they look like now, and how it stays
cheap enough for a phone. Code: `src/models.js` (shapes), `src/liftmotion.js` (how carriers move, pure
functions with tests in `tests/liftmotion.test.js`), `src/map.js` (`buildLifts`, `animateLifts`,
`buildBuildings`, `frame`). Nothing here has been tried on a real phone yet.

## Before and after

| Object | Before | After |
| --- | --- | --- |
| Chair | hanger, bar, seat, back, two posts, one light bar; bubble an opaque orange slab | grip and roller carriage on the cable, hanger with a knee, seat frame, padded seat and backrest, armrests, safety bar lowered with footrests; the bubble is a tinted see-through shell, **down over the seat going up and raised behind the chair coming down** |
| Detachable chairs and gondolas | same constant speed as fixed-grip chairs, also round the bullwheels | **slow to a crawl in the stations and bunch up, speed back up before rejoining the line**; line spacing still from the lift's real capacity; fixed-grip chairs keep one speed |
| Swing | none | a gentle sway on every chair and cabin, a lean against braking and speeding up in the stations |
| Gondola cabin | stacked boxes | rounded (eight-sided) body, glass band with white pillars, roof cap, belt line, door seam, ski racks, grip carriage |
| Aerial tram | two cabins shuttling with a smooth-step ease, fixed 75 s ride | cabins with running carriage (wheels on the track ropes), two-legged hanger, glass band with pillars; **speed rises evenly, cruises and falls evenly**; ride time from the real time where known (halved, 30 to 150 s); cabins lean when braking and swing after passing a tower |
| Funicular, mountain train | coloured boxes | window bands with pillars, belt line, roof equipment on the train; motion unchanged |
| T-bar, platter | pole and bar, hanging straight | spring box under the cable, stem, T with pads or a disc; **pulled back while towing uphill, tucked up on the way down** |
| Magic carpet | pads floating above the snow on both sides of a loop | a dark belt with light side rails on the snow, ribs moving up it (the return run is hidden) |
| Towers | one pole and a crossarm, one draw call for every different height | pole plus a head with crossarm, sheave trains under each cable and a work platform, sized by lift type (tall square-section towers with saddles for trams); **two draw calls per lift type** |
| Stations | bullwheel on a mast under a roof, an operator hut; one draw call each | chair: mast, spoked bullwheel, hood with a hipped roof, loading slab, operator hut with windows, motor room at the bottom end; detachable chair: a long housing on legs over the slow track; gondola: a hall with window bands the cabins pass through; tram: dock with window bands, closed back wall, machine room on the top station; surface lifts now get a post and wheel (and a hut at the bottom). **All terminals and belts are one merged mesh: one draw call** |
| Buildings | walls and a roof (flat, hipped, gabled), snow on pitched roofs | eaves overhanging the walls, rows of windows one storey apart (storeys from OpenStreetMap where known), stone chimneys on most chalet-sized pitched roofs, **windows lit warm in the evening and at night** (16:00 to 8:30 by the resort's sun time, from its longitude) |

Cable sag between towers was already there and is kept. Palette unchanged: dark red station roofs,
red gondolas, red and green tram cabins, orange bubbles, light walls.

## Frame budget

- Target: 60 fps while the map is touched (the cap), and as little drawing as possible when it is not.
- Draw calls: fewer than before. Towers went from one call per distinct height to two per lift type;
  terminals from two calls per lift to one for the whole resort. Chairs and cabins add one call per kind
  for the detailed near models (only drawn while any are near) and one for bubbles.
- Triangles: the terrain is most of every frame (about 0.4 million at Jay Peak, 1.6 million at Vail).
  Detailed chairs (about 250 triangles) and cabins (about 300) are drawn only within 260 to 480 m of the
  camera, depending on the automatic quality step; everything further away uses the old few-box models
  (about 50). Window rows cost no triangles at all: the building material paints them.
- Per frame on the processor: carriers are positioned without creating any objects, with a binary search
  along each cable instead of a scan; lifts out of view or out of range are not touched.

## How it stays cheap

1. Instancing for everything repeated: one instanced mesh per carrier kind (near and far), per tower
   pole and head kind; buildings and stations merged into one mesh each.
2. Level of detail per carrier, chosen each frame by distance.
3. Windows are drawn by the shader from a small per-vertex record; far away, where a window would be
   smaller than about two pixels, they fade into the wall instead of shimmering.
4. Animation only where it shows: lifts outside the view (not just out of range) are skipped.
5. Redraws respect the existing throttling, and do less of it: while nobody touches the map, lifts are
   stepped every frame (about 20 a second) only within 1.5 km of the camera, ten times a second up to
   4 km and five times a second beyond, where a chair moves less than a pixel between steps. A frame in
   which nothing moved is not drawn at all (before, any view closer than 7.5 km was redrawn about 20
   times a second, whether or not a lift was in view).

## Measured (2026-11-23, desktop Chromium with a software GPU, phone-sized window)

Draw calls and triangles come from three.js's own counters (`renderer.info`) for one frame.

| View | Draw calls before → after | Triangles before → after |
| --- | --- | --- |
| Jay Peak, opening view | 45 → 34 | 384,679 → 387,453 |
| Jay Peak, at a chairlift station | 30 → 32 | 383,287 → 394,149 |
| Vail, opening view | 74 → 37 | 1,561,555 → 1,573,650 |
| Vail, at the Gondola One station | 33 → 36 | 1,556,191 → 1,577,718 |
| Zermatt, opening view | 69 → 53 | 2,075,487 → 2,103,671 |
| Zermatt, above the village | 48 → 52 | 2,075,963 → 2,107,359 |
| Park City, opening view | 75 → 39 | 1,708,173 → 1,729,314 |
| Park City, at a chairlift station | 35 → 38 | 1,704,089 → 1,737,906 |

Close to lifts a frame costs 2 to 4 more draw calls (detailed chairs, cabins, bubbles) and 1 to 3 % more
triangles; from further out it costs far fewer draw calls. Processor time to move every carrier once
(`animateLifts`, average of 400 runs, same machine for both): Vail 0.55 → 0.17 ms next to a lift and
0.41 → 0.16 ms at 2.5 km, Park City 0.23 → 0.05 and 0.35 → 0.09 ms, Zermatt 0.29 → 0.06 and 0.28 → 0.10 ms,
even though detachable lifts now carry more chairs (Vail 2,142 → 2,802 carriers). Redraws a second while the
map is left alone (drawing itself switched off so the slow software GPU does not limit the count): Vail at
150 m 22 → 22, at 2.5 km 22.5 → 11.5, at 6 km 22.5 → 7.8; Jay Peak 21 → 20, 21 → 10.5, 21 → 8.8; the opening
views (9 to 13 km out) 2 → 2. Whole-frame times on the software GPU were about the same before and after
(for example Vail's opening view 4.4 s and 4.5 s a frame) and say nothing about a phone's GPU. Not measured
on a real phone.

## Not done (weighed and left out)

- Bubble opening and closing as the chair leaves the station (it switches at the bullwheel).
- Funicular cars stepped to stay level on the slope.
- Snowcats or other vehicles: there is no data saying where they are.
- Roof snow shapes beyond the existing snow colour mixed into each roof.
- Detailed models of the moving parts in 2D mode (the 2D map is seen from straight above).

## Building styles (2026-11-24)

Every building keeps its real footprint and wall height from OpenStreetMap; what changes is its skin. Each one gets
one of eight looks, chosen by code with no work per resort or per building:

| Style | Look | Chosen for |
| --- | --- | --- |
| `lodge` base lodge | timber upper walls on a stone plinth, the downhill long wall glazed on the ground floor, wide windows above, a timber deck with railing and posts on the first floor | "base lodge", ski school, rentals, tickets, guest services, a big restaurant at a lift base, unnamed big buildings at a lift base, shops and public buildings |
| `rest` mountain restaurant | stone ground floor with small windows, timber above with wide panorama windows, a balcony band on the downhill side | restaurants, cafés, bars (several languages), any building of 80 m² or more at a lift top or a summit |
| `hut` alpine hut, chalet | dark timber, stone plinth, small windows with shutters (green, red or brown), gabled roof, stone chimney | huts (Hütte, refuge, rifugio, cabane, 山小屋 ...), cabins, chalets, houses, small unnamed buildings (under 350 m²) |
| `hotel` hotel, condo | rendered walls in light colours, a tall window every 3 m on every floor, balcony rails and slab lines above the ground floor | hotels, inns, condos, apartments, residences, 3+ storeys, large unnamed buildings |
| `chapel` | white render, steep roof, tall round-headed windows, a belfry with louvres and a spire on one end of the ridge | chapel / church tags and names (Kapelle, chapelle, chiesa, 教会 ...) unless the name is also a hotel's |
| `tower` | stone lower third, rendered above, clock faces near the top of each side, steep pyramid roof | tower tags, "tower / Turm / torre" names on small footprints, tall narrow footprints |
| `service` | ribbed metal cladding, concrete plinth, a few small high windows, one or two roll-up doors on the longest wall | maintenance, workshops, sheds, lift stations, barns, industrial tags, single garages, tiny unnamed buildings |
| `garage` | concrete slab band each floor with dark openings between columns, flat roof | parking garages (`building=parking`, `amenity=parking`, "parking" in the name, big `garage` buildings) |

How it is chosen: `tools/building_style.py` (`classify`) runs in `tools/build_data.py` on every build and in
`tools/enrich_osm.py`, and stores the result as `st` on each building in `resort.json`. It reads the building's
OpenStreetMap tags (`building`, `amenity`, `tourism`, `man_made`, `shop`, `leisure`), the tags and names of
OpenStreetMap points inside its footprint (restaurants are often a point in an untagged building), name keywords from
`src/building_words.json` (lower case, accents removed; "words" match whole words so "bar" does not match "Barn",
"parts" match inside compound words like "Skistube"), footprint area, height, storeys, and whether it stands within
90 m of a chair, gondola, tram or funicular end (bottom or top) or 150 m of a summit. The rules run top to bottom and
the first that fits wins (tower, chapel, parking, base-area services, patrol, hotel, food, hut, lodge, service, other
tags, place, size). Maps without `st` (built before) are classified in the app by `src/buildingstyle.js`
(`classifyBuilding`), the same rules from what resort.json keeps (name, hotel kind, size, place).
`tests/fixtures/building_styles.json` holds shared cases that both must pass (`tests/buildingstyle.test.js` runs both).

How it is drawn: still one merged mesh and one draw call. `addBuilding` in `src/models.js` writes a second per-vertex
record `sty` (wall material upper + 16 x lower, the height where the lower one ends, window pattern, a seed), and the
building material paints boards, stone courses, metal ribs, glass, garage bands, doors, clocks and louvres from it, in
metres on the wall, fading each into its average colour where it would be smaller than a pixel or two (no shimmer).
Colours come from each style's list in `LOOK` (`src/buildingstyle.js`), picked by a stable seed from the footprint's
first corner and varied a little in brightness, so neighbours differ but a building looks the same after a rebuild.
OpenStreetMap's own wall colour, roof colour and roof shape still win where they exist. Night lights still light all
windows (and the clock dials). Extra triangles only where they matter: a deck (about 20), a belfry (12), a clock face
(2 per side), a roll-up door (2).

Adding a style: add its name to `STYLES` in both files, a rule in `classify` and `classifyBuilding` at the right place
in the order, its keywords to `src/building_words.json`, its look to `LOOK` (walls, roofs, materials, windows, roof
shape and pitch, features), and cases to the fixture. A new wall material or window pattern is a new number in `MAT` /
`WIN` and a branch in the building shader (`BUILDING_FRAG` in `src/models.js`).

Regenerating the stored styles: `python3 -I tools/enrich_osm.py <id> [<id> ...]` (all resorts:
`python3 -I tools/enrich_osm.py $(ls public/data | grep -v '\.')` after `node tools/maps_r2.mjs pull --all`). It needs
the network (Overpass, or an OpenStreetMap extract downloaded into `$PIPE_WORK`), also refreshes the lift and roof
details it always adds, and changes only resort.json. Until a map is regenerated the app classifies its buildings
itself, with less to go on (no tags), so nothing breaks.
