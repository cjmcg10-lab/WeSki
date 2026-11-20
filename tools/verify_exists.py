#!/usr/bin/env python3
"""Does every run and lift on the map really exist and is it open to the public? Hide what cannot be confirmed.

  verify_exists.py <id> <osm> [--list]      run after build_zones.py (it rewrites public/data/<id>/resort.json)

OpenStreetMap holds things a skier cannot use: runs cut for a real-estate development that has not opened, lifts
that serve only private homes, backcountry lines, uphill routes. The resort's own trail list
(tools/official/<id>.json) is the authority for what is open, so:

  run   shown when it is on the resort's list ("ok" from build_zones.py), or confirmed by hand in the official
        json ("confirm": {name: where it was seen}). A run that is not on the list is still shown when it only
        links listed terrain: OpenStreetMap often maps one run as several pieces, and catwalks and connectors are
        drawn on trail maps without their own names. Unlisted pieces that touch each other form a group; the group
        is kept when it joins listed runs or lifts at two or more separate places, and hidden when it hangs off
        listed terrain at one place only (a spur leading somewhere the resort does not show) or not at all.
        Kept unlisted pieces are marked "unl" (the app says "not on the resort's trail list").
  lift  shown when a listed run starts at its top (or passes it), or when the official json confirms it
        ("confirm_lifts": {name: note}). Moving carpets and short surface lifts in beginner areas are kept.
  never shown: OpenStreetMap says backcountry grooming, ski touring, private or no access; the official json
        lists it under "hide" {name: reason}.

Hidden runs and lifts stay in resort.json with "hide": reason; the app leaves them off the map, out of search
and out of directions. Every decision is printed, and --list prints the hidden ones in full.
"""
import json, math, os, sys
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
rid, osm_path = sys.argv[1], sys.argv[2]
LIST = "--list" in sys.argv
out = os.path.join(HERE, "..", "public", "data", rid)
R = json.load(open(f"{out}/resort.json"))
offp = os.path.join(HERE, "official", f"{rid}.json")
O = json.load(open(offp)) if os.path.exists(offp) else {}
CONFIRM, CONFIRM_LIFTS, HIDE = O.get("confirm", {}), O.get("confirm_lifts", {}), O.get("hide", {})

tags = {}
for ev, el in ET.iterparse(osm_path):
    if el.tag == "way":
        t = {x.get("k"): x.get("v") for x in el.findall("tag")}
        if t:
            tags[int(el.get("id"))] = t
    if el.tag in ("way", "relation"):
        el.clear()

pts = lambda f: [(f["pts"][i], f["pts"][i + 1]) for i in range(0, len(f["pts"]), 2)]


def seg_d(p, a, b):
    vx, vy = b[0] - a[0], b[1] - a[1]
    L = vx * vx + vy * vy
    t = 0 if L == 0 else max(0, min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / L))
    return math.hypot(a[0] + vx * t - p[0], a[1] + vy * t - p[1])


def line_d(p, P):
    return min(seg_d(p, P[i], P[i + 1]) for i in range(len(P) - 1)) if len(P) > 1 else math.dist(p, P[0])


def tag_reason(f):
    t = tags.get(f.get("osm"), {})
    if t.get("piste:grooming") == "backcountry" and not f.get("name"):
        return "OpenStreetMap: backcountry, no name (not a resort run)"
    if t.get("piste:type") in ("skitour", "nordic", "hike", "sled", "sleigh", "snow_park", "playground"):
        return f"OpenStreetMap: {t['piste:type']}"
    if t.get("access") in ("private", "no") or t.get("piste:access") in ("private", "no"):
        return "OpenStreetMap: private"
    return None


for f in R["trails"] + R["lifts"]:
    f.pop("hide", None); f.pop("unl", None); f.pop("review", None)

T, L = R["trails"], R["lifts"]
# 1. runs that are never shown
for t in T:
    r = HIDE.get(t["name"]) if t["name"] else None
    r = r and f"hidden by hand: {r}"
    if not r and not t.get("ok") and t["name"] not in CONFIRM:
        r = tag_reason(t)
    if r:
        t["hide"] = r
listed = [t for t in T if (t.get("ok") or t["name"] in CONFIRM) and not t.get("hide")]
LP = [pts(t) for t in listed]

# 2. lifts: a listed run must start at the top, and listed terrain must reach the bottom (a lift at a summit that
#    rises from an unopened valley, like Sunday River's Merrill Hill II, has the first but not the second)
SURFACE = ("carpet", "magic_carpet", "rope_tow", "platter", "t-bar", "drag", "j-bar", "zip_line")
cand = []
for l in L:
    if l["name"] in HIDE:
        l["hide"] = f"hidden by hand: {HIDE[l['name']]}"; continue
    if l["name"] in CONFIRM_LIFTS:
        continue
    r = tag_reason(l)
    if r:
        l["hide"] = r; continue
    if l.get("kind") in SURFACE or l.get("len", 0) < 150:
        continue        # beginner-area surface lifts: their slopes are rarely on a trail list
    P = pts(l)
    ups = [P[-1], P[0]] if l.get("both") else [P[-1]]
    if not any(math.dist(e, q[0]) < 90 or math.dist(e, q[-1]) < 90 or line_d(e, q) < 45 for e in ups for q in LP):
        l["review"] = "no run on the resort's list starts at its top"; continue
    cand.append(l)
ok_bottom = set()
for l in cand:
    b = pts(l)[0]
    if any(line_d(b, q) < 120 for q in LP):
        ok_bottom.add(id(l))
others = [l for l in L if not l.get("hide") and l not in cand]
changed = True
while changed:      # a bottom station next to another lift that is reached (a base area, a chain of lifts)
    changed = False
    for l in cand:
        if id(l) in ok_bottom:
            continue
        b = pts(l)[0]
        if any(min(math.dist(b, pts(m)[0]), math.dist(b, pts(m)[-1])) < 120 for m in others + [m for m in cand if id(m) in ok_bottom]):
            ok_bottom.add(id(l)); changed = True
for l in cand:
    if id(l) not in ok_bottom:
        l["review"] = "no run on the resort's list reaches its bottom"
shown_lifts = [l for l in L if not l.get("hide")]
anchors = [(q, None) for q in LP] + [(pts(l), "lift") for l in shown_lifts]

# 3. unlisted runs: keep the groups that link listed terrain at two or more places
un = [t for t in T if not t.get("hide") and not (t.get("ok") or t["name"] in CONFIRM)]
ends = {id(t): (pts(t)[0], pts(t)[-1]) for t in un}
par = {id(t): id(t) for t in un}
def find(x):
    while par[x] != x:
        par[x] = par[par[x]]; x = par[x]
    return x
for i, a in enumerate(un):
    for b in un[i + 1:]:
        if any(math.dist(p, q) < 30 or line_d(p, pts(b)) < 25 for p in ends[id(a)] for q in ends[id(b)]) or \
           any(line_d(q, pts(a)) < 25 for q in ends[id(b)]):
            par[find(id(a))] = find(id(b))
groups = {}
for t in un:
    groups.setdefault(find(id(t)), []).append(t)
nkept = nhid = 0
for g in groups.values():
    places = []
    for t in g:
        for p in ends[id(t)]:
            for q, kind in anchors:
                d = min(math.dist(p, q[0]), math.dist(p, q[-1])) if kind == "lift" else line_d(p, q)
                if d < (80 if kind == "lift" else 35):
                    if all(math.dist(p, x) > 60 for x in places):
                        places.append(p)
                    break
    park = any(w in (t["name"] or "").lower() for t in g for w in ("park", "pipe", "terrain"))
    # the way to a lift: a piece ending at a shown lift's bottom station is how skiers reach that lift
    to_lift = any(math.dist(pts(t)[-1], pts(l)[0]) < 80 for t in g for l in shown_lifts)
    keep = len(places) >= 2 or (places and (park or to_lift))
    for t in g:
        if keep:
            t["unl"] = 1; nkept += 1
        else:
            t["hide"] = "not on the resort's list and leads nowhere on it" if places else "not on the resort's list and not joined to it"
            nhid += 1

hid_t = [t for t in T if t.get("hide")]
hid_l = [l for l in L if l.get("hide")]
rev_l = [(l, l.pop("review")) for l in L if l.get("review")]
summ = {"runs": len(T), "listed": len(listed), "unlisted links kept": nkept, "runs hidden": len(hid_t),
        "lifts": len(L), "lifts hidden": len(hid_l), "lifts to review": len(rev_l)}
R.setdefault("sources", {})["checked"] = (f"every run and lift checked against the resort's own list: "
                                          f"{len(hid_t)} runs and {len(hid_l)} lifts not shown")
json.dump(R, open(f"{out}/resort.json", "w"), separators=(",", ":"), ensure_ascii=False)
print(rid, summ)
if LIST:
    for l in hid_l:
        print(f"  lift hidden: {l['name']} ({l['osm']}): {l['hide']}")
    for l, why in rev_l:
        print(f"  lift to review: {l['name']} ({l['osm']}, {l.get('kind')}, {l.get('len')} m): {why}")
    for t in sorted(hid_t, key=lambda t: -t["len"]):
        k = (t["name"], t["hide"])
        print(f"  run hidden: {t['name'] or '(no name)'} ({t['osm']}, {t['len']} m): {t['hide']}")
