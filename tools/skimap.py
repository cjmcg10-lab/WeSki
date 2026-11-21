#!/usr/bin/env python3
"""Find and download a resort's newest trail maps from skimap.org (used for reading ratings).

usage: python3 tools/skimap.py find "<State or country>" "<part of the resort name>"
       python3 tools/skimap.py maps <ski area id>            the last two years' maps with captions (pick the winter trail map)
       python3 tools/skimap.py get <map id> <out file>        download one map (pdf or image)

skimap.org pages: regions/view/<id> list areas (United States is 187, Canada 36, then states and
provinces), skiareas/view/<id> list the maps by year, skimaps/view/<id> returns the file itself.
"""
import re
import sys
import urllib.request

BASE = "https://skimap.org"


def page(path):
    req = urllib.request.Request(BASE + path, headers={"User-Agent": "weski-build"})
    return urllib.request.urlopen(req, timeout=60).read().decode("utf-8", "replace")


def regions(rid):
    return re.findall(r'regions/view/(\d+)">([^<]+)', page(f"/regions/view/{rid}"))


def find(region, name):
    top = {n.lower(): i for i, n in regions(187) + regions(36) + regions(1)}
    rid = top.get(region.lower())
    if not rid:
        raise SystemExit(f"region {region!r} not found; known: {', '.join(sorted(top))}")
    hits = [(i, n) for i, n in re.findall(r'skiareas/view/(\d+)">([^<]+)<', page(f"/regions/view/{rid}"))
            if name.lower() in n.lower()]
    for i, n in hits:
        print(i, n)
    return hits


def maps(area):
    html = page(f"/skiareas/view/{area}")
    parts = re.split(r'id="maps-year-(\d{4})"', html)
    out = []
    for k in range(1, len(parts), 2):
        year = parts[k]
        seg = parts[k + 1]
        for m in dict.fromkeys(re.findall(r"skimaps/view/(\d+)", seg)):
            at = seg.index(f"skimaps/view/{m}")
            words = " ".join(re.sub(r"<[^>]+>", " ", seg[at + len(m) + 15:at + 4000]).split())
            out.append((year, m, words.split("Published in")[0].strip()[:80]))
    years = sorted({y for y, _, _ in out}, reverse=True)[:2]  # the newest map is often a summer or bike map
    for y, m, cap in out:
        if y in years:
            print(y, m, cap or "(no caption)")
    return [m for y, m, _ in out if y in years]


def get(mid, out):
    req = urllib.request.Request(f"{BASE}/skimaps/view/{mid}", headers={"User-Agent": "weski-build"})
    with urllib.request.urlopen(req, timeout=180) as r:
        data, ctype = r.read(), r.headers.get("content-type", "")
    if "text/html" in ctype:
        raise SystemExit(f"map {mid}: got a web page, not a file")
    open(out, "wb").write(data)
    print(f"{out}: {len(data) / 1e6:.1f} MB, {ctype}")


if __name__ == "__main__":
    a = sys.argv[1:]
    if a[:1] == ["find"] and len(a) == 3:
        find(a[1], a[2])
    elif a[:1] == ["maps"] and len(a) == 2:
        maps(a[1])
    elif a[:1] == ["get"] and len(a) == 3:
        get(a[1], a[2])
    else:
        raise SystemExit(__doc__)
