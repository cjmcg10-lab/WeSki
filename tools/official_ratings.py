#!/usr/bin/env python3
"""Official trail ratings: fetch a resort's own published trail list, compare it with the built map.

  fetch    official_ratings.py fetch mtnpowder <resortId> <id>
           Saves tools/official/<id>.json from the feed behind the resort's own trail report.
           (Alterra resorts: Steamboat 6, Winter Park 5, Mammoth 60, Sugarbush 70.)
           For any other resort, write tools/official/<id>.json by hand from the resort's
           trail map or trail report, in the same shape:
             {"source": "...", "fetched": "YYYY-MM-DD", "runs": {"Run name": 0..3}, "blue_black": ["Run name"]}
           Levels: 0 green circle, 1 blue square, 2 black diamond, 3 double black / extreme.

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


def key(name):
    """Run names differ in small ways between sources: 'Arriba (Upper)' / 'Upper Arriba', & / and, apostrophes."""
    s = (name or "").lower().replace("&", " and ").replace("’", "'").replace("'", "")
    return " ".join(sorted(t for t in re.split(r"[^a-z0-9]+", s) if t and t not in ("the", "trail", "run")))


def loose(name):
    """A looser form for a second try: no Upper / Lower / Middle, no spaces, no plural s."""
    s = re.sub(r"\(.*?\)", " ", (name or "").lower()).replace("&", "and").replace("’", "").replace("'", "")
    toks = [t for t in re.split(r"[^a-z0-9]+", s) if t and t not in ("the", "trail", "run", "upper", "lower", "middle", "top", "bottom", "half")]
    return re.sub(r"s$", "", "".join(toks).replace("saint", "st"))


def lookup(off):
    """Returns f(map run name) -> (level, is blue-black) or None, from an official list."""
    bb = set(off.get("blue_black", []))
    exact = {key(n): (d, n in bb) for n, d in off["runs"].items()}
    groups = {}
    for n, d in off["runs"].items():
        groups.setdefault(loose(n), set()).add((d, n in bb))

    def f(name):
        if key(name) in exact:
            return exact[key(name)]
        g = groups.get(loose(name))
        return next(iter(g)) if g and len(g) == 1 else None      # only when every variant agrees
    return f


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
    seen, diff, extra = set(), {}, set()
    for T in R["trails"]:
        if not T["name"]:
            continue
        hit = find(T["name"])
        if hit:
            seen.add(key(T["name"]))
            seen.add(loose(T["name"]))
            if hit[0] != T["d"]:
                diff[T["name"]] = (T["d"], hit[0])
        else:
            extra.add(T["name"])
    missing = sorted(n for n in off["runs"] if key(n) not in seen and loose(n) not in seen)
    print(f"{rid}: {len(off['runs'])} official runs, {len(seen)} matched on the map, {len(diff)} with a different rating")
    for n, (a, b) in sorted(diff.items()):
        print(f"  [rating] {n}: map {NAMES[a]}, resort {NAMES[b]}")
    print(f"  official runs not on the map ({len(missing)}): {', '.join(missing)}")
    print(f"  map runs the resort does not list ({len(extra)}): {', '.join(sorted(extra))}")


if __name__ == "__main__":
    if sys.argv[1] == "fetch" and sys.argv[2] == "mtnpowder":
        fetch_mtnpowder(int(sys.argv[3]), sys.argv[4])
    elif sys.argv[1] == "check":
        check(sys.argv[2])
    else:
        sys.exit(__doc__)
