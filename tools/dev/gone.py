import sys, re, xml.etree.ElementTree as ET
KEYS=("abandoned","disused","removed","razed","demolished","planned","proposed","construction","piste:abandoned","aerialway:abandoned","access","seasonal:winter","seasonal","operational_status","opening_date")
for _, el in ET.iterparse(sys.argv[1]):
    if el.tag=="way":
        t={x.get("k"):x.get("v") for x in el.findall("tag")}
        if (t.get("piste:type")=="downhill" or "aerialway" in t):
            r={k:t[k] for k in KEYS if k in t and not (k=="access" and t[k] in("yes","customers","permissive")) and not (k=="seasonal:winter" and t[k]=="yes") and not (k=="seasonal" and t[k] in ("winter","yes","no"))}
            if r or re.search("stillgelegt",t.get("name","")): print(" ",el.get("id"),t.get("aerialway") or "piste",t.get("name"),r)
        el.clear()
