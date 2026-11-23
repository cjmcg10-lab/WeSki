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

## Not done (weighed and left out)

- Bubble opening and closing as the chair leaves the station (it switches at the bullwheel).
- Funicular cars stepped to stay level on the slope.
- Snowcats or other vehicles: there is no data saying where they are.
- Roof snow shapes beyond the existing snow colour mixed into each roof.
- Detailed models of the moving parts in 2D mode (the 2D map is seen from straight above).
