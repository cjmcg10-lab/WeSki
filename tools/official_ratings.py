#!/usr/bin/env python3
"""Official trail ratings: fetch a resort's own published trail list, compare it with the built map.

  fetch    official_ratings.py fetch mtnpowder <resortId> <id>
  lifts    official_ratings.py lifts mtnpowder <resortId> <id>   (adds the lift list and areas only)
           Saves tools/official/<id>.json from the feed behind the resort's own trail report.
           (Alterra resorts: Steamboat 6, Winter Park 5, Mammoth 60, Sugarbush 70.)
           For any other resort, write tools/official/<id>.json by hand from the resort's
           trail map or trail report, in the same shape:
             {"source": "...", "fetched": "YYYY-MM-DD", "runs": {"Run name": 0..3}, "blue_black": ["Run name"]}
           Levels: 0 green circle, 1 blue square, 2 black diamond, 3 double black / extreme.
           European and Japanese resorts rate by piste colour instead: add "scheme": "colour" and give
           each run its colour class: 0 green, 1 blue, 2 red, 3 black, 4 ski route / freeride itinerary
           (Japan: 0 green, 2 red, 3 black). The map's level for directions follows from the colour.

           Resorts that number their runs instead of naming them (Saalbach, SkiWelt) add
           "numbers": {"30": 0, "121a": 3, ...}: a map run whose OpenStreetMap ref is that number, or
           whose name is the number ("107", "40 Zwölferkogel", "Skiroute 208"), takes that rating.

  check    official_ratings.py check <id>
           Compares public/data/<id>/resort.json with tools/official/<id>.json and lists every
           run whose rating differs, official runs missing from the map, and map runs the resort
           does not list.

tools/build_zones.py applies tools/official/<id>.json on every build: the resort's rating wins over
the map data. So a resort is only "rating-checked" once this file exists for it.
"""
import datetime
import json
import os
import re
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ICON = {"GreenCircle": 0, "BlueSquare": 1, "BlueBlackSquare": 1, "BlackDiamond": 2, "DoubleBlackDiamond": 3, "ExtremeTerrain": 3}
NAMES = ["green", "blue", "black", "double black"]
COLOURS = ["green", "blue", "red", "black", "ski route"]
# colour class -> difficulty level used by directions (matches build_data.py DIFF and build_zones.py EU_CLASS)
COLOUR_LEVEL = [0, 0, 1, 2, 3]


def unnumbered(name):
    """'21a Streif-Familienabfahrt' -> 'Streif-Familienabfahrt': lists that print a piste number before the name
    (SkiWelt). Names that are only a number, or a number and a short word, are left alone."""
    s = re.sub(r"^\s*\d+[a-z]?\s+(?:-\s+)?(?=\D{3})", "", name or "")
    # "L. Binder" / "U. Boomauger" (Sugarloaf's list) are Lower / Upper
    return re.sub(r"\b([LU])\.\s*", lambda m: "Lower " if m.group(1) == "L" else "Upper ", s)


def key(name):
    """Run names differ in small ways between sources: 'Arriba (Upper)' / 'Upper Arriba', & / and, apostrophes."""
    s = unnumbered(name).lower().replace("&", " and ").replace("’", "'").replace("'", "")
    return " ".join(sorted(t for t in re.split(r"[^a-z0-9]+", s) if t and t not in ("the", "trail", "run")))


LIFT_WORDS = {"express", "chair", "chairlift", "lift", "gondola", "quad", "triple", "double", "high", "speed", "six",
              "eight", "pack", "detachable", "the", "to", "chondola", "cabriolet", "tbar", "t", "bar", "platter", "poma",
              "surface", "conveyor", "telemix", "and", "s"}
SURFACE_WORDS = ("carpet", "conveyor", "tow", "rope", "handle", "platter", "poma", "t-bar", "tbar", "j-bar", "wonder")


def lift_key(name):
    s = re.sub(r"\(.*?\)", " ", name.lower()).replace("-", "").replace("&", " and ").replace("'", "").replace("’", "")
    toks = [t for t in re.split(r"[^a-z0-9]+", s) if t and t not in LIFT_WORDS and not re.fullmatch(r"\d{1,2}|#\d+", t)]
    return " ".join(toks)


def missing_lifts(listed, on_map):
    """The resort's lifts with no lift of a matching name on the map. Names differ ("Summit Express" / "Summit
    Six", "Funitel" / "Gold Coast Funitel"), so words such as express, chair, quad and seat counts are ignored and
    one name may contain the other."""
    import difflib
    keys = [lift_key(m) for m in on_map]
    bare = {re.sub(r"[^a-z0-9]", "", m.lower()) for m in on_map}
    out = []
    for n in listed:
        k = lift_key(n)
        if not k or re.sub(r"[^a-z0-9]", "", n.lower()) in bare:
            continue
        hit = any(k == m or k.replace(" ", "") == m.replace(" ", "") or (m and (f" {k} " in f" {m} " or f" {m} " in f" {k} ")) or
                  difflib.SequenceMatcher(None, k, m).ratio() >= 0.8 for m in keys)
        if not hit:
            out.append(n)
    return out


def loose(name):
    """A looser form for a second try: no Upper / Lower / Middle, no spaces, no plural s."""
    s = re.sub(r"\(.*?\)", " ", unnumbered(name).lower()).replace("&", "and").replace("’", "").replace("'", "")
    toks = [t for t in re.split(r"[^a-z0-9]+", s) if t and t not in ("the", "trail", "run", "upper", "lower", "middle", "top", "bottom", "half")]
    return re.sub(r"s$", "", "".join(toks).replace("saint", "st"))


def qual(name):
    """Upper / Lower / Middle / Top / Bottom part named in a run name, '' when none."""
    t = [w for w in re.split(r"[^a-z]+", (name or "").lower()) if w in ("upper", "lower", "middle", "top", "bottom")]
    return " ".join(sorted(t))


def lookup(off):
    """Returns f(map run name) -> (level, is blue-black) or None, from an official list."""
    bb = set(off.get("blue_black", []))
    exact = {}
    for n, d in off["runs"].items():
        # the same name twice with different ratings (two numbered pistes of one name): the harder one
        if key(n) not in exact or d > exact[key(n)][0]:
            exact[key(n)] = (d, n in bb)
    groups = {}
    for n, d in off["runs"].items():
        groups.setdefault(loose(n), set()).add((d, n in bb))

    quals = {}
    for n in off["runs"]:
        quals.setdefault(loose(n), set()).add(qual(n))

    def f(name):
        if key(name) in exact:
            return exact[key(name)]
        g = groups.get(loose(name))
        if not g or len(g) != 1:                                  # only when every variant agrees
            return None
        # "Lower X" alone on the resort's list must not rate a map run called "X" or "Upper X": the
        # upper part is often harder. A list entry with no Upper/Lower covers every part of the run,
        # and so do several parts that all have the same rating.
        q, mine = quals[loose(name)], qual(name)
        return next(iter(g)) if mine in q or "" in q or (mine == "" and len(q) > 1) else None
    return f


def number_of(name, ref=None):
    """The piste number a map run carries: its OSM ref, or a number at the start of its name."""
    if ref:
        return ref.strip().lower()
    m = re.match(r"^(?:(?:piste|skiroute|route)\s+)?(\d+[a-z]?)(?:\s|$)", (name or "").strip().lower())
    return m.group(1) if m else None


def by_number(off, name, ref=None):
    nums = off.get("numbers")
    n = number_of(name, ref) if nums else None
    if n is None:
        return None
    n = n.lstrip("0") or "0"
    for k, v in nums.items():
        if (k.lower().lstrip("0") or "0") == n:
            return (v, False)
    return None


def load(rid):
    p = f"{HERE}/official/{rid}.json"
    return json.load(open(p)) if os.path.exists(p) else None


def fetch_mtnpowder(resort_id, rid):
    url = f"https://mtnpowder.com/feed?resortId={resort_id}"
    j = json.load(urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "weski-build"}), timeout=60))
    runs, bb, skipped = {}, [], {}
    for a in j["MountainAreas"]:
        for t in a["Trails"]:
            if t.get("TrailIcon") in ICON:
                runs[t["Name"].strip()] = ICON[t["TrailIcon"]]
                if t["TrailIcon"] == "BlueBlackSquare":
                    bb.append(t["Name"].strip())
            else:
                skipped[t.get("Difficulty")] = skipped.get(t.get("Difficulty"), 0) + 1
    out = {"source": f"{j['Name']} trail report (resort feed, mtnpowder.com resortId {resort_id})",
           "fetched": datetime.date.today().isoformat(), "runs": dict(sorted(runs.items())), "blue_black": sorted(bb)}
    json.dump(out, open(f"{HERE}/official/{rid}.json", "w"), indent=1, ensure_ascii=False)
    print(f"{rid}: {len(runs)} rated runs saved; not rated by the resort: {skipped}")
    fetch_mtnpowder_lifts(resort_id, rid, j)


def fetch_mtnpowder_lifts(resort_id, rid, j=None):
    """Add the resort's own lift list and its areas (area: run names) to tools/official/<id>.json, keeping
    everything else in the file. The pipeline's card compares them with the map: a lift or an area missing from
    the map means part of the resort is missing (Palisades' Sherwood bowl, 2026-11-21)."""
    if j is None:
        url = f"https://mtnpowder.com/feed?resortId={resort_id}"
        j = json.load(urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "weski-build"}), timeout=60))
    p = f"{HERE}/official/{rid}.json"
    off = json.load(open(p))
    lifts, areas = [], {}
    for a in j["MountainAreas"]:
        lifts += [l["Name"].strip() for l in a.get("Lifts", []) if l.get("Name")]
        tr = [t["Name"].strip() for t in a.get("Trails", []) if t.get("Name")]
        if tr:
            areas[a["Name"].strip()] = tr
    off["lifts"] = sorted(set(lifts))
    off["areas"] = areas
    json.dump(off, open(p, "w"), indent=1, ensure_ascii=False)
    open(p, "a").write("\n")
    print(f"{rid}: {len(off['lifts'])} lifts and {len(areas)} areas from the resort feed")


def check(rid):
    off = load(rid)
    assert off, f"no tools/official/{rid}.json"
    R = json.load(open(f"{HERE}/../public/data/{rid}/resort.json"))
    find = lookup(off)
    colour = off.get("scheme") == "colour"
    names = COLOURS if colour else NAMES
    seen, diff, extra = set(), {}, set()
    for T in R["trails"]:
        for n in T.get("also") or []:   # a run drawn once on a stretch it shares with another (build_data)
            if find(n):
                seen.add(key(n))
                seen.add(loose(n))
        if not T["name"]:
            continue
        hit = find(T["name"]) or by_number(off, T["name"], T.get("ref"))
        if hit:
            seen.add(key(T["name"]))
            seen.add(loose(T["name"]))
            n = number_of(T["name"], T.get("ref")) if off.get("numbers") and not find(T["name"]) else None
            for o in off["runs"] if n else ():     # matched by its number: the listed run of that number is on the map
                if number_of(o) == n:
                    seen.add(key(o))
            have = T.get("c", COLOURS.index("blue")) if colour else T["d"]
            # a stretch carrying a second name ("also") rightly takes the harder of the two ratings
            harder = max([hit[0]] + [find(n)[0] for n in T.get("also") or [] if find(n)])
            if hit[0] != have and harder != have:
                diff[T["name"]] = (have, hit[0])
        else:
            extra.add(T["name"])
    missing = sorted(n for n in off["runs"] if key(n) not in seen and loose(n) not in seen)
    # entries the resort lists that are not a separate run to draw: the same run under a second name
    # ("same_as": {"Schoolmarm Family Ski Trail": "Schoolmarm"}) or not a ski run at all ("not_runs":
    # {"Gate 1": "backcountry access gate"}); each says why, so nothing is left out silently
    same, notr, away = off.get("same_as", {}), off.get("not_runs", {}), off.get("elsewhere", {})
    map_names = {T["name"] for T in R["trails"]}
    for a, b in same.items():
        assert b in map_names, f"same_as: no map run named {b!r}"
    missing = [n for n in missing if n not in same and n not in notr and n not in away]
    if off.get("numbers"):
        got = {number_of(T["name"]) for T in R["trails"] if T["name"]}
        got |= {(T.get("ref") or "").strip().lower() for T in R["trails"]}
        got = {g.lstrip("0") or "0" for g in got if g}
        named = {number_of(o) for o in off["runs"] if key(o) in seen or loose(o) in seen
                 or o in same or o in notr or o in away}
        lost = sorted((k for k in off["numbers"] if (k.lower().lstrip("0") or "0") not in got and k.lower() not in named
                       and k not in same and k not in notr and k not in away), key=lambda k: (int(re.match(r"\d+", k).group()), k))
        print(f"  numbered runs on the resort's list: {len(off['numbers'])}, numbers not found on the map "
              f"({len(lost)}): {', '.join(lost)}")
    print(f"{rid}: {len(off['runs'])} official runs, {len(seen)} matched on the map, {len(diff)} with a different rating")
    for n, (a, b) in sorted(diff.items()):
        print(f"  [rating] {n}: map {names[a]}, resort {names[b]}")
    print(f"  official runs not on the map ({len(missing)}): {', '.join(missing)}")
    if same or notr or away:
        print(f"  listed but explained: {len(same)} other names for a run on the map, {len(notr)} not ski runs, "
              f"{len(away)} at a separate area outside this map")
    print(f"  map runs the resort does not list ({len(extra)}): {', '.join(sorted(extra))}")


if __name__ == "__main__":
    if sys.argv[1] == "fetch" and sys.argv[2] == "mtnpowder":
        fetch_mtnpowder(int(sys.argv[3]), sys.argv[4])
    elif sys.argv[1] == "lifts" and sys.argv[2] == "mtnpowder":
        fetch_mtnpowder_lifts(int(sys.argv[3]), sys.argv[4])
    elif sys.argv[1] == "check":
        check(sys.argv[2])
    else:
        sys.exit(__doc__)
