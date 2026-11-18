#!/usr/bin/env python3
"""Official trail ratings: fetch a resort's own published trail list, compare it with the built map.

  fetch    official_ratings.py fetch mtnpowder <resortId> <id>
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


def key(name):
    """Run names differ in small ways between sources: 'Arriba (Upper)' / 'Upper Arriba', & / and, apostrophes."""
    s = (name or "").lower().replace("&", " and ").replace("’", "'").replace("'", "")
    return " ".join(sorted(t for t in re.split(r"[^a-z0-9]+", s) if t and t not in ("the", "trail", "run")))


def loose(name):
    """A looser form for a second try: no Upper / Lower / Middle, no spaces, no plural s."""
    s = re.sub(r"\(.*?\)", " ", (name or "").lower()).replace("&", "and").replace("’", "").replace("'", "")
    toks = [t for t in re.split(r"[^a-z0-9]+", s) if t and t not in ("the", "trail", "run", "upper", "lower", "middle", "top", "bottom", "half")]
    return re.sub(r"s$", "", "".join(toks).replace("saint", "st"))


def qual(name):
    """Upper / Lower / Middle / Top / Bottom part named in a run name, '' when none."""
    t = [w for w in re.split(r"[^a-z]+", (name or "").lower()) if w in ("upper", "lower", "middle", "top", "bottom")]
    return " ".join(sorted(t))


def lookup(off):
    """Returns f(map run name) -> (level, is blue-black) or None, from an official list."""
    bb = set(off.get("blue_black", []))
    exact = {key(n): (d, n in bb) for n, d in off["runs"].items()}
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


def check(rid):
    off = load(rid)
    assert off, f"no tools/official/{rid}.json"
    R = json.load(open(f"{HERE}/../public/data/{rid}/resort.json"))
    find = lookup(off)
    colour = off.get("scheme") == "colour"
    names = COLOURS if colour else NAMES
    seen, diff, extra = set(), {}, set()
    for T in R["trails"]:
        if not T["name"]:
            continue
        hit = find(T["name"]) or by_number(off, T["name"])
        if hit:
            seen.add(key(T["name"]))
            seen.add(loose(T["name"]))
            have = T.get("c", COLOURS.index("blue")) if colour else T["d"]
            if hit[0] != have:
                diff[T["name"]] = (have, hit[0])
        else:
            extra.add(T["name"])
    missing = sorted(n for n in off["runs"] if key(n) not in seen and loose(n) not in seen)
    if off.get("numbers"):
        got = {number_of(T["name"]) for T in R["trails"] if T["name"]}
        print(f"  numbered runs on the resort's list: {len(off['numbers'])}, found by number in map names: "
              f"{len([k for k in off['numbers'] if k.lower() in got])} (OpenStreetMap refs are matched at build time)")
    print(f"{rid}: {len(off['runs'])} official runs, {len(seen)} matched on the map, {len(diff)} with a different rating")
    for n, (a, b) in sorted(diff.items()):
        print(f"  [rating] {n}: map {names[a]}, resort {names[b]}")
    print(f"  official runs not on the map ({len(missing)}): {', '.join(missing)}")
    print(f"  map runs the resort does not list ({len(extra)}): {', '.join(sorted(extra))}")


if __name__ == "__main__":
    if sys.argv[1] == "fetch" and sys.argv[2] == "mtnpowder":
        fetch_mtnpowder(int(sys.argv[3]), sys.argv[4])
    elif sys.argv[1] == "check":
        check(sys.argv[2])
    else:
        sys.exit(__doc__)
