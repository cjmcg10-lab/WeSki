#!/usr/bin/env python3
"""List new "Report a map mistake" entries from the live app, per resort.

  reports.py <id> [<id> ...]        one or more resorts
  reports.py --all                  every resort in public/data/index.json
  options:
    --since 2026-12-01              only reports sent on or after this date (ignores the last-seen marker)
    --everything                    show every report, old ones too (ignores the marker)
    --keep-marker                   do not move the last-seen marker forward after listing
    --json                          print the new reports as JSON instead of text
    --server URL                    another server (default https://skiwithme.builtbyroger.app)

The app sends a report to POST /api/reports; anyone can read a resort's list at GET /api/reports/<id> (newest first,
at most 500). Each report is {id, at (ms since 1970), kind, x, y (metres on that resort's map), ref (the run's OSM way
id or run number, when the spot was on a run), name, text, status}. This script turns the map position into a point
on OpenStreetMap, looks the run up in public/data/<id>/resort.json, and remembers per resort the highest report id
already listed in tools/.reports_seen.json (kept out of git), so the next run shows only new reports.
Outside requests use the User-Agent weski-build.
"""
import argparse, datetime, json, math, os, sys, urllib.error, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SERVER = "https://skiwithme.builtbyroger.app"
MARKER = os.path.join(ROOT, "tools", ".reports_seen.json")
KINDS = {"missing": "Run or lift missing", "not_real": "Not real / does not exist", "wrong_rating": "Wrong rating",
         "wrong_place": "In the wrong place", "closed_for_good": "Closed for good", "other": "Other"}


# ---------------------------------------------------------------- pure helpers (tested in tools/test_reports.py)
def _poly(c, a, b):
    v = [1, a, b, a * a, a * b, b * b, a ** 3, a * a * b, a * b * b, b ** 3]
    return sum(k * w for k, w in zip(c, v))


def map_to_lonlat(proj, x, y):
    """Metres on a resort's map -> (lon, lat), using the fitted polynomial stored in resort.json "proj"."""
    a, b = x - proj["xm"], y - proj["ym"]
    return proj["lon0"] + _poly(proj["clon"], a, b), proj["lat0"] + _poly(proj["clat"], a, b)


def osm_link(lon, lat, zoom=17):
    return f"https://www.openstreetmap.org/?mlat={lat:.5f}&mlon={lon:.5f}#map={zoom}/{lat:.5f}/{lon:.5f}"


def parse_day(s):
    """'2026-12-01' -> ms since 1970 at the start of that day (UTC)."""
    d = datetime.datetime.strptime(s, "%Y-%m-%d").replace(tzinfo=datetime.timezone.utc)
    return int(d.timestamp() * 1000)


def fmt_time(ms):
    return datetime.datetime.fromtimestamp(ms / 1000, datetime.timezone.utc).strftime("%Y-%m-%d %H:%M UTC")


def select_new(reports, last_id=0, since_ms=None):
    """Reports to show, oldest first: those after since_ms when given, otherwise those with an id above last_id."""
    if since_ms is not None:
        keep = [r for r in reports if (r.get("at") or 0) >= since_ms]
    else:
        keep = [r for r in reports if (r.get("id") or 0) > last_id]
    return sorted(keep, key=lambda r: r.get("id") or 0)


def next_marker(reports, shown, last_id=0):
    """The last-seen marker after listing `shown` out of `reports`. It moves past a report only when every report
    above the old marker up to it was listed, so a --since day later than the marker never skips unseen reports."""
    ids = {r.get("id") or 0 for r in shown}
    out = last_id
    for i in sorted(r.get("id") or 0 for r in reports):
        if i <= last_id:
            continue
        if i not in ids:
            break
        out = i
    return out


def _pts(f):
    p = f.get("pts") or []
    return [(p[i], p[i + 1]) for i in range(0, len(p) - 1, 2)]


def _seg_dist(p, a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]
    L = dx * dx + dy * dy
    t = 0 if L == 0 else max(0, min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L))
    return math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)


def dist_to_line(p, line):
    if len(line) == 1:
        return math.dist(p, line[0])
    return min((_seg_dist(p, a, b) for a, b in zip(line, line[1:])), default=float("inf"))


def find_feature(resort, ref, x=None, y=None, reach=60):
    """What a report refers to -> (kind 'run'|'lift', feature, how) or None.
    The app sends the run's OSM way id, or its run number when it has none; with no ref, the nearest run or lift
    within `reach` metres of the spot is given as a guess."""
    ref = str(ref or "").strip()
    if ref:
        for kind, key in (("run", "trails"), ("lift", "lifts")):
            for f in resort.get(key) or []:
                if f.get("osm") is not None and str(f["osm"]) == ref:
                    return kind, f, "osm"
        if ref.isdigit():
            for f in resort.get("trails") or []:
                if str(f.get("id")) == ref and f.get("osm") is None:
                    return "run", f, "number"
    if x is None or y is None:
        return None
    best = None
    for kind, key in (("run", "trails"), ("lift", "lifts")):
        for f in resort.get(key) or []:
            line = _pts(f)
            if not line:
                continue
            d = dist_to_line((x, y), line)
            if d <= reach and (best is None or d < best[0]):
                best = (d, kind, f)
    return (best[1], best[2], f"nearest, {best[0]:.0f} m") if best else None


def describe(report, resort=None):
    """One report -> dict of plain fields for printing."""
    out = {"id": report.get("id"), "when": fmt_time(report.get("at") or 0),
           "kind": KINDS.get(report.get("kind"), report.get("kind") or "?"), "note": report.get("text") or "",
           "status": report.get("status") or "open", "what": report.get("name") or "", "link": None}
    if resort:
        x, y = report.get("x"), report.get("y")
        if x is not None and y is not None and resort.get("proj"):
            lon, lat = map_to_lonlat(resort["proj"], x, y)
            out["link"] = osm_link(lon, lat)
        hit = find_feature(resort, report.get("ref"), x, y)
        if hit:
            kind, f, how = hit
            name = f.get("name") or "(no name)"
            out["what"] = f"{kind} {name} (osm {f.get('osm')}, {how})" if f.get("osm") else f"{kind} {name} ({how})"
    if not out["what"]:
        out["what"] = f"ref {report['ref']}" if report.get("ref") else "(not on a run)"
    return out


def format_report(d):
    lines = [f"  #{d['id']}  {d['when']}  {d['kind']}  [{d['status']}]", f"     about: {d['what']}"]
    if d["note"]:
        lines.append(f"     note:  {d['note']}")
    if d["link"]:
        lines.append(f"     map:   {d['link']}")
    return "\n".join(lines)


# ---------------------------------------------------------------- network and files
def fetch_json(url, timeout=30):
    """-> parsed JSON, or raises RuntimeError with a plain message."""
    req = urllib.request.Request(url, headers={"User-Agent": "weski-build", "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"server answered {e.code}") from e
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        raise RuntimeError(f"could not reach the server ({getattr(e, 'reason', e)})") from e
    except ValueError as e:
        raise RuntimeError("the server's answer was not JSON") from e


def load_json(path, default):
    try:
        with open(path) as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def main(argv=None):
    ap = argparse.ArgumentParser(description="List new map-mistake reports from the live app.")
    ap.add_argument("ids", nargs="*")
    ap.add_argument("--all", action="store_true", help="every resort in public/data/index.json")
    ap.add_argument("--since", help="YYYY-MM-DD: reports sent on or after this day")
    ap.add_argument("--everything", action="store_true", help="show old reports too")
    ap.add_argument("--keep-marker", action="store_true", help="do not update the last-seen marker")
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--server", default=SERVER)
    A = ap.parse_args(argv)
    ids = list(A.ids)
    if A.all:
        ids += [r["id"] for r in load_json(os.path.join(ROOT, "public", "data", "index.json"), [])]
    if not ids:
        ap.error("give resort ids or --all")
    since = parse_day(A.since) if A.since else (0 if A.everything else None)
    seen = load_json(MARKER, {})
    total, failed, out_json = 0, [], {}
    for rid in dict.fromkeys(ids):
        try:
            reports = fetch_json(f"{A.server.rstrip('/')}/api/reports/{rid}")
        except RuntimeError as e:
            failed.append(rid)
            print(f"{rid}: {e}", file=sys.stderr)
            continue
        if not isinstance(reports, list):
            failed.append(rid)
            print(f"{rid}: unexpected answer from the server", file=sys.stderr)
            continue
        new = select_new(reports, seen.get(rid, 0), since)
        if not A.keep_marker:
            seen[rid] = next_marker(reports, new, seen.get(rid, 0))
        if not new:
            if not A.json and len(ids) == 1:
                print(f"{rid}: no new reports ({len(reports)} in all)")
            continue
        resort = load_json(os.path.join(ROOT, "public", "data", rid, "resort.json"), None)
        rows = [describe(r, resort) for r in new]
        total += len(rows)
        if A.json:
            out_json[rid] = rows
            continue
        name = (resort or {}).get("name") or rid
        print(f"{name} ({rid}): {len(rows)} new of {len(reports)}" + ("" if resort else "  (no resort.json here: run maps_r2.mjs pull)"))
        for d in rows:
            print(format_report(d))
    if A.json:
        print(json.dumps(out_json, indent=1, ensure_ascii=False))
    elif len(ids) > 1:
        print(f"{total} new report(s) across {len(ids) - len(failed)} resort(s)" + (f"; {len(failed)} could not be read" if failed else ""))
    if not A.keep_marker:
        try:
            with open(MARKER, "w") as f:
                json.dump(seen, f, indent=1, sort_keys=True)
        except OSError as e:
            print(f"could not save the last-seen marker: {e}", file=sys.stderr)
    return 1 if failed and len(failed) == len(ids) else 0


if __name__ == "__main__":
    sys.exit(main())
