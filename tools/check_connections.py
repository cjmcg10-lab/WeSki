#!/usr/bin/env python3
"""Check how well a built map's runs and lifts are joined, the way directions use them.

usage: python3 tools/check_connections.py <id> [<id> ...] | --all  [--data DIR] [--json OUT] [--quiet]

Reads public/data/<id>/resort.json (its routing graph) and lists, per resort:
  a. unreachable  runs whose top no lift reaches (not even by skiing or walking from another lift's runs)
  b. dead end     runs whose bottom cannot get to any lift's bottom station (or the walking paths that lead to one)
  c. near miss    run ends joined to nothing that stop within 60 m of another run or a lift station
                  (the usual cause of a and b: the join is missing in OpenStreetMap; fix with config "links")
  d. overshoot    run ends that run on more than 45 m past the last run or lift they join, into nothing
  e. lift end     lift tops with no run to ski away on, lift bottoms no run comes down to (within 400 m of
                  links and walking paths)
  f. not in core  lift ends that directions cannot get to from the rest of the lifts, or back from
  g. long join    joins with no run or lift of their own longer than 150 m (ski) or 300 m (walk): made by
                  build_data's automatic joins or by config links; a wrong one sends directions through the woods
  h. uphill join  one-way ski joins whose far end is higher (more than 3 m, or 5% of the join): directions take a
                  ski join as free, so it would send a skier uphill (build_data turns these into walks since 2026-11)

How it moves, as src/routing.js does (normal tolerance), with no terrain loaded:
  - runs and links are skied downhill (graph edge a -> b); lifts go up; walking paths go both ways;
  - a run or link can also be climbed back where it is gentle (less than 15% grade, or a step of 2 m or less),
    and one route may climb at most 25 m on its own power (TOLERANCE.normal.cap);
  - runs and lifts hidden by the existence check are left out (directions never use them);
  - directions on a phone also cut across between runs closer than 70 m where the terrain allows
    (Router._addCrossings, needs the terrain): those moves are NOT counted here, so a near miss (c) can be
    something directions already manage. The rule is still to join it in the data when the resort joins it.
Lifts listed in the map's "isolated" (a stand-alone village tow) are not counted under e and f.

--json OUT writes {id: {"unreachable": [...], "dead_end": [...], "near": [...], "overshoot": [...],
"lift_end": [...], "outside_core": [...]}}: the test tests/connections.test.js compares it with the allow-list in
tests/fixtures/connections/<id>.json, so a rebuild cannot quietly add new problems.
Pure Python (no numpy), so it runs anywhere the tests run.
"""
import heapq
import json
import math
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CAP = 25.0          # metres a route may climb on its own (TOLERANCE.normal.cap)
GRADE = 0.15        # steeper than this is not climbed back (UP_BANDS[2] with mult Infinity beyond)
STEP = 2.0          # ...unless the whole climb is a step this high (JUNCTION_RISE)
PIECE = 40.0        # routing.js splits runs into pieces this long; the step rule applies per piece
NEAR = 60.0         # a loose run end this close to something else is a near miss
OVER = 45.0         # a loose run end this far past its last join is an overshoot (build_zones trims up to 45 m)
LINK_REACH = 400.0
LONG_SKI = 150.0    # a made-up ski join longer than this is listed (g) for a look
LONG_WALK = 300.0   # ...and a made-up walk longer than this  # how far along links and walking paths a lift end may be from a run


def climb_back(e, nodes):
    """Metres climbed going an edge backwards (b -> a), or None when routing.js would not offer it."""
    if e.get("bi"):
        return 0.0
    if e["k"] == "l":
        return None
    rise = nodes[e["a"]][2] - nodes[e["b"]][2]
    if rise <= 0:
        return 0.0
    ln = max(e.get("len") or 1.0, 1.0)
    g = rise / ln
    piece = rise if ln < PIECE * 1.5 else g * ln / round(ln / PIECE)
    if g < GRADE or piece <= STEP:
        return rise
    return None


def load(rid, data):
    R = json.load(open(os.path.join(data, rid, "resort.json")))
    g = R["graph"]
    nodes = g["nodes"]
    hide_t = {t["id"] for t in R["trails"] if t.get("hide")}
    hide_l = {i for i, l in enumerate(R["lifts"]) if l.get("hide")}
    edges = [e for e in g["edges"]
             if not ((e["k"] == "p" and e["r"] in hide_t) or (e["k"] == "l" and e["r"] in hide_l))]
    return R, nodes, edges


def graphs(nodes, edges):
    fwd = [[] for _ in nodes]
    rev = [[] for _ in nodes]
    for i, e in enumerate(edges):
        a, b = e["a"], e["b"]
        fwd[a].append((b, 0.0, i))
        rev[b].append((a, 0.0, i))
        c = climb_back(e, nodes)
        if c is not None:
            fwd[b].append((a, c, i))
            rev[a].append((b, c, i))
    return fwd, rev


def min_climb(adj, sources):
    """Least own-power climb from any source to every node (inf where none within the cap)."""
    best = [math.inf] * len(adj)
    h = []
    for s in sources:
        if best[s] > 0:
            best[s] = 0.0
            h.append((0.0, s))
    heapq.heapify(h)
    while h:
        c, u = heapq.heappop(h)
        if c > best[u]:
            continue
        for v, w, _ in adj[u]:
            d = c + w
            if d < best[v] and d <= CAP:
                best[v] = d
                heapq.heappush(h, (d, v))
    return best


def seg_dist(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    L = dx * dx + dy * dy
    t = 0.0 if L == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / L))
    return math.hypot(px - ax - t * dx, py - ay - t * dy)


class SegIndex:
    """Segments of the shown runs on a coarse grid, for 'what is near this point'."""

    def __init__(self, cell=60.0):
        self.cell, self.grid = cell, {}

    def add(self, pts, tag):
        for i in range(0, len(pts) - 2, 2):
            ax, ay, bx, by = pts[i], pts[i + 1], pts[i + 2], pts[i + 3]
            for gx in range(int(min(ax, bx) // self.cell), int(max(ax, bx) // self.cell) + 1):
                for gy in range(int(min(ay, by) // self.cell), int(max(ay, by) // self.cell) + 1):
                    self.grid.setdefault((gx, gy), []).append((ax, ay, bx, by, tag))

    def near(self, x, y, r):
        out = {}
        k = int(math.ceil(r / self.cell))
        cx, cy = int(x // self.cell), int(y // self.cell)
        for gx in range(cx - k, cx + k + 1):
            for gy in range(cy - k, cy + k + 1):
                for ax, ay, bx, by, tag in self.grid.get((gx, gy), ()):
                    d = seg_dist(x, y, ax, ay, bx, by)
                    if d <= r and d < out.get(tag, math.inf):
                        out[tag] = d
        return out


def check(rid, data):
    R, nodes, edges = load(rid, data)
    trails, lifts = R["trails"], R["lifts"]
    fwd, rev = graphs(nodes, edges)
    tname = lambda r: trails[r].get("name") or f"(unnamed run {r})"
    lname = lambda r: lifts[r].get("name") or f"(unnamed lift {r})"
    lone = set(R.get("isolated", []))

    lift_e = [e for e in edges if e["k"] == "l"]
    exits = {e["b"] for e in lift_e} | {e["a"] for e in lift_e if e.get("bi")}
    boards = {e["a"] for e in lift_e} | {e["b"] for e in lift_e if e.get("bi")}
    from_lift = min_climb(fwd, exits)
    to_lift = min_climb(rev, boards)

    by_run = {}
    for i, e in enumerate(edges):
        if e["k"] == "p":
            by_run.setdefault(e["r"], []).append(i)
    inc = [[] for _ in nodes]   # every shown edge touching a node
    for i, e in enumerate(edges):
        inc[e["a"]].append(i)
        inc[e["b"]].append(i)

    poi_n = {p["n"] for p in R.get("pois", []) if p["kind"] not in ("lift", "lifttop") and p.get("n", -1) >= 0}
    out = {k: [] for k in ("unreachable", "dead_end", "near", "overshoot", "lift_end", "outside_core", "long_join", "uphill")}
    detail = {k: [] for k in out}

    def note(kind, key, text):
        if key not in out[kind]:
            out[kind].append(key)
            detail[kind].append(text)

    # a, b: by run (grouped by name: one entry per named run, as people know it)
    for r, ids in sorted(by_run.items()):
        top = max((edges[i]["a"] for i in ids), key=lambda n: nodes[n][2])
        bot = min((edges[i]["b"] for i in ids), key=lambda n: nodes[n][2])
        L = round(trails[r].get("len", 0))
        if from_lift[top] == math.inf:
            note("unreachable", tname(r), f"{tname(r)} ({L} m)")
        if to_lift[bot] == math.inf:
            note("dead_end", tname(r), f"{tname(r)} ({L} m)")

    # c, d: loose run ends
    idx = SegIndex()
    for r, ids in by_run.items():
        for i in ids:
            idx.add(edges[i]["pts"], ("t", r))
    stations = []
    for e in lift_e:
        for end, n in (("base", e["a"]), ("top", e["b"])):
            stations.append((nodes[n][0], nodes[n][1], f"{lname(e['r'])} ({end})", n))
    for r, ids in sorted(by_run.items()):
        own = set(ids)
        deg = {}
        for i in ids:
            for n in (edges[i]["a"], edges[i]["b"]):
                deg[n] = deg.get(n, 0) + 1
        for n, k in deg.items():
            if k != 1 or any(j not in own for j in inc[n]):
                continue
            is_top = any(edges[i]["a"] == n for i in ids)
            where = "top" if is_top else "bottom"
            # what the loose end stops beside
            x, y = nodes[n][0], nodes[n][1]
            near = []
            for (kind, o), d in idx.near(x, y, NEAR).items():
                if o != r and trails[o].get("name") != trails[r].get("name"):
                    near.append((d, tname(o)))
            for sx, sy, sname, sn in stations:
                d = math.hypot(sx - x, sy - y)
                if d <= NEAR:
                    near.append((d, sname))
            # does this end matter for directions? (a loose top that is reached anyway, or a loose bottom that
            # gets away anyway, is a drawing detail, not a broken join)
            matters = (from_lift[n] == math.inf) if is_top else (to_lift[n] == math.inf)
            if near and matters:
                d, what = min(near)
                note("near", f"{tname(r)} {where}", f"{tname(r)} {where} stops {d:.0f} m from {what} without joining it")
            # walk the run's own chain to its first join
            seen, cur, run_len, joined = {n}, n, 0.0, None
            while True:
                nxt = [i for i in inc[cur] if i in own and (edges[i]["a"] not in seen or edges[i]["b"] not in seen)]
                if not nxt:
                    break
                e = edges[nxt[0]]
                run_len += e.get("len", 0)
                cur = e["b"] if e["a"] == cur else e["a"]
                seen.add(cur)
                others = [j for j in inc[cur] if j not in own and not (edges[j]["k"] == "w" and
                          (edges[j]["a"] in poi_n or edges[j]["b"] in poi_n))]
                if others:
                    joined = others
                    break
            if joined and run_len > OVER and deg.get(cur, 0) >= 2:
                names = set()
                for j in joined:
                    o = edges[j]
                    names.add(tname(o["r"]) if o["k"] == "p" else lname(o["r"]) if o["k"] == "l"
                              else "a walking path" if o["k"] == "w" else "a link")
                note("overshoot", f"{tname(r)} {where}",
                     f"{tname(r)} {where} runs on {run_len:.0f} m past where it joins {', '.join(sorted(names))}")

    # e: lift ends with no run
    def link_reach(start, adj):
        """Nodes within LINK_REACH metres of start along links and walking paths (no runs, no lifts)."""
        best, h = {start: 0.0}, [(0.0, start)]
        while h:
            d, u = heapq.heappop(h)
            if d > best[u]:
                continue
            for v, _, i in adj[u]:
                e = edges[i]
                if e["k"] not in ("x", "w"):
                    continue
                nd = d + e.get("len", 0)
                if nd <= LINK_REACH and nd < best.get(v, math.inf):
                    best[v] = nd
                    heapq.heappush(h, (nd, v))
        return best

    for e in lift_e:
        if e["r"] in lone:
            continue
        top_ok = any(edges[i]["k"] == "p" for n in link_reach(e["b"], fwd) for i in inc[n])
        bot_ok = any(edges[i]["k"] == "p" for n in link_reach(e["a"], rev) for i in inc[n])
        if e.get("bi"):
            top_ok = top_ok or bot_ok
            bot_ok = top_ok
        if not top_ok:
            note("lift_end", f"{lname(e['r'])} (top)", f"{lname(e['r'])} (top): no run to ski away on")
        if not bot_ok:
            note("lift_end", f"{lname(e['r'])} (base)", f"{lname(e['r'])} (base): no run comes down to it")

    # f: lift ends that directions cannot join to the rest
    ends = []
    for e in lift_e:
        if e["r"] in lone:
            continue
        ends.append((f"{lname(e['r'])} (base)", e["a"]))
        ends.append((f"{lname(e['r'])} (top)", e["b"]))
    ends = list(dict.fromkeys(ends))
    if ends:
        nodes_e = [n for _, n in ends]
        reach = {n: min_climb(fwd, [n]) for n in set(nodes_e)}
        back = {n: min_climb(rev, [n]) for n in set(nodes_e)}
        hub = max(set(nodes_e), key=lambda h: sum(reach[h][m] < math.inf and back[h][m] < math.inf for m in nodes_e))
        for name, n in ends:
            to, fro = reach[hub][n] < math.inf, back[hub][n] < math.inf
            if not (to and fro):
                why = "cannot be reached from the other lifts" if not to else ""
                why += (" and " if why else "") + ("cannot get back to the other lifts" if not fro else "")
                note("outside_core", name, f"{name}: {why}")
    # g: long joins the build made (links and walks with no run or lift of their own): worth a look on the map
    def at(n):
        names = sorted({tname(edges[i]["r"]) if edges[i]["k"] == "p" else lname(edges[i]["r"])
                        for i in inc[n] if edges[i]["k"] in ("p", "l")})
        return " / ".join(names[:2]) or "a walking path"
    for e in edges:
        if e["r"] != -1 or e["a"] in poi_n or e["b"] in poi_n:
            continue
        L = e.get("len", 0)
        if (e["k"] == "x" and L > LONG_SKI) or (e["k"] == "w" and L > LONG_WALK):
            how = "ski" if e["k"] == "x" else "walk"
            note("long_join", f"{at(e['a'])} -> {at(e['b'])}", f"{how} {L:.0f} m: {at(e['a'])} -> {at(e['b'])}")
    # h: one-way ski joins that climb: directions take a ski join as free, so these let a route ski uphill
    for e in edges:
        if e["k"] != "x" or e.get("bi"):
            continue
        rise = nodes[e["b"]][2] - nodes[e["a"]][2]
        L = max(e.get("len", 0), 1.0)
        if rise > max(3.0, 0.05 * L) + 2:   # 2 m of slack: node heights are rounded and joins can be re-cut
            note("uphill", f"{at(e['a'])} -> {at(e['b'])}", f"climbs {rise:.0f} m in {L:.0f} m: {at(e['a'])} -> {at(e['b'])}")
    shown = {r for r in by_run}
    stats = {"runs": len(shown), "lifts": len({e["r"] for e in lift_e}),
             "pieces": sum(len(v) for v in by_run.values())}
    return out, detail, stats


def all_ids(data):
    return sorted(d for d in os.listdir(data) if os.path.exists(os.path.join(data, d, "resort.json")))


TITLES = {"unreachable": "a. runs no lift reaches", "dead_end": "b. runs that lead nowhere (no way to a lift)",
          "near": "c. loose run ends close to something (missing join?)", "overshoot": "d. run ends past their last join",
          "lift_end": "e. lift ends with no run", "outside_core": "f. lift ends outside the connected network",
          "long_join": "g. long joins made by the build or the config (check them on the map)",
          "uphill": "h. one-way ski joins that climb (directions would ski uphill)"}


def main():
    a = sys.argv[1:]
    data, js, quiet, ids = os.path.join(ROOT, "public", "data"), None, False, []
    i = 0
    while i < len(a):
        if a[i] == "--data":
            data = a[i + 1]; i += 1
        elif a[i] == "--json":
            js = a[i + 1]; i += 1
        elif a[i] == "--quiet":
            quiet = True
        elif a[i] == "--all":
            ids = all_ids(data)
        elif a[i].startswith("-"):
            raise SystemExit(__doc__)
        else:
            ids.append(a[i])
        i += 1
    if not ids:
        raise SystemExit(__doc__)
    res, rows = {}, []
    for rid in ids:
        out, detail, stats = check(rid, data)
        res[rid] = out
        rows.append((rid, stats, {k: len(v) for k, v in out.items()}))
        if quiet:
            continue
        print(f"\n== {rid}: {stats['runs']} runs, {stats['lifts']} lifts")
        if not any(out.values()):
            print("   everything joined")
        for k, t in TITLES.items():
            if detail[k]:
                print(f"   {t} ({len(detail[k])}):")
                for d in detail[k]:
                    print(f"      {d}")
    print("\nresort                  runs lifts  unreach deadend   near  over liftend core longjoin uphill")
    for rid, s, c in rows:
        print(f"{rid:22s} {s['runs']:5d} {s['lifts']:5d}  {c['unreachable']:7d} {c['dead_end']:7d} {c['near']:6d}"
              f" {c['overshoot']:5d} {c['lift_end']:7d} {c['outside_core']:4d} {c['long_join']:8d} {c['uphill']:6d}")
    if js:
        json.dump(res, open(js, "w"), indent=1, ensure_ascii=False)


if __name__ == "__main__":
    main()
