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
         Lines starting with # are skipped. "Run name | skip | why" puts the name under not_runs.
         A run listed twice with different levels keeps the harder one and is reported.

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
    if src.lower().endswith(".pdf"):
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
    runs, bb, notr, clash = {}, [], {}, []
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
    print(f"next: python3 tools/build_zones.py tools/resorts/{rid}.json <osm> public/data/{rid}, "
          f"then python3 tools/official_ratings.py check {rid}")


if __name__ == "__main__":
    cmd, rest = (sys.argv[1], sys.argv[2:]) if len(sys.argv) > 2 else (None, [])
    if cmd not in ("tiles", "sheet", "notes"):
        raise SystemExit(__doc__)
    {"tiles": tiles, "sheet": sheet, "notes": notes}[cmd](rest)
