"""usage: osmget.py out.osm w s e n [n_split]  - fetch an OSM bbox in tiles and merge."""
import sys, time, urllib.request, xml.etree.ElementTree as ET
out, w, s, e, n = sys.argv[1], *map(float, sys.argv[2:6])
k = int(sys.argv[6]) if len(sys.argv) > 6 else 2
def fetch(b, depth=0):
    url = "https://api.openstreetmap.org/api/0.6/map?bbox=%.5f,%.5f,%.5f,%.5f" % b
    for attempt in range(4):
        try:
            return [ET.fromstring(urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "weski-build"}), timeout=180).read())]
        except urllib.error.HTTPError as err:
            if err.code == 400 and depth < 3:   # too many nodes: split in four
                mx, my = (b[0] + b[2]) / 2, (b[1] + b[3]) / 2
                r = []
                for q in ((b[0], b[1], mx, my), (mx, b[1], b[2], my), (b[0], my, mx, b[3]), (mx, my, b[2], b[3])):
                    r += fetch(q, depth + 1)
                return r
            time.sleep(5 * (attempt + 1))
        except Exception:
            time.sleep(5 * (attempt + 1))
    raise SystemExit("failed " + url)
roots = []
for i in range(k):
    for j in range(k):
        roots += fetch((w + (e - w) * i / k, s + (n - s) * j / k, w + (e - w) * (i + 1) / k, s + (n - s) * (j + 1) / k))
        time.sleep(1)
seen, merged = set(), ET.Element("osm", version="0.6")
for kind in ("node", "way", "relation"):
    for r in roots:
        for el in r.findall(kind):
            key = (kind, el.get("id"))
            if key not in seen:
                seen.add(key); merged.append(el)
ET.ElementTree(merged).write(out, encoding="utf-8", xml_declaration=True)
print(out, len(roots), "tiles", len(seen), "elements")
