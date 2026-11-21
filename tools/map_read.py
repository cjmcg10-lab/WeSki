#!/usr/bin/env python3
"""Read a resort's trail map into tools/official/<id>.json, in three small steps.

  tiles  map_read.py tiles <map.pdf|png|jpg> <out dir> [--dpi 300] [--tile 1500]
         Renders a PDF (pdftoppm) or opens an image and cuts it into overlapping tiles
         (tile_r<row>_c<col>.png, 15% overlap) small enough to read run labels from.
         A PDF with real text is listed too (text.txt, from pdftotext -layout): read that first.

  sheet  map_read.py sheet <id> [--osm]
         Prints the reading sheet: every named run on our map, one per line, for the reader to
         fill in. --osm adds OpenStreetMap's rating after each name (for the second, disagreement-only
         pass; leave it off for the first pass so the reader is not steered).

  notes  map_read.py notes <id> <notes.txt> --source "<where the map came from>" [--colour]
         Turns notes into tools/official/<id>.json. One run per line: "Run name | level".
         Levels: green, blue, bb (blue-black / blue with a diamond), black, double
                 (--colour for Europe and Japan: green, blue, red, black, route)
         Lines starting with # are skipped; "Run name | ?" (unreadable) is listed for the second look. "Run name | skip | why" puts the name under not_runs.
         A run listed twice with different levels keeps the harder one and is reported.

  compare map_read.py compare <id> <osm extract>
         The second pass: lists every run where tools/official/<id>.json and OpenStreetMap's
         piste:difficulty disagree (after a build the map already carries the official rating, so this
         reads OpenStreetMap itself). Only these runs need the close second look.

  names  map_read.py names <id> [--write]
         Matches official runs missing from the map to map runs whose names are spelled differently
         ("Cresent" / "Crescent", "Headwall Forrest") and to runs the resort splits into upper and lower
         parts that the map has as one ("Grumble" / "Grumble Upper" + "Grumble Lower"). --write puts the
         spelling fixes in the config's "rename" and gives a whole run the harder of its parts' official
         ratings (the rule in CLAUDE.md). Close calls are only printed. Rebuild afterwards.

The cheap way to use it (see docs/ADDING_MOUNTAINS.md): a smaller model reads the tiles against the
sheet and writes the notes; official_ratings.py check then lists where the notes and OpenStreetMap
disagree, and only those runs are read again closely.
"""
import datetime
import json
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
LEVEL = {"green": 0, "blue": 1, "bb": 1, "black": 2, "double": 3}
COLOUR = {"green": 0, "blue": 1, "red": 2, "black": 3, "route": 4}


def opt(a, k, d=None):
    return a[a.index(k) + 1] if k in a else d


def tiles(a):
    src, out = a[0], a[1]
    dpi, size = int(opt(a, "--dpi", 300)), int(opt(a, "--tile", 1500))
    from PIL import Image
    Image.MAX_IMAGE_PIXELS = None
    os.makedirs(out, exist_ok=True)
    if open(src, "rb").read(5) == b"%PDF-":  # by content: downloaded maps often have no extension
        subprocess.run(["pdftoppm", "-r", str(dpi), "-png", "-f", "1", "-l", "1", src, f"{out}/page"], check=True)
        page = sorted(f for f in os.listdir(out) if f.startswith("page"))[0]
        subprocess.run(["pdftotext", "-layout", src, f"{out}/text.txt"])
        words = len(open(f"{out}/text.txt", errors="ignore").read().split())
        print(f"text layer: {words} words in {out}/text.txt" + (" (read this first: names may be real text)" if words > 50 else ""))
        im = Image.open(f"{out}/{page}")
    else:
        im = Image.open(src)
    im = im.convert("RGB")
    W, H = im.size
    step = int(size * 0.85)
    n = 0
    for r, y in enumerate(range(0, max(1, H - size + step), step)):
        for c, x in enumerate(range(0, max(1, W - size + step), step)):
            im.crop((x, y, min(W, x + size), min(H, y + size))).save(f"{out}/tile_r{r}_c{c}.png")
            n += 1
    print(f"{W}x{H} px -> {n} tiles of {size} px in {out}")


def sheet(a):
    rid = a[0]
    R = json.load(open(f"{ROOT}/public/data/{rid}/resort.json"))
    names = {}
    for t in R["trails"]:
        if t.get("name") and not t.get("hide"):
            names.setdefault(t["name"], t)
    word = ["green", "blue", "black", "double"]
    for n in sorted(names, key=str.lower):
        t = names[n]
        if "--osm" in a:
            lv = "bb" if t.get("bb") else word[t.get("d", 1)]
            print(f"{n} | {'?' if t.get('u') else lv}")
        else:
            print(f"{n} | ")


def notes(a):
    rid, path = a[0], a[1]
    src = opt(a, "--source")
    if not src:
        raise SystemExit("--source is required (where the map came from: url, or 'uploaded by the owner')")
    table = COLOUR if "--colour" in a else LEVEL
    runs, bb, notr, clash, unsure = {}, [], {}, [], []
    for raw in open(path, encoding="utf-8"):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        parts = [p.strip() for p in line.split("|")]
        if len(parts) < 2 or not parts[1]:
            continue
        name, lv = parts[0], parts[1].lower()
        if lv == "skip":
            notr[name] = parts[2] if len(parts) > 2 else "not a run"
            continue
        if lv == "?":  # unreadable on the first pass: left for the close second look
            unsure.append(name)
            continue
        if lv not in table:
            raise SystemExit(f"unknown level {lv!r} in: {line}")
        v = table[lv]
        if name in runs and runs[name] != v:
            clash.append(f"{name}: {runs[name]} and {v}")
            v = max(v, runs[name])
        runs[name] = v
        if lv == "bb" and name not in bb:
            bb.append(name)
    out = {"source": src, "fetched": datetime.date.today().isoformat(), "runs": dict(sorted(runs.items()))}
    if "--colour" in a:
        out["scheme"] = "colour"
    else:
        out["blue_black"] = sorted(bb)
    if notr:
        out["not_runs"] = notr
    p = f"{HERE}/official/{rid}.json"
    if os.path.exists(p):
        old = json.load(open(p))
        kept = [k for k in old if k not in ("source", "fetched", "runs", "blue_black", "scheme")]
        for k in kept:
            out[k] = {**old[k], **out[k]} if k == "not_runs" and k in out else old[k]
        if kept:
            print(f"kept from the existing file: {', '.join(kept)}")
    json.dump(out, open(p, "w"), indent=1, ensure_ascii=False)
    open(p, "a").write("\n")
    print(f"{rid}: {len(runs)} rated runs saved to {p}" + (f"; listed twice, harder kept: {'; '.join(clash)}" if clash else ""))
    unsure = [u for u in unsure if u not in runs]
    if unsure:
        print(f"not readable on the first pass ({len(unsure)}), read these closely: {'; '.join(unsure)}")
    print(f"next: python3 tools/build_zones.py tools/resorts/{rid}.json <osm> public/data/{rid}, "
          f"then python3 tools/official_ratings.py check {rid}")


def names(a):
    import difflib
    sys.path.insert(0, HERE)
    from official_ratings import key
    rid = a[0]
    cfg_path = f"{ROOT}/tools/resorts/{rid}.json"
    cfg = json.load(open(cfg_path))
    offp = f"{HERE}/official/{rid}.json"
    off = json.load(open(offp))
    R = json.load(open(f"{ROOT}/public/data/{rid}/resort.json"))
    mapn = {t["name"] for t in R["trails"] if t.get("name")}
    mkeys = {key(n): n for n in mapn}
    explained = set(off.get("same_as", {})) | set(off.get("not_runs", {})) | set(off.get("elsewhere", {}))
    missing = [n for n in off["runs"] if key(n) not in mkeys and n not in explained]
    okeys = {key(n) for n in off["runs"]} | {key(v) for v in off.get("same_as", {}).values()}
    free = sorted(n for n in mapn if key(n) not in okeys)
    part = re.compile(r"\b(upper|lower|top|bottom|mid|middle)\b", re.I)
    renames, wholes, close = {}, {}, []
    for n in missing:
        base = " ".join(part.sub(" ", n).split())
        if base != n and key(base) in mkeys and key(base) not in okeys:
            wholes.setdefault(mkeys[key(base)], []).append(n)
            continue
        def score(m):
            return difflib.SequenceMatcher(None, n.lower(), m.lower()).ratio()
        # numbered pieces ("Daly Chute 1") are never matched by spelling: they are separate runs
        best = max((m for m in free if bool(re.search(r"\d\s*$", m)) == bool(re.search(r"\d\s*$", n))), key=score, default=None)
        if best and best not in renames:
            r = score(best)
            if r >= 0.86 or (r >= 0.75 and best.lower().split()[0] == n.lower().split()[0]):
                renames[best] = n
            elif r >= 0.6:
                close.append(f"{n} ~ {best} ({r:.2f})")
    for m, n in sorted(renames.items()):
        print(f"spelling: map {m!r} -> {n!r}")
    for m, parts in sorted(wholes.items()):
        lv = max(off["runs"][p] for p in parts)
        print(f"one map run for {', '.join(parts)}: {m!r} takes the harder rating ({lv})")
    for c in close:
        print(f"close, not used: {c}")
    if "--write" in a and (renames or wholes):
        cfg.setdefault("rename", {}).update(renames)
        json.dump(cfg, open(cfg_path, "w"), indent=1, ensure_ascii=False)
        open(cfg_path, "a").write("\n")
        for m, parts in wholes.items():
            off["runs"][m] = max(off["runs"][p] for p in parts)
            off.setdefault("same_as", {}).update({p: m for p in parts if p != m})
            if any(p in off.get("blue_black", []) for p in parts) and m not in off.get("blue_black", []):
                off.setdefault("blue_black", []).append(m)
        off["runs"] = dict(sorted(off["runs"].items()))
        json.dump(off, open(offp, "w"), indent=1, ensure_ascii=False)
        open(offp, "a").write("\n")
        print(f"written: {len(renames)} spelling fixes to {cfg_path}, {len(wholes)} whole runs to {offp}")


OSM_LEVEL = {"novice": 0, "easy": 0, "intermediate": 1, "advanced": 2, "expert": 3, "freeride": 3, "extreme": 3}


def compare(a):
    import xml.etree.ElementTree as ET
    sys.path.insert(0, HERE)
    from official_ratings import key
    rid, osm = a[0], a[1]
    off = json.load(open(f"{HERE}/official/{rid}.json"))
    colour = off.get("scheme") == "colour"
    seen = {}
    for w in ET.parse(osm).getroot().iter("way"):
        t = {x.get("k"): x.get("v") for x in w.findall("tag")}
        if t.get("piste:type") != "downhill" or t.get("piste:difficulty") not in OSM_LEVEL:
            continue
        n = t.get("piste:name") or t.get("name")
        if n:
            seen.setdefault(key(n), set()).add(OSM_LEVEL[t["piste:difficulty"]])
    words = ["green", "blue", "black", "double"]
    diff = []
    for name, lv in off["runs"].items():
        o = seen.get(key(name))
        if colour or not o or lv in o:
            continue
        diff.append((abs(lv - max(o)), name, lv, sorted(o)))
    for d, name, lv, o in sorted(diff, reverse=True):
        print(f"{name}: read {words[lv]}{' (blue-black)' if name in off.get('blue_black', []) else ''}, "
              f"OpenStreetMap {'/'.join(words[x] for x in o)}" + ("  <- two levels apart" if d > 1 else ""))
    print(f"{rid}: {len(diff)} of {len(off['runs'])} runs disagree with OpenStreetMap "
          f"({sum(1 for n in off['runs'] if key(n) in seen)} have an OpenStreetMap rating)")


if __name__ == "__main__":
    cmd, rest = (sys.argv[1], sys.argv[2:]) if len(sys.argv) > 2 else (None, [])
    if cmd not in ("tiles", "sheet", "notes", "compare", "names"):
        raise SystemExit(__doc__)
    {"tiles": tiles, "sheet": sheet, "notes": notes, "compare": compare, "names": names}[cmd](rest)
