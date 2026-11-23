# Making big maps faster: study and plan (2026-11-23)

A study of why the biggest mountains (Zermatt, SkiWelt, Park City, Tignes, Vail) feel slower than small ones such as
Jay Peak, with a costed list of ways to speed them up while keeping the detail. Nothing in the app on `main` was changed.
Three of the options were tried as switchable prototypes on the branch `claude/perf-study` and measured.

**Read this first: what these numbers are, and what they are not.** All measurements were made in a desktop Chromium
with a software graphics driver (SwiftShader) on a shared, busy 4-core build machine. That driver draws on the main
processor, so it is much slower than any phone, and it is slowed most by the *number of triangles* (the small flat
pieces every 3D shape is made of). Its milliseconds are only good for comparing one option against another on the same
machine; they say nothing about how fast a phone is. The triangle and draw counts are exact and the same on every
device. Nothing here has been tried on a real phone.

## In short

- **A big map asks the phone to draw about five times as much as Jay Peak, on every frame.** Jay Peak draws about
  380,000 triangles a frame; Vail 1.6 million, Park City 1.7 million, SkiWelt 2.0 million, Zermatt 2.1 million. The work on the main
  processor (labels, moving chairs, camera) is small everywhere (under 4 ms a frame), so the slowdown is graphics work.
- **Three things make up most of it**, and none of them are visible detail the skier needs:
  1. **The run lines** (about 40% at Park City): every run is stored as a point every 9 m so it hugs the ground, and
     each run is drawn twice (a second copy shows it through the trees). 80% of those points lie on straight, even
     stretches and can be left out without the line moving by more than 2 m.
  2. **The ground** (about 30-40%): the whole mountain surface is drawn at full detail all the time, even the parts
     behind the camera and the far slopes that cover only a few pixels.
  3. **Lifts** (15-25%): every chair, cabin and cable is drawn in full even when the whole resort is on screen and a
     chair is smaller than a pixel.
- **The three prototypes together cut the triangles per frame by 46-69%** (Park City 1.7 million to 0.5-0.6 million,
  Zermatt 2.1 million to 0.9-1.0 million, Jay Peak 384,000 to 172,000-206,000), and the measured frame time by 37-74%,
  with no difference I could see in side-by-side screenshots at the overview, mid and close views.
- **Recommendation:** ship the simpler run lines and the one-pass "runs through trees" first (small work, low risk,
  27-38% of the triangles on big maps), then the ground in pieces with distance detail, then lift detail by
  distance together with the lifts work already under way. Expected total: big maps drawing about as much as Jay Peak
  draws today when zoomed in, and about half of what they draw today in the overview.

## What makes big maps slow

Triangles drawn per frame, and where they come from (exact counts; the same view in every row is the opening view):

| Resort | Total | Ground | Run lines (incl. copy through trees) | Lifts, cables, chairs | Land around | Trees | Buildings |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Jay Peak | 385,000 | 108,000 | 121,000 | 45,000 | 55,000 | 54,000 | 2,000 |
| Vail | 1,562,000 | 583,000 | 566,000 | 261,000 | 82,000 | 54,000 | 15,000 |
| Park City | 1,708,000 | 565,000 | 709,000 | 259,000 | 84,000 | 53,000 | 38,000 |
| SkiWelt | 1,971,000 | 595,000 | 653,000 | 500,000 | 106,000 | 54,000 | 63,000 |
| Zermatt | 2,077,000 | 838,000 | 615,000 | 422,000 | 113,000 | 55,000 | 34,000 |

The total hardly changes between the overview and a close view (Zermatt: 2.08 million vs 2.07 million): everything is
drawn whether it is in view or not. Other findings:

- **Draw calls are not the problem**: 33-93 per frame. Merging objects would not help much (the lifts work on
  `claude/visuals-lifts-buildings` already halves the number of objects at Zermatt, 165 to 84).
- **Main-processor work is small**: a whole frame's JavaScript (camera, labels, chair positions) took 0.2-3.5 ms; the
  label layer alone 0.2-1.4 ms; handing the scene to the graphics chip 0.7-3.3 ms. Labels are not the cause.
- **Redraws when nobody touches the map**: zoomed in closer than 7.5 km, the map redraws about 20 times a second for
  ever, because the chairs keep moving; zoomed out it redraws twice a second. The label layer is redrawn 3.6 times a
  second even when nothing changed. The lifts branch already slows chair updates far from the camera and skips redraws
  when no chair in view moved.
- **Pixels matter less here than on a phone**: drawing at 1x instead of 2x sharpness made Jay Peak's frames 16-29%
  faster in this setup. On a phone, where the graphics chip is fast at triangles but the screen has 3x more pixels, this share is
  likely larger, but that could not be measured.
- **Opening a big map**: building Zermatt's scene took 1.3 s and the first picture another 4 s in this setup (Jay Peak
  0.5-0.9 s and 1-1.7 s). The phone's memory use for the map's data grows from 23 MB (Jay Peak) to 78-104 MB.

## The options

Gains are measured in triangles per frame (exact) on the three big maps measured, and as SwiftShader frame time where a
prototype exists. "Effort": S = a day or less, M = a few days, L = a week or more. Risk is the chance of something
looking wrong or breaking.

| # | Option | Gain on big maps | What the skier would notice | Effort | Risk |
| --- | --- | --- | --- | --- | --- |
| 1 | Simpler run lines (prototyped) | lines 80% fewer: -25% to -34% of all triangles | nothing: lines stay within 2 m of where they were | S | low |
| 2 | Runs through trees in one pass (prototyped) | -15% to -21% of all triangles; one less stencil pass | nothing on runs; a building or lift behind a tree may show through it | S | low |
| 3 | Ground in pieces, less detail far away (prototyped) | ground -62% to -95% (overview) and about -80% (close): -25% to -32% of all | far slopes very slightly smoother on the skyline; the shading keeps its detail | M | medium |
| 4 | Lift detail by distance | lifts -50% to -80% in the overview, about -20% of all triangles at SkiWelt | chairs and cabins vanish when they are smaller than a pixel; red lift lines stay | S-M | low |
| 5 | Lower sharpness while the map moves | measured 16-29% faster frames at 1x vs 2x (Jay Peak); likely more on phones | the picture is a little softer while panning, sharp again the moment it stops | M | medium |
| 6 | Automatic quality uses the new detail levels | keeps 60 fps on slower phones by stepping detail down first, sharpness last | slightly less far detail on a struggling phone | S (after 3 and 4) | low |
| 7 | Fewer redraws when the map is still | battery and heat, not smoothness: from 20 redraws a second to a few | nothing | S | low |
| 8 | Land around the resort and trees by distance | -5% to -10% of all triangles | nothing in practice | S-M | low |
| 9 | Faster opening (heavy setup in the background, worker) | 1-2 s less frozen screen when a big map opens | the mountain appears sooner | M | medium |
| 10 | Antialiasing off on sharp screens | unknown (cannot be measured here); possibly large on older phones | very slightly jaggier edges, hard to see at 2x | S | low |

### 1. Simpler run lines (prototyped: `?perf=lines`)

What it does: each run is stored with a point every 9 m. Most of those points sit on straight, even stretches. The
prototype keeps only the points needed for the drawn line to stay within 2 m of the mapped line on the map and within
1.5 m of the snow in height (the line floats 2.7-3.2 m above the snow, so it never sinks into it). Done once when the
map opens (about 5-60 ms), kept per run.

Measured: segments drop by 80-83% on every resort (Park City 30,023 to 5,346; Zermatt 25,680 to 5,046; Jay Peak 5,689
to 995). Screenshots before and after look the same. The routing and "which run am I on" use the full points and are
not affected.

Same idea, not yet done: the lift cables (15,000-16,500 segments at Zermatt and SkiWelt) are drawn with up to 12
points per span for the sag; straight spans need two.

### 2. Runs through trees in one pass (prototyped: `?perf=onepass`)

What it does: today every run line is drawn twice. The second copy is drawn only where a tree stands in front of the
run, so glades and wooded runs still show. The prototype gets the same picture in one pass: trees no longer block the
lines (they leave the depth record alone), while the ground still does, so a run behind a ridge stays hidden.

Measured: removes the second copy (Park City 354,000 triangles, Zermatt 307,000). Screenshots at Jay Peak (wooded) look
the same. Side effect: trees no longer hide what is drawn after them, so a building, lift or person standing behind a
tree may show through it, and in a dense stand a tree further back may be drawn over a nearer one. Neither was visible
in the test views, but it needs a look on a phone.

### 3. Ground in pieces, less detail far away (prototyped: `?perf=chunks`, `?perf=lod`)

What it does: the ground is one huge shape today (Zermatt: 838,000 triangles), always drawn whole. The prototype cuts
it into square pieces of 64 grid cells (Zermatt: 110 pieces), skips the pieces outside the view, and draws each piece
with every 1st, 2nd, 4th or 8th height, choosing the coarsest version whose worst height error stays under 2 pixels on
screen. Short skirts hang from each piece's edge so no gaps show where neighbours differ. The light and shade still come
from the full-detail ground, so slopes keep their look.

Measured (ground triangles): Park City 565,000 to 27,000 (overview), 87,000 (mid), 108,000 (close); Zermatt 838,000 to
322,000, 191,000, 174,000; Jay Peak 108,000 to 5,000-40,000. The Alps gain least in the overview because their steep
ground keeps more detail under the 2-pixel rule.

Skipping out-of-view pieces alone (`?perf=chunks`, measured at Zermatt) already does most of the work up close: ground
838,000 to 374,000 (overview), 180,000 (mid), 164,000 (close). At Zermatt the distance detail adds only the overview
gain (374,000 to 322,000; up close the skirts even add a few triangles). On gentler ground (Park City, Jay Peak) the
distance detail matters much more: Park City's overview ground fell to 27,000. So the pieces can ship first and the
distance detail second, as two smaller steps.

Costs and risks: the prototype works out the errors when the map opens, which added 1.1 s at Zermatt and 0.5 s at Park
City in this setup and about 40-50 MB of memory; a real version should compute them in the map build (or a worker) and
store compact index lists. A run line can dip into a coarser far piece; the fix is a small depth bias on the ground that
grows with distance (one line of code; not in the prototype). The map's "height under this point" (used to place
trails, trees, people) keeps using the full grid.

### 4. Lift detail by distance

What it does: when chairs and cabins are far away they are smaller than a pixel but each is still 60-108 triangles
(SkiWelt draws about 300,000 triangles of chairs and cabins). Hide carriers beyond the distance where they are animated
(already 1.6-4.5 km, by quality step), draw far ones as a few boxes (the lifts branch adds this), and simplify cables
(see 1). The red lift line, towers and stations stay.

Expected: lifts and cables -50% to -80% in the overview (SkiWelt about -20% of all triangles, Zermatt -15%). Must be
built on top of `claude/visuals-lifts-buildings`, which rewrites `animateLifts` and the carrier meshes.

### 5. Lower sharpness while the map moves

What it does: draws at 0.75x (or 1x on a 2x screen) while a finger is on the map or the camera glides, and redraws once
at full sharpness when it stops. The app already lowers sharpness step by step when a phone is slow, but only after 40
slow frames and never raises it during a pan.

Measured at Jay Peak: 1x instead of 2x made frames 16% to 29% faster here (a software driver, where pixels count for less than on a
phone). Risk: changing the canvas size can itself cause a stutter on some phones; the safer way is a lower-resolution
drawing buffer that is scaled up, which is more work. Needs testing on a phone.

### 6. Automatic quality uses the new detail levels

The app's automatic quality (`QUALITY` in `src/map.js`) steps down sharpness, tree count and lift range when frames are
slow. With options 3 and 4 in place, it should first allow coarser ground (3 then 6 pixels of error) and a shorter lift
detail range, and lower the sharpness last. Small work once those exist.

### 7. Fewer redraws when the map is still

Zoomed in, the map redraws 20 times a second while nobody touches it (moving chairs), and the label layer every 260 ms
even when nothing changed. The lifts branch already throttles far chairs and skips redraws when no chair in view moved.
Remaining: stop the label refresh when nothing changed, and drop the fixed twice-a-second redraw. This saves battery and
heat, which on iPhones is what eventually lowers the frame rate (the owner's 120 to 30 fps reports may be heat).

### 8. Land around the resort, and trees, by distance

The land around the resort (55,000-113,000 triangles) is coarse already; its far half could be drawn coarser still.
The 9,000 trees (54,000 triangles) are always all drawn; splitting them into the same pieces as the ground would skip
those out of view. Small gains (5-10% of all triangles), low priority.

### 9. Faster opening

Building the ground's colour images, the snow mask and the trees takes 0.5-1.3 s for a big map in this setup, and the
first picture (shader set-up and upload) another 2-5 s. Moving the image building into a background worker, or doing it
in the map build and downloading the result, would shorten the frozen screen when a big map opens. Not about smoothness
once open.

### 10. Antialiasing off on sharp screens

The map asks for 4x edge smoothing (`antialias: true`) at up to 2x pixel density. On 2x and 3x phone screens the
jagged edges are hard to see without it. The cost could not be measured here (the software driver does not behave like
a phone's chip); on phone chips edge smoothing is usually cheap but not free. Worth one test on a phone.

## Prototype results: before and after

All three prototypes on together (`?perf=lines,onepass,lod`), same views, same build.

| Resort, view | Triangles before | after | change | Frame time before (ms, SwiftShader) | after | change |
| --- | --- | --- | --- | --- | --- | --- |
| Jay Peak, overview | 384,679 | 172,023 | -55% | 1,420 | 489 | -66% |
| Jay Peak, mid | 383,583 | 203,871 | -47% | 959 | 554 | -42% |
| Jay Peak, close | 383,819 | 205,699 | -46% | 804 | 436 | -46% |
| Zermatt, overview | 2,076,879 | 1,007,029 | -52% | 4,117 | 2,384 | -42% |
| Zermatt, mid | 2,073,191 | 872,393 | -58% | 2,723 | 1,270 | -53% |
| Zermatt, close | 2,073,767 | 855,561 | -59% | 2,834 | 1,790 | -37% |
| Park City, overview | 1,708,173 | 524,507 | -69% | 4,194 | 1,077 | -74% |
| Park City, mid | 1,705,233 | 581,223 | -66% | 2,454 | 1,076 | -56% |
| Park City, close | 1,704,817 | 601,735 | -65% | 2,609 | 817 | -69% |

Draw calls go up (Zermatt 44-87 to 59-127, the ground pieces), which is still few. The frame times are rough: the
machine was shared with other jobs and the same frame varied by 10-20%.

What remains after the three (Zermatt, close view, 856,000 triangles): lifts and cables 419,000 (49%), ground 174,000,
land around 113,000, trees 55,000, run lines 61,000, buildings 34,000. That is why option 4 comes next.

## Recommendation

Ship in this order:

1. **Options 1 and 2 together** (simpler run lines, one pass through the trees). About a day, low risk, no visible
   change. Cuts 27-38% of the triangles on Zermatt, SkiWelt and Park City, and 29% at Jay Peak.
2. **Option 3** (ground in pieces with distance detail), with the errors computed in the map build and a depth bias for
   the run lines. A few days. Another 25-32% of the original triangles.
3. **Option 4** (lift detail by distance) once `claude/visuals-lifts-buildings` is merged, plus the remaining redraw
   savings (option 7). Another 10-20% on lift-heavy resorts, and less heat when the map sits still.
4. Then **options 5 and 6** (sharpness while moving, quality steps using the new detail), tuned on a real iPhone.

Expected total from 1-3: the big maps drop from 1.7-2.1 million triangles a frame to about 0.5-1.0 million, which is
in the range Jay Peak draws today (0.38 million) when zoomed in, and their frames took 37-74% less time in the
prototypes. With step 3 (lifts), Zermatt and SkiWelt should come down by roughly another 0.2-0.3 million.

What would remain: the cost of filling the screen's pixels (the ground's colouring shader runs on every pixel, 1.3
million of them at 2x on a phone), which only options 5 and 10 address and which can only be judged on a real phone;
the time to open a big map (option 9); and heat, which no amount of optimisation removes entirely. The honest next step
after shipping 1-3 is the owner's retest on the iPhone with the frame-rate readout (More, Appearance & advanced).

## Technical appendix

### How it was measured

- Build: `npx vite build`, served with `vite preview` on port 4799. Maps from R2 (`node tools/maps_r2.mjs pull ...`).
- Browser: Playwright Chromium (`/opt/pw-browsers/chromium`) with `--use-gl=angle --use-angle=swiftshader
  --enable-unsafe-swiftshader --ignore-gpu-blocklist`, viewport 390 x 844 CSS px, device pixel ratio 1 (an earlier run
  at 2 was too slow on the shared machine to repeat for every resort).
- Script: `tools/dev/perf_bench.mjs <origin> <out.json> <ids...>` (`PERF=lines,onepass,lod` adds the prototype
  switches, `FAST=1` skips the per-component timing, which was too noisy on the shared machine). It opens
  `/?skip=<id>`, pauses the app's own loop, and reads `window.skiwithme.map`:
  - `renderer.info` totals, then again with each component hidden (ground, trees, run lines, x-ray copies, land around,
    buildings, everything else = lifts, markers, rails) to split the triangles;
  - render time with a 1-pixel `readPixels` after it (forces the graphics work to finish) at full size and at 39 x 84
    pixels (almost no pixels: what remains is geometry and driver work). Full and tiny took nearly the same time
    (e.g. Park City 4,194 vs 3,714 ms), which shows this setup is limited by triangles, not pixels;
  - main-processor time per frame for `frame()` minus drawing, `drawOverlay()` and `animateLifts()`;
  - the live loop for 2.5 s idle and 2.5 s with a simulated drag, with drawing stubbed out, counting `frame()` calls,
    renders and label redraws per second;
  - a second map built from the same data with each build step timed (`buildTerrain`, `groundMaterial` ...), and the
    first frame after it (shader compile and upload);
  - JS heap after two forced garbage collections.
- `tools/dev/perf_objects.mjs <origin> <id> [perf]` lists the scene's biggest objects by triangles.
  `tools/dev/perf_shots.mjs <origin> <id> <dir> base lines,lod ...` takes the overview, mid and close screenshots for
  each switch set. `tools/dev/perf_line_simplify.py` and `tools/dev/perf_terrain_lod.py` are the offline estimates for
  options 1 and 3.
- Views: "overview" is the opening view; "mid" looks at the map's centre from 3.5 km at 55 degrees from straight down;
  "close" looks at the bottom of the longest lift from 700 m at 70 degrees (a low, skier-like angle with the horizon in
  view).

### Baseline numbers (device pixel ratio 1, SwiftShader, `main` at 932c0ca plus the switches off)

| | Jay Peak | Zermatt | Park City | SkiWelt |
| --- | --- | --- | --- | --- |
| Terrain grid / cell | 244 x 223 / 14 m | 599 x 702 / 26 m | 495 x 573 / 19 m | 507 x 589 / 28 m |
| Ground triangles | 107,892 | 838,396 | 565,136 | 595,056 |
| Run segments drawn (all line objects) | 22,824 | 129,600 | 133,740 | 133,046 |
| Trees | 8,999 | 9,122 | 8,895 | 9,003 |
| Triangles per frame | 384,000 | 2,074,000-2,077,000 | 1,705,000-1,708,000 | 1,966,000-1,971,000 |
| Draw calls | 33-45 | 44-87 | 42-75 | 46-93 |
| Render, full / tiny viewport (ms) | 804-1,420 / 526-1,173 | 2,723-4,117 / 2,146-3,193 | 2,454-4,194 / 2,500-3,714 | 2,226-4,351 / 2,281-4,040 |
| JS per frame while dragging (ms) | 0.2-1.0 | 0.2-1.6 | 0.6-1.7 | 1.3-1.5 |
| Labels (`drawOverlay`, ms) | 0.3-1.0 | 0.3-0.8 | 0.3-1.3 | 0.3-0.7 |
| Lift animation (ms) | 0-0.2 | 0-0.5 | 0-0.4 | 0-1.0 |
| Scene build / first frame (ms) | 909 / 1,743 | 1,326 / 4,015 | 896 / 5,282 | 932 / 4,951 |
| JS heap (MB) | 23 | 104 | 78 | 90 |
| Idle redraws per second, close / overview | 20 / 2 | 20 / 2 | 20 / 2 | 19 / 2 |
| Label redraws per second idle | 3.6 | 3.6 | 3.6 | 3.6 |

Vail (534 x 548 cells of 18 m): 583,102 ground triangles, 1.56 million per frame, 34-74 draw calls, heap 72 MB,
scene build 621 ms and first frame 5,300 ms, render 2,445-4,717 ms full and 1,936-3,913 ms tiny.
Tignes - Val d'Isère (654 x 453 cells of 26 m, 590,312 ground triangles) was pulled but its run did not finish in time.

Decoding the compact height and canopy files took under 60 ms on every resort; parsing `resort.json` under 5 ms.
Load and decode are not a cause of slowness once the map is open.

Biggest single objects at Zermatt (`perf_objects.mjs`): ground mesh 838,396; white run casing 153,402 and its x-ray
copy 153,402; land around 112,678; red runs 102,162 and copy 102,162; lift cables 91,272 (15,212 segments); trees
54,732; chairs and cabins 46,000-49,000 per type; red lift lines 43,956; buildings 34,317. At SkiWelt the chairs and
cabins together are about 300,000 triangles and the cables 99,336.

### What runs every frame and what runs on change

- Every drawn frame (`frame()` in `src/map.js`): `controls.update()`, camera clamp, `animateLifts()` unless farther
  than 7.5 km, avatar glide and scale, the camera key for the label layer, `renderer.render()` unless the view is still
  (`still` needs `farOut`, so zoomed in it is never still on `main`), `drawOverlay()` when the key changed, people
  moved, or every 260 ms.
- Loop (`loop()`): busy (touch in the last 0.9 s or camera moved in the last 0.15 s) runs at up to `maxFps` (60, or
  120 with "120 fps motion"); otherwise every 31 ms (people moving) or 48 ms.
- On change: `buildTrails()` on closures, `setRoute`, `setTrack`, `setBreadcrumbs`, `setFriends` (markers only).
- Automatic quality (`measure`, `setQuality`): every 40 busy frames; steps the pixel ratio 2 / 1.5 / 1.25 / 1, the tree
  share 100 / 75 / 50 / 30% and the lift animation range.

### The prototypes (branch `claude/perf-study`, all off unless switched on in the address)

- `?perf=lines`: `SkiMap.runPts(t)`, a Douglas-Peucker pass with a combined error of plan distance / 2 m and height
  distance (to the surface under the chord and to the dropped point) / 1.5 m, iterative, cached per trail object. Used
  for every run line, the casing, faded and closed runs. Areas and lift lines unchanged.
- `?perf=onepass`: tree material `depthWrite: false`, no stencil; `buildTrails` skips the x-ray copies. `?perf=noxray`
  drops the copies without changing the trees (to measure the copies alone).
- `?perf=chunks`: `SkiMap.chunkTerrain()`: 64-cell pieces sharing one position and normal buffer (normals from the
  full grid), each with its own index and a bounding box and sphere from its own cells (three.js `computeBoundingSphere`
  would measure the whole shared buffer). Frustum culling by three.js.
- `?perf=lod`: as chunks, plus index lists at steps 1, 2, 4, 8 with the worst bilinear height error of each, skirts
  `1.5 x error + 2 m` deep (at least 4 m), and `pickTerrainLod()` before each render: per piece, the coarsest level with
  `error < 2 px x metres-per-pixel x distance` (6 px in 2D, where height errors only shift the shading).
- Known gaps in the prototypes: no depth bias for run lines over coarse far ground; errors computed at map open in
  plain JS (slow, +1.1 s at Zermatt) and indices kept as JS arrays (+40-50 MB); skirts use the edge's normals; the
  pieces raise draw calls by up to 110 at Zermatt in the overview (could be merged per level with multi-draw, or pieces
  of 128 cells far away).

### Interplay with `claude/visuals-lifts-buildings` (in progress at the time of writing)

That branch rewrites `buildLifts`, `animateLifts` and `buildBuildings`: towers as two instanced meshes per lift kind,
all stations and carpet belts merged into one mesh, a simple far chair and cabin model plus a detailed one within
260-480 m, allocation-free carrier maths with a frustum check per lift, chair updates far from the camera stepped every
100-200 ms when nobody touches the map, `still` based on whether any lift in view moved, and lit windows on buildings
(an extra shader attribute, small cost). Measured on its preview build at Zermatt: 84 scene objects instead of 165, and
about the same triangles (2.11 million vs 2.09 million). It complements this plan (fewer objects, less CPU, fewer
redraws) but does not reduce the triangle count much; option 4 should be built on it. Options 1-3 touch
`buildTerrain`, `buildTrees` and `buildTrails`, which that branch does not change, so they can go in either order.

### How to rerun

```
node tools/maps_r2.mjs pull jay-peak zermatt park-city skiwelt
npx vite build && npx vite preview --port 4799 --strictPort --host 127.0.0.1 &
FAST=1 node tools/dev/perf_bench.mjs http://127.0.0.1:4799 base.json jay-peak zermatt park-city
PERF=lines,onepass,lod FAST=1 node tools/dev/perf_bench.mjs http://127.0.0.1:4799 combo.json jay-peak zermatt park-city
node tools/dev/perf_shots.mjs http://127.0.0.1:4799 zermatt shots base lines,onepass,lod
```
One resort takes 4-15 minutes on a busy 4-core machine. Compare triangle counts first; trust timing differences only
when they exceed about 20%.
