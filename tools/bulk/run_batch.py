#!/usr/bin/env python3
"""Build a batch of candidates automatically: config, build, then the overlap check (issue #45).

usage: python3 tools/bulk/run_batch.py (--next N | <id> ...) [--workers 3] [--lifts lifts.geojson]

1. tools/bulk/autoconfig.py writes a config for each candidate that has none;
2. tools/pipeline.py builds each one (--no-index, never --r2), several at a time; the screen shows one line per
   resort, the full output goes to $PIPE_WORK/<id>.pipe.txt;
3. overlap: a resort whose lifts are mostly already on another of our maps (built before, or in this batch) is
   marked "hold" (two maps of one place); the smaller one is held.
Then run tools/bulk/gate.py --write, tools/build_index.py and tools/build_globe.py.
"""
import json
import os
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
WORK = os.environ.get("PIPE_WORK", "/tmp/weski-pipe")


def build(rid):
    t = time.time()
    with open(f"{WORK}/{rid}.pipe.txt", "w") as f:
        p = subprocess.run([sys.executable, "tools/pipeline.py", rid, "--no-index"], cwd=ROOT, stdout=f, stderr=subprocess.STDOUT)
    tail = open(f"{WORK}/{rid}.pipe.txt").read().strip().splitlines()[-4:]
    line = next((x for x in tail if x.startswith(rid)), tail[-1] if tail else "")
    print(f"{time.time() - t:6.0f} s  {line.strip()[:150]}", flush=True)
    return p.returncode


def overlaps():
    """Pairs of our maps that share most of one map's lifts (by OpenStreetMap id)."""
    lifts = {}
    for d in os.listdir(f"{ROOT}/public/data"):
        p = f"{ROOT}/public/data/{d}/resort.json"
        if os.path.exists(p):
            lifts[d] = {l["osm"] for l in json.load(open(p))["lifts"] if l.get("osm") and not l.get("hide")}
    out = []
    ids = sorted(lifts)
    for i, a in enumerate(ids):
        for b in ids[i + 1:]:
            s = lifts[a] & lifts[b]
            small = a if len(lifts[a]) <= len(lifts[b]) else b
            if s and len(s) > 0.5 * max(1, len(lifts[small])):
                out.append((small, b if small == a else a, len(s)))
    return out


def main():
    a = sys.argv[1:]
    workers, lifts, ids, nxt = 3, os.path.join(WORK, "lifts.geojson"), [], 0
    i = 0
    while i < len(a):
        if a[i] == "--workers":
            workers = int(a[i + 1]); i += 1
        elif a[i] == "--lifts":
            lifts = a[i + 1]; i += 1
        elif a[i] == "--next":
            nxt = int(a[i + 1]); i += 1
        else:
            ids.append(a[i])
        i += 1
    if nxt:
        rows = json.load(open(f"{ROOT}/tools/bulk/candidates.json"))
        have = {f[:-5] for f in os.listdir(f"{ROOT}/tools/resorts")}
        ids = [r["id"] for r in rows if not r["built"] and r["id"] not in have][:nxt]
    if not ids:
        raise SystemExit(__doc__)
    subprocess.run([sys.executable, "-I", "tools/bulk/autoconfig.py", *ids, "--lifts", lifts], cwd=ROOT, check=True)
    ids = [i for i in ids if os.path.exists(f"{ROOT}/tools/resorts/{i}.json")
           and json.load(open(f"{ROOT}/tools/resorts/{i}.json")).get("auto")]
    t = time.time()
    with ThreadPoolExecutor(workers) as ex:
        list(ex.map(build, ids))
    print(f"batch of {len(ids)} built in {(time.time() - t) / 60:.1f} min")
    for small, big, n in overlaps():
        p = f"{ROOT}/tools/resorts/{small}.json"
        cfg = json.load(open(p))
        if cfg.get("auto"):
            print(f"overlap: {small} shares {n} lifts with {big}: held")
            cfg["hold"] = f"overlaps {big} ({n} shared lifts): two maps of one place"
            json.dump(cfg, open(p, "w"), indent=1, ensure_ascii=False)
            open(p, "a").write("\n")
        else:
            print(f"overlap: {small} shares {n} lifts with {big} (both hand-built? look)")


if __name__ == "__main__":
    main()
