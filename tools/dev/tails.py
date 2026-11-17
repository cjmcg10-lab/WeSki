import json,glob,math,collections
tot=collections.Counter()
for f in sorted(glob.glob("public/data/*/resort.json")):
    R=json.load(open(f)); N=R["graph"]["nodes"]
    deg=collections.Counter()
    for e in R["graph"]["edges"]:
        deg[e["a"]]+=1; deg[e["b"]]+=1
    by=collections.defaultdict(list)
    for e in R["graph"]["edges"]:
        if e["k"]=="p": by[e["r"]].append(e)
    tails=[]
    for r,es in by.items():
        if len(es)<2: continue
        T=R["trails"][r]
        # edges of a trail are in order along it; last edge = bottom tail, first = top tail
        for which,e,node in (("bottom",es[-1],es[-1]["b"]),("top",es[0],es[0]["a"])):
            if deg[node]==1 and e["len"]<45:
                tails.append((which,T["name"],round(e["len"])))
    tot[R["id"]]=len(tails)
    print(R["id"],len(R["trails"]),"tails",len(tails),tails[:5])
print(sum(tot.values()))
