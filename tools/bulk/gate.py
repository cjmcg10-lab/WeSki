#!/usr/bin/env python3
"""Quality score and gate for automatically built mountains (issue #45, phase 6). No AI: numbers and fixed limits.

usage: python3 tools/bulk/gate.py [<id> ...] [--write] [--table FILE]

With no ids, every config with "auto": true. For each resort it reads the build's numbers
(tools/bulk/results/<id>.json, written by tools/pipeline.py), the built map (public/data/<id>/resort.json), the
connection check (tools/check_connections.py: unreachable runs, dead ends, lift ends, uphill joins, doubled runs)
and OpenSkiMap's own counts (config "openskimap"), and decides:

  publish   every hard limit below is met: the mountain goes in the index (with the app's "ratings not yet checked"
            note where no resort list exists, and the "lower-detail terrain" note on 30 m terrain)
  hold      a hard limit failed: the config gets "hold": "<reasons>", build_index.py leaves the mountain out of the
            live index (the preview can still show it), and a person looks at the card

Hard limits (a map that fails one can send a skier wrong, or fails the app's own tests):
  - the build finished;
  - lifts: at least 80% of OpenSkiMap's lift count for the area is on the map, and at least 80% of the lifts
    OpenSkiMap assigns to it (by OpenStreetMap id) are on it;
  - every lift end can be reached from the rest and can get back (tests/resorts.test.js fails otherwise);
  - runs reachable from a lift: at least 90% of run pieces (build_data's count) and connection check "unreachable"
    at most 5% of the shown runs;
  - dead ends (a run whose bottom leads to no lift) at most 5% of shown runs; uphill ski joins none;
  - runs drawn twice on the same ground ("doubled") at most 2, or 2% of the shown runs at a big resort;
  - lifts the build isolated by rule (not joined to the rest): at most one, a short one (under 1 km), not counting
    surface lifts under 150 m; more means an area is cut off;
  - runs that climb more than 12 m at most 3% of shown runs;
  - runs rated by guess (no rating in OpenStreetMap) at most 15% of the shown run length;
  - the resort's OpenStreetMap outline is not private (a members' club);
  - with a resort list (feed): no chair or gondola on it missing from the map.
Soft notes (shown in the table, do not hold): 30 m terrain, ratings not checked against the resort, rule-based
lift-end joins, automatic joins, runs raised by the steepness check.

--write sets or clears "hold" in each config and, for published mountains, writes
tests/fixtures/connections/<id>.json listing the connection problems the gate accepted (so tests/connections.test.js
fails on any new one after a rebuild). --table writes the batch table as Markdown.
"""
import json
import os
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, "tools"))


def load(p, default=None):
    return json.load(open(p)) if os.path.exists(p) else default


def connections(ids):
    with tempfile.TemporaryDirectory() as tmp:
        out = os.path.join(tmp, "c.json")
        subprocess.run([sys.executable, "tools/check_connections.py", *ids, "--quiet", "--json", out], cwd=ROOT,
                       capture_output=True)
        return load(out, {})


def judge(rid, conn):
    cfg = load(f"{ROOT}/tools/resorts/{rid}.json")
    res = load(f"{ROOT}/tools/bulk/results/{rid}.json", {})
    R = load(f"{ROOT}/public/data/{rid}/resort.json")
    osk = cfg.get("openskimap", {})
    row = {"id": rid, "name": cfg["name"], "region": cfg["region"], "seconds": res.get("first_build_seconds") or res.get("seconds"), "hold": [],
           "soft": [], "osk_lifts": osk.get("lifts"), "osk_runs": osk.get("runs")}
    for h in str(cfg.get("hold", "")).split("; "):
        if h.startswith("overlaps "):   # set by tools/bulk/run_batch.py: two maps of one place
            row["hold"].append(h)
    if res.get("failed") or not R:
        row["hold"].append("build stopped: " + (res.get("failed") or "no map").splitlines()[0][:120])
        return cfg, row
    shown = [t for t in R["trails"] if not t.get("hide")]
    lifts = [l for l in R["lifts"] if not l.get("hide")]
    row.update(lifts=len(lifts), runs=len(shown), named=len({t["name"] for t in shown if t.get("name")}),
               km=round(sum(t.get("len", 0) for t in shown) / 1000, 1))
    # a lift hidden by hand (official json "hide": checked by a person against the resort's own lift list, e.g. an
    # old chair still standing beside its replacement) counts as accounted for in the two lift checks
    by_hand = [l for l in R["lifts"] if str(l.get("hide", "")).startswith("hidden by hand")]
    have = {l.get("osm") for l in lifts + by_hand}
    want = cfg.get("include_ways", [])
    row["osk_lift_ids_on_map"] = [len([w for w in want if w in have]), len(want)]
    if osk.get("lifts") and len(lifts) + len(by_hand) < 0.8 * osk["lifts"]:
        row["hold"].append(f"lifts {len(lifts)} of OpenSkiMap's {osk['lifts']}")
    if want and len([w for w in want if w in have]) < 0.8 * len(want):
        row["hold"].append(f"only {len([w for w in want if w in have])} of the {len(want)} lifts OpenSkiMap assigns are on the map")
    if res.get("stuck_lift_ends"):
        row["hold"].append(f"{len(res['stuck_lift_ends'])} lift ends cut off: " + "; ".join(res["stuck_lift_ends"])[:200])
    a, b = res.get("reachable") or (0, 0)
    row["reachable"] = [a, b]
    if b and a < 0.9 * b:
        row["hold"].append(f"only {a} of {b} run pieces reachable from a lift")
    c = conn.get(rid, {})
    n = max(1, len(shown))
    row["conn"] = {k: len(c.get(k, [])) for k in ("unreachable", "dead_end", "outside_core", "lift_end", "uphill", "doubled")}
    if row["conn"]["unreachable"] > 0.05 * n:
        row["hold"].append(f"{row['conn']['unreachable']} runs no lift reaches")
    if row["conn"]["dead_end"] > 0.05 * n:
        row["hold"].append(f"{row['conn']['dead_end']} dead-end runs")
    if row["conn"]["uphill"]:
        row["hold"].append(f"{row['conn']['uphill']} uphill ski joins")
    if row["conn"]["doubled"] > max(2, 0.02 * n):
        row["hold"].append(f"{row['conn']['doubled']} runs drawn twice")
    if row["conn"]["outside_core"] or row["conn"]["lift_end"]:
        row["soft"].append(f"lift ends: {row['conn']['outside_core']} outside the network, {row['conn']['lift_end']} with no run")
    if (res.get("climbing_runs") or 0) > 0.03 * n:
        row["hold"].append(f"{res['climbing_runs']} runs climb more than 12 m")
    glen = sum(t.get("len", 0) for t in shown if t.get("u"))
    tlen = max(1, sum(t.get("len", 0) for t in shown))
    row["guess_pct"] = round(glen / tlen * 100)
    if glen > 0.15 * tlen:
        row["hold"].append(f"{row['guess_pct']}% of the run length has no rating in OpenStreetMap")
    if cfg.get("area_access") in ("private", "members"):   # "customers" means paying skiers: every resort
        row["hold"].append(f"the resort's outline is tagged access={cfg['area_access']} (a private club)")
    # (a lift hidden by the existence check is not on the map at all: Aspen Highlands' Five Trees, not the resort's)
    rule_iso = [l for l in R["lifts"] if not l.get("hide")
                and cfg.get("isolated_notes", {}).get(l["name"], "").startswith("rule: not joined")]
    big_iso = [l["name"] for l in rule_iso if l.get("kind") not in ("carpet", "surface") and l.get("len", 0) >= 150]
    if len(big_iso) >= 2 or any(l.get("len", 0) > 1000 for l in rule_iso):
        row["hold"].append("lifts not joined to the rest of the map (isolated by rule): " + ", ".join(big_iso)[:200])
    elif rule_iso:
        row["soft"].append("isolated by rule: " + ", ".join(l["name"] for l in rule_iso))
    if " club" in f" {cfg['name'].lower()}":
        row["hold"].append("the name says club: it may be private (members only); check before publishing")
    off = load(f"{ROOT}/tools/official/{rid}.json")
    if off:
        from official_ratings import missing_lifts, SURFACE_WORDS
        gone = [x for x in missing_lifts(off.get("lifts", []), [l["name"] for l in lifts]) if x not in off.get("lifts_explained", {})]
        big = [x for x in gone if not any(w in x.lower() for w in tuple(SURFACE_WORDS) + ("tapis", "fil-neige", "remonte-pente"))]
        if big:
            row["hold"].append("chairs or gondolas on the resort's list missing: " + ", ".join(big)[:200])
        row["ratings"] = "resort feed (" + (off.get("source") or "")[:40] + ")"
    else:
        row["ratings"] = "OpenStreetMap, not checked"
        row["soft"].append("ratings not checked against the resort")
    row["terrain_res"] = res.get("terrain_res")
    if (res.get("terrain_res") or 1) >= 30:
        row["soft"].append("30 m terrain")
    if res.get("rule_joins"):
        row["soft"].append(f"{len(res['rule_joins'])} lift ends joined by rule")
    if res.get("raised"):
        row["soft"].append(f"{res['raised']} runs raised by the steepness check")
    return cfg, row


CC = {"USA": "US", "Canada": "CA"}
GENERAL = {"CA": [{"phone": "911", "label": "Emergency services (police, fire, ambulance)", "tel": "911"}]}


def emergency(rows):
    """Every published mountain needs an entry in src/emergency.json (tests/emergency.test.js): its country only,
    so the SOS sheet shows the general numbers. A ski patrol number is never guessed: it is added by hand from the
    resort's own page (docs/ADDING_MOUNTAINS.md, "Emergency number"). Held mountains are not in the index, so their
    entry is removed (unless someone added a patrol number by hand)."""
    p = f"{ROOT}/src/emergency.json"
    d = json.load(open(p))
    for cc, nums in GENERAL.items():
        d["general"].setdefault(cc, nums)
    for r in rows:
        cfg = load(f"{ROOT}/tools/resorts/{r['id']}.json")
        cc = cfg.get("openskimap", {}).get("cc") or CC.get(cfg["region"].rsplit(", ", 1)[-1])
        e = d["resorts"].get(r["id"])
        if r["gate"] == "publish" and cc in d["general"]:
            if not e:
                d["resorts"][r["id"]] = {"country": cc, "checked": load(f"{ROOT}/tools/bulk/results/{r['id']}.json", {}).get("built", "")}
        elif e and not e.get("phone"):
            del d["resorts"][r["id"]]
    d["resorts"] = dict(sorted(d["resorts"].items()))
    json.dump(d, open(p, "w"), indent=1, ensure_ascii=False)


def main():
    a = sys.argv[1:]
    write, table = "--write" in a, None
    if "--table" in a:
        table = a[a.index("--table") + 1]
        a = [x for x in a if x != table]
    ids = [x for x in a if not x.startswith("--")]
    if not ids:
        ids = sorted(f[:-5] for f in os.listdir(f"{ROOT}/tools/resorts") if f.endswith(".json")
                     and load(f"{ROOT}/tools/resorts/{f}").get("auto"))
    built = [i for i in ids if os.path.exists(f"{ROOT}/public/data/{i}/resort.json")]
    conn = connections(built) if built else {}
    rows = []
    for rid in ids:
        cfg, row = judge(rid, conn)
        row["gate"] = "hold" if row["hold"] else "publish"
        rows.append(row)
        if write:
            path = f"{ROOT}/tools/resorts/{rid}.json"
            disk = load(path)
            if row["hold"]:
                disk["hold"] = "; ".join(row["hold"])
            else:
                disk.pop("hold", None)
            json.dump(disk, open(path, "w"), indent=1, ensure_ascii=False)
            open(path, "a").write("\n")
            fx = f"{ROOT}/tests/fixtures/connections/{rid}.json"
            if not row["hold"] and rid in conn:
                why = "automatic build: accepted by the quality gate (tools/bulk/gate.py) within its limits, not looked at by a person"
                out = {"checked": row.get("built") or "", "note": "problems tools/check_connections.py lists for this mountain "
                       "that are known and left, with the reason; tests/connections.test.js fails on any other"}
                for k in ("unreachable", "dead_end", "outside_core", "lift_end", "uphill", "doubled"):
                    out[k] = {p: why for p in conn[rid].get(k, [])}
                out["checked"] = load(f"{ROOT}/tools/bulk/results/{rid}.json", {}).get("built", "")
                json.dump(out, open(fx, "w"), indent=1, ensure_ascii=False)
                open(fx, "a").write("\n")
            elif os.path.exists(fx) and row["hold"]:
                os.remove(fx)
    if write:
        emergency(rows)
    pub = [r for r in rows if r["gate"] == "publish"]
    print(f"{len(pub)} of {len(rows)} publish, {len(rows) - len(pub)} held")
    for r in rows:
        if r["hold"]:
            print(f"  hold {r['id']}: {'; '.join(r['hold'])[:300]}")
    if table:
        L = ["| Resort | Region | Time (s) | Lifts (ours / OpenSkiMap) | Runs shown / named (OpenSkiMap runs) | Run pieces reachable | Ratings | Terrain | Gate | Why held / notes |",
             "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |"]
        for r in rows:
            reach = f"{r['reachable'][0]} / {r['reachable'][1]}" if r.get("reachable") and r["reachable"][1] else "-"
            L.append(f"| {r['name']} (`{r['id']}`) | {r['region']} | {r.get('seconds') or '-'} | {r.get('lifts', '-')} / {r['osk_lifts']} | "
                     f"{r.get('runs', '-')} / {r.get('named', '-')} ({r['osk_runs']}) | {reach} | {r.get('ratings', '-')} | "
                     f"{(str(r['terrain_res']) + ' m') if r.get('terrain_res') else '-'} | {r['gate']} | "
                     f"{'; '.join(r['hold'] + r['soft'])[:300]} |")
        open(table, "w").write("\n".join(L) + "\n")
    json.dump(rows, open(f"{ROOT}/tools/bulk/results/_gate.json", "w"), indent=1, ensure_ascii=False)


if __name__ == "__main__":
    main()
