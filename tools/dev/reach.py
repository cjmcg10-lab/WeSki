import json,sys
from collections import defaultdict,deque
def reach(path):
    R=json.load(open(path)); adj=defaultdict(list)
    for e in R["graph"]["edges"]:
        adj[e["a"]].append(e["b"])
        if e.get("bi"): adj[e["b"]].append(e["a"])
    best=set()
    starts=[e["a"] for e in R["graph"]["edges"] if e["k"]=="l"]
    for s in starts[:400]:
        seen={s}; q=deque([s])
        while q:
            u=q.popleft()
            for v in adj[u]:
                if v not in seen: seen.add(v); q.append(v)
        if len(seen)>len(best): best=seen
    un=sorted({(R["trails"][e["r"]]["name"] or "unnamed") for e in R["graph"]["edges"] if e["k"]=="p" and e["a"] not in best})
    return len(R["trails"]),len(R["lifts"]),un
for i in sys.argv[1:]:
    print(i); print("  before",reach(f"{sys.argv[0].rsplit('/',1)[0]}/rb/before/{i}/resort.json")); print("  after ",reach(f"public/data/{i}/resort.json"))
