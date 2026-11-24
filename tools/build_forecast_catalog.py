#!/usr/bin/env python3
import argparse
import gzip
import json
import math
import os
import random
import sys
import unicodedata
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor

FIELDS = ["id", "name", "aliases", "towns", "region", "cc", "lat", "lon", "baseLat", "baseLon", "top", "base", "tz", "flags"]
F_TOP_MISSING, F_BASE_MISSING, F_APPROX, F_HAS_MAP, F_STATUS_UNKNOWN = 1, 2, 4, 8, 16
SECTOR_LINK_M = 1500
MAX_SECTORS = 8
FOLD_RADIUS_M = 5000
SAME_NAME_FOLD_RADIUS_M = 15000
MAX_ALIASES = 8
VERTICAL_MIN_M, VERTICAL_MAX_M = 5, 2800
DEM_TOLERANCE_M = 150
DEM_URL = "/vsicurl/https://copernicus-dem-30m.s3.amazonaws.com/{t}/{t}.tif"
SKIP_LIFT_TYPES = {"railway"}
LIVE_STATUSES = {"operating", None}
STOP_WORDS = {"ski", "resort", "area", "mountain", "mount", "mt", "the", "and", "de", "du", "des", "la", "le", "les", "ski-gebiet", "skigebiet", "snowpark", "station", "stn"}
COUNTRY_NAMES = {"USA": "United States", "UK": "United Kingdom"}
SOUTH_AMERICA = {"AR", "BO", "BR", "CL", "CO", "EC", "GY", "PE", "PY", "SR", "UY", "VE", "FK"}


def fold(text):
    return "".join(c for c in unicodedata.normalize("NFKD", text.lower()) if not unicodedata.combining(c))


def tokens(text):
    cleaned = "".join(c if c.isalnum() else " " for c in fold(text))
    return {t for t in cleaned.split() if t not in STOP_WORDS}


def has_latin(text):
    return any("a" <= c.lower() <= "z" for c in text)


def metres(lat1, lon1, lat2, lon2):
    dy = (lat2 - lat1) * 111_320
    dx = (lon2 - lon1) * 111_320 * math.cos(math.radians((lat1 + lat2) / 2))
    return math.hypot(dx, dy)


def name_pieces(raw):
    pieces = []
    for part in raw.replace(" / ", ", ").replace("; ", ", ").split(", "):
        part = part.strip()
        if "(" in part and part.endswith(")"):
            head, _, inner = part.rpartition("(")
            pieces += [head.strip(), inner.rstrip(")").strip()]
        else:
            pieces.append(part)
    seen, out = set(), []
    for piece in pieces:
        key = fold(piece)
        if piece and key not in seen:
            seen.add(key)
            out.append(piece)
    return out


def split_names(raw):
    pieces = name_pieces(raw)
    primary = next((p for p in pieces if has_latin(p)), pieces[0])
    return primary, [p for p in pieces if p != primary][:6]


def load_areas(path):
    areas = {}
    for f in json.load(open(path, encoding="utf-8"))["features"]:
        p = f["properties"]
        if "downhill" not in p["activities"] or p["status"] not in LIVE_STATUSES or not p["name"]:
            continue
        areas[p["id"]] = p
    return areas


def stream_lifts(path, area_ids):
    lifts, towns = defaultdict(list), defaultdict(Counter)
    for line in open(path, encoding="utf-8"):
        line = line.strip().rstrip(",")
        if not line.startswith('{"type":"Feature"'):
            continue
        f = json.loads(line)
        p = f["properties"]
        if p["status"] not in LIVE_STATUSES or p["liftType"] in SKIP_LIFT_TYPES:
            continue
        coords = f["geometry"]["coordinates"]
        a, b = coords[0], coords[-1]
        if len(a) < 3 or len(b) < 3 or a[2] is None or b[2] is None:
            continue
        low, high = (a, b) if a[2] <= b[2] else (b, a)
        for area in p["skiAreas"]:
            aid = area["properties"]["id"]
            if aid not in area_ids:
                continue
            lifts[aid].append(((low[1], low[0], low[2]), (high[1], high[0], high[2])))
            for place in p["places"]:
                town = place["localized"].get("en", {}).get("locality")
                if town:
                    towns[aid][town] += 1
    return lifts, towns


def sectors_of(lifts):
    parent = list(range(len(lifts)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    ends = [(i, pt) for i, (low, high) in enumerate(lifts) for pt in (low, high)]
    ends.sort(key=lambda e: e[1][0])
    for x, (i, a) in enumerate(ends):
        for j, b in ends[x + 1:]:
            if (b[0] - a[0]) * 111_320 > SECTOR_LINK_M:
                break
            if find(i) != find(j) and metres(a[0], a[1], b[0], b[1]) <= SECTOR_LINK_M:
                parent[find(i)] = find(j)
    groups = defaultdict(list)
    for i, lift in enumerate(lifts):
        groups[find(i)].append(lift)
    out = []
    for group in groups.values():
        base = min((low for low, _ in group), key=lambda p: p[2])
        top = max((high for _, high in group), key=lambda p: p[2])
        out.append({"base": base, "top": top, "lifts": len(group), "vertical": sum(h[2] - l[2] for l, h in group)})
    out.sort(key=lambda s: (-s["vertical"], -s["lifts"]))
    return out


def run_elevations(stats):
    downhill = stats.get("runs", {}).get("byActivity", {}).get("downhill", {}).get("byDifficulty", {})
    lows = [d["minElevation"] for d in downhill.values() if d.get("minElevation") is not None]
    highs = [d["maxElevation"] for d in downhill.values() if d.get("maxElevation") is not None]
    return (min(lows), max(highs)) if lows and highs else (None, None)


def point(p):
    return {"lat": round(p[0], 4), "lon": round(p[1], 4), "elev": round(p[2])}


def area_record(area, lifts, towns):
    primary, aliases = split_names(area["name"])
    first = area["places"][0] if area["places"] else {"localized": {"en": {}}, "iso3166_1Alpha2": None}
    place = first["localized"].get("en", {})
    cc = first["iso3166_1Alpha2"]
    centre = area["viewportHint"]["center"]
    rec = {
        "id": "osd-" + area["id"][:36], "osd": area["id"], "name": primary, "aliases": aliases,
        "towns": [t for t, _ in towns.most_common(3)] or ([place["locality"]] if place.get("locality") else []),
        "region": place.get("region") or "", "country": place.get("country") or "", "cc": cc,
        "lat": round(centre[1], 3), "lon": round(centre[0], 3), "hasMap": False,
        "flags": [], "sectors": [], "src": {}, "status": area["status"],
        "website": (area.get("websites") or [None])[0],
    }
    if area["status"] is None:
        rec["flags"].append("status_unknown")
    if lifts:
        secs = sectors_of(lifts)
        main = secs[0]
        rec["base"], rec["top"] = point(main["base"]), point(main["top"])
        rec["src"] = {"base": "lifts", "top": "lifts"}
        rec["sectors"] = [
            {"base": point(s["base"]), "top": point(s["top"]), "lifts": s["lifts"]}
            for s in secs[:MAX_SECTORS] if s["lifts"] >= 2 or s is main
        ]
        if len(rec["sectors"]) < 2:
            rec["sectors"] = []
        return rec
    low, high = run_elevations(area["statistics"])
    centre_pt = {"lat": rec["lat"], "lon": rec["lon"]}
    rec["flags"] += ["no_lifts", "approximate_points"]
    rec["base"] = {**centre_pt, "elev": round(low) if low is not None else None}
    rec["top"] = {**centre_pt, "elev": round(high) if high is not None else None}
    rec["src"] = {"base": "runs" if low is not None else "none", "top": "runs" if high is not None else "none"}
    return rec


def best_match(built, records):
    built_tokens = tokens(built["name"])
    best = None
    for rec in records:
        near = min(
            metres(built["lat"], built["lon"], p["lat"], p["lon"])
            for p in (rec["base"], rec["top"], {"lat": rec["lat"], "lon": rec["lon"]}) if p
        )
        if near > 15_000:
            continue
        candidate_tokens = set().union(*(tokens(n) for n in [rec["name"], *rec["aliases"]]))
        shared = len(built_tokens & candidate_tokens)
        sim = shared / min(len(built_tokens), len(tokens(rec["name"]))) if built_tokens and tokens(rec["name"]) else 0
        if shared == 0:
            continue
        key = (round(sim, 2), len(rec["sectors"]) or (rec["src"].get("base") == "lifts"), -near)
        if best is None or key > best[0]:
            best = (key, rec, near, sim)
    return best


def host_of(url):
    return fold(url or "").replace("https://", "").replace("http://", "").replace("www.", "").split("/")[0]


def all_names(rec):
    return [rec["name"], *rec["aliases"]]


def fold_liftless(records):
    lifted = [r for r in records if r["src"].get("base") == "lifts"]
    folded = {}
    for rec in records:
        if "no_lifts" not in rec["flags"]:
            continue
        own_tokens = set().union(*(tokens(n) for n in all_names(rec)))
        best = None
        for other in lifted:
            if abs(other["lat"] - rec["lat"]) * 111_320 > SAME_NAME_FOLD_RADIUS_M:
                continue
            near = min(metres(rec["lat"], rec["lon"], p["lat"], p["lon"]) for p in (other["base"], other["top"], other))
            same_name = {fold(n) for n in all_names(rec)} & {fold(n) for n in all_names(other)}
            if near > (SAME_NAME_FOLD_RADIUS_M if same_name else FOLD_RADIUS_M):
                continue
            shared = len(own_tokens & set().union(*(tokens(n) for n in all_names(other))))
            same_site = bool(rec["website"]) and host_of(rec["website"]) == host_of(other["website"])
            if not shared and not same_site:
                continue
            key = (shared + (2 if same_site else 0), -near)
            if best is None or key > best[0]:
                best = (key, other)
        if best:
            target = best[1]
            known = {fold(n) for n in all_names(target)}
            for name in all_names(rec):
                if fold(name) not in known:
                    known.add(fold(name))
                    target["aliases"].append(name)
            target["aliases"] = target["aliases"][:MAX_ALIASES]
            folded[rec["id"]] = target["id"]
    return [r for r in records if r["id"] not in folded], folded


def merge_built(records, built_rows):
    by_id = {r["id"]: r for r in records}
    absorbed, report, folds = set(), [], {}
    for row in built_rows:
        # (a built resort is never matched to, or folded into, another built one: with the 2026-11-23 data Aspen
        # Snowmass took in Aspen Mountain's entry)
        match = best_match(row, [r for r in by_id.values() if r["id"] not in absorbed and not r.get("hasMap")])
        rec = {
            "id": row["id"], "osd": None, "name": row["name"], "aliases": [], "towns": [], "region": "", "country": "",
            "cc": None, "lat": round(row["lat"], 3), "lon": round(row["lon"], 3), "hasMap": True, "flags": [],
            "sectors": [], "status": None, "website": None,
            "base": {"lat": round(row["baseLat"], 4), "lon": round(row["baseLon"], 4), "elev": round(row["base"])},
            "top": {"lat": round(row["lat"], 4), "lon": round(row["lon"], 4), "elev": round(row["top"])},
            "src": {"base": "built", "top": "built"}, "tz": row["tz"],
        }
        if match:
            _, area, near, sim = match
            absorbed.add(area["id"])
            folds[area["id"]] = row["id"]
            rec.update(osd=area["osd"], aliases=[a for a in area["aliases"] + [area["name"]] if fold(a) != fold(row["name"])][:6],
                       towns=area["towns"], region=area["region"], country=area["country"], cc=area["cc"],
                       website=area["website"], sectors=area["sectors"])
            for other in by_id.values():
                if other["id"] in absorbed or other.get("hasMap") or metres(area["lat"], area["lon"], other["lat"], other["lon"]) > 6_000:
                    continue
                other_sim = len(tokens(other["name"]) & tokens(row["name"])) / max(1, min(len(tokens(other["name"])), len(tokens(row["name"]))))
                if other_sim >= 0.99 and tokens(other["name"]):
                    absorbed.add(other["id"])
                    folds[other["id"]] = row["id"]
                    rec["aliases"] = (rec["aliases"] + [other["name"]])[:6]
            report.append((row["id"], area["name"], round(near), round(sim, 2)))
        else:
            tail = row["region"].rsplit(", ", 1)
            rec["region"], rec["country"] = (tail[0], COUNTRY_NAMES.get(tail[-1], tail[-1])) if len(tail) == 2 else ("", row["region"])
            rec["flags"].append("no_osd_match")
            report.append((row["id"], None, None, 0))
        by_id[row["id"]] = rec
    return [r for r in by_id.values() if r["id"] not in absorbed], report, folds


def attach_zones(records):
    from timezonefinder import TimezoneFinder
    finder = TimezoneFinder()
    for rec in records:
        if rec.get("tz"):
            continue
        p = rec["base"] or {"lat": rec["lat"], "lon": rec["lon"]}
        rec["tz"] = finder.timezone_at(lat=p["lat"], lng=p["lon"]) or finder.timezone_at(lat=rec["lat"], lng=rec["lon"])
        if not rec["tz"]:
            rec["flags"].append("no_time_zone")


def tile_name(lat, lon):
    la, lo = math.floor(lat), math.floor(lon)
    return f"Copernicus_DSM_COG_10_{'N' if la >= 0 else 'S'}{abs(la):02d}_00_{'E' if lo >= 0 else 'W'}{abs(lo):03d}_00_DEM"


def sample_tile(tile, pts):
    import rasterio
    out = {}
    error = None
    try:
        with rasterio.Env(GDAL_HTTP_USERAGENT="weski-build", GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif"):
            with rasterio.open(DEM_URL.format(t=tile)) as ds:
                for key, lat, lon in pts:
                    v = float(next(ds.sample([(lon, lat)]))[0])
                    out[key] = None if v == ds.nodata or v < -500 else round(v)
    except Exception as exc:
        error = f"{tile}: {type(exc).__name__}"
        out = {}
    return out, error


def coord_key(lat, lon):
    return f"{lat:.4f},{lon:.4f}"


def dem_elevations(wanted, cache_path):
    cache = json.load(open(cache_path)) if cache_path and os.path.exists(cache_path) else {}
    todo = defaultdict(dict)
    for _, lat, lon in wanted:
        ck = coord_key(lat, lon)
        if ck not in cache:
            todo[tile_name(lat, lon)][ck] = (ck, lat, lon)
    errors = []
    with ThreadPoolExecutor(8) as pool:
        for result, error in pool.map(lambda kv: sample_tile(kv[0], list(kv[1].values())), todo.items()):
            cache.update(result)
            if error:
                errors.append(error)
    if errors:
        print(f"WARNING: {len(errors)} of {len(todo)} elevation tiles failed and were not cached: {', '.join(errors[:5])}", file=sys.stderr)
    if cache_path:
        json.dump(cache, open(cache_path, "w"))
    return {k: cache.get(coord_key(lat, lon)) for k, lat, lon in wanted}


def vertical_bad(rec):
    b, t = rec["base"], rec["top"]
    if not b or not t or b["elev"] is None or t["elev"] is None:
        return False
    return not VERTICAL_MIN_M <= t["elev"] - b["elev"] <= VERTICAL_MAX_M


def cross_check(records, cache_path, audit, seed):
    approx = lambda r: "approximate_points" in r["flags"]
    flagged = [r for r in records if not r["hasMap"] and (vertical_bad(r) or any(r[k]["elev"] is None for k in ("base", "top")))]
    flagged_ids = {r["id"] for r in flagged}
    lifted = [r for r in records if not r["hasMap"] and r["src"]["base"] == "lifts" and r["id"] not in flagged_ids]
    sample = random.Random(seed).sample(lifted, min(audit, len(lifted)))
    wanted = []
    for rec in flagged + sample:
        for role in ("base", "top"):
            p = rec[role]
            if approx(rec) and (role == "top" or p["elev"] is not None):
                continue
            wanted.append((f"{rec['id']}:{role}", p["lat"], p["lon"]))
    dem = dem_elevations(wanted, cache_path)
    stats = Counter()
    for rec in flagged + sample:
        for role in ("base", "top"):
            key = f"{rec['id']}:{role}"
            if key not in dem:
                continue
            p, v = rec[role], dem[key]
            if v is None:
                stats["dem_unavailable"] += 1
                rec["flags"].append(f"{role}_dem_unavailable")
            elif p["elev"] is None:
                p["elev"] = v
                rec["src"][role] = "glo30"
                stats["filled"] += 1
            elif abs(p["elev"] - v) > DEM_TOLERANCE_M:
                rec.setdefault("dem", {})[role] = {"was": p["elev"], "glo30": v}
                p["elev"] = v
                rec["src"][role] = "glo30"
                rec["flags"].append(f"{role}_corrected")
                stats["corrected"] += 1
            else:
                rec.setdefault("dem", {})[role] = {"glo30": v}
                rec["src"][role] = "lifts+glo30"
                stats["agreed"] += 1
        if vertical_bad(rec):
            rec["flags"].append("vertical_questionable")
            stats["vertical_questionable"] += 1
    stats["checked_resorts"] = len(flagged) + len(sample)
    stats["audit_sample"] = len(sample)
    return stats


def flag_bits(rec):
    bits = 0
    if rec["top"]["elev"] is None:
        bits |= F_TOP_MISSING
    if rec["base"]["elev"] is None:
        bits |= F_BASE_MISSING
    if "approximate_points" in rec["flags"]:
        bits |= F_APPROX
    if rec["hasMap"]:
        bits |= F_HAS_MAP
    if "status_unknown" in rec["flags"]:
        bits |= F_STATUS_UNKNOWN
    return bits


def continent(rec):
    prefix = (rec.get("tz") or "").split("/")[0]
    if prefix == "America":
        return "South America" if rec["cc"] in SOUTH_AMERICA else "North America"
    return {"Europe": "Europe", "Asia": "Asia", "Australia": "Oceania", "Pacific": "Oceania", "Africa": "Africa", "Atlantic": "Europe", "Antarctica": "Antarctica"}.get(prefix, "Unknown")


def resolve_folds(folds, ids):
    resolved = {}
    for old, new in folds.items():
        while new in folds:
            new = folds[new]
        if new in ids and new != old:
            resolved[old] = new
    return resolved


def check_published_ids(path, ids, aliases, allow_loss):
    previous = json.load(open(path)) if os.path.exists(path) else {"ids": [], "id_aliases": {}}
    manual = previous.get("id_aliases", {})
    for old, new in manual.items():
        if new not in ids:
            sys.exit(f"id_aliases in {path} points {old} at {new}, which is not in the catalog")
    merged = {**aliases, **manual}
    lost = sorted(i for i in previous["ids"] if i not in ids and i not in merged)
    if lost:
        message = f"{len(lost)} previously published ids are gone and have no id_aliases entry: {', '.join(lost[:10])}"
        if not allow_loss:
            sys.exit(f"{message}. Add them to id_aliases in {path} or pass --allow-id-loss")
        print(f"WARNING: {message}", file=sys.stderr)
    json.dump({"ids": sorted(ids), "id_aliases": manual}, open(path, "w"), indent=0, ensure_ascii=False)
    return {old: new for old, new in merged.items() if old not in ids}


def write_outputs(records, out, source, id_aliases):
    detail_dir = os.path.join(out, "detail")
    os.makedirs(detail_dir, exist_ok=True)
    for stale in os.listdir(detail_dir):
        os.remove(os.path.join(detail_dir, stale))
    records.sort(key=lambda r: r["id"])
    zones = sorted({r["tz"] for r in records if r["tz"]})
    zone_ix = {z: i for i, z in enumerate(zones)}
    countries = {r["cc"]: r["country"] for r in records if r["cc"]}
    rows = []
    for r in records:
        b, t = r["base"], r["top"]
        rows.append([
            r["id"], r["name"], r["aliases"], r["towns"], r["region"], r["cc"], t["lat"], t["lon"],
            b["lat"], b["lon"], t["elev"], b["elev"], zone_ix.get(r["tz"]), flag_bits(r),
        ])
    index = {"v": 1, "source": source, "fields": FIELDS, "countries": countries, "tz": zones, "idAliases": dict(sorted(id_aliases.items())), "rows": rows}
    index_path = os.path.join(out, "catalog-index.json")
    json.dump(index, open(index_path, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    shards = defaultdict(dict)
    for r in records:
        shards[r["cc"] or "XX"][r["id"]] = {
            "osd": r["osd"], "status": r["status"], "website": r["website"], "flags": r["flags"], "src": r["src"],
            "base": r["base"], "top": r["top"], "sectors": r["sectors"], **({"dem": r["dem"]} if r.get("dem") else {}),
        }
    for cc, data in shards.items():
        json.dump(data, open(os.path.join(out, "detail", f"{cc}.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    return index_path


def gz_size(path):
    return len(gzip.compress(open(path, "rb").read(), 9))


def main():
    ap = argparse.ArgumentParser(description="Build the worldwide Forecast resort catalog from OpenSkiData (ski_areas.geojson and lifts.geojson) plus public/data/index.json")
    ap.add_argument("--areas", required=True, help="OpenSkiData ski_areas.geojson")
    ap.add_argument("--lifts", required=True, help="OpenSkiData lifts.geojson")
    ap.add_argument("--index", default="public/data/index.json", help="the built resorts")
    ap.add_argument("--out", default="public/forecast")
    ap.add_argument("--data-date", required=True, help="OpenSkiData dataTimestamp date, YYYY-MM-DD (tiles.openskimap.org/metadata.json)")
    ap.add_argument("--dem-cache", help="JSON file that keeps Copernicus GLO-30 samples between runs")
    ap.add_argument("--no-dem", action="store_true", help="skip the Copernicus GLO-30 cross-check")
    ap.add_argument("--audit", type=int, default=150, help="extra resorts whose lift elevations are checked against GLO-30 as a random sample")
    ap.add_argument("--seed", type=int, default=4)
    ap.add_argument("--ids-file", default="tools/forecast_catalog_ids.json", help="published ids and manual id_aliases {old: new}")
    ap.add_argument("--allow-id-loss", action="store_true", help="only print a warning when a published id disappears")
    args = ap.parse_args()

    areas = load_areas(args.areas)
    lifts, towns = stream_lifts(args.lifts, set(areas))
    records = [area_record(a, lifts.get(aid, []), towns.get(aid, Counter())) for aid, a in areas.items()]
    ids = [r["id"] for r in records]
    if len(set(ids)) != len(ids):
        sys.exit("duplicate catalog ids after prefixing")
    built_rows = json.load(open(args.index, encoding="utf-8"))
    records, liftless_folds = fold_liftless(records)
    records, matches, built_folds = merge_built(records, built_rows)
    final_ids = {r["id"] for r in records}
    id_aliases = check_published_ids(args.ids_file, final_ids, resolve_folds({**liftless_folds, **built_folds}, final_ids), args.allow_id_loss)
    attach_zones(records)
    stats = Counter() if args.no_dem else cross_check(records, args.dem_cache, args.audit, args.seed)
    source = {
        "name": "OpenSkiData / OpenSkiMap.org", "url": "https://openskidata.org", "licence": "ODbL 1.0 (OpenStreetMap contributors), Skimap.org",
        "dataDate": args.data_date, "elevationCheck": "Copernicus GLO-30", "timeZones": "timezonefinder 9.2.0",
    }
    path = write_outputs(records, args.out, source, id_aliases)

    both = sum(1 for r in records if r["src"]["base"] in ("lifts", "lifts+glo30", "glo30", "built") and r["src"]["top"] in ("lifts", "lifts+glo30", "glo30", "built") and "approximate_points" not in r["flags"])
    summary = {
        "resorts": len(records), "built": sum(r["hasMap"] for r in records), "byContinent": Counter(continent(r) for r in records),
        "bothPointsFromMappedLifts": both, "withSectors": sum(1 for r in records if r["sectors"]),
        "missingTop": sum(1 for r in records if r["top"]["elev"] is None), "missingBase": sum(1 for r in records if r["base"]["elev"] is None),
        "approximatePoints": sum(1 for r in records if "approximate_points" in r["flags"]), "noTimeZone": sum(1 for r in records if not r["tz"]),
        "indexBytes": os.path.getsize(path), "indexGzipBytes": gz_size(path), "demCheck": dict(stats),
        "builtMatches": matches, "foldedLiftless": len(liftless_folds), "idAliases": len(id_aliases),
    }
    detail_dir = os.path.join(args.out, "detail")
    summary["detailBytes"] = sum(os.path.getsize(os.path.join(detail_dir, f)) for f in os.listdir(detail_dir))
    summary["detailGzipBytes"] = sum(gz_size(os.path.join(detail_dir, f)) for f in os.listdir(detail_dir))
    print(json.dumps(summary, indent=1, ensure_ascii=False))


if __name__ == "__main__":
    main()
