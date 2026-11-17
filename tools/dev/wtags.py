import sys, xml.etree.ElementTree as ET
f, ids = sys.argv[1], set(sys.argv[2:])
for _, el in ET.iterparse(f):
    if el.tag == "way":
        if el.get("id") in ids:
            print(el.get("id"), len(el.findall("nd")), {t.get("k"): t.get("v") for t in el.findall("tag")})
        el.clear()
