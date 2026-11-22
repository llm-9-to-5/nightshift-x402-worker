import json,collections
L=json.load(open("all_listings.json")); listed={(x.get("onchain_payto_checked") or "").lower() for x in L}
ps=collections.defaultdict(set); pu=collections.Counter()
for d in range(13,22):
    s=56688122+(d-13)*432000
    for r in json.load(open(f"/home/agent/projects/flowdays/day_{s}.json"))["rows"]:
        if 0<r["v"]<=1 and r["to"] in listed: ps[r["from"]].add(r["to"]); pu[r["from"]]+=r["v"]
top=sorted(ps,key=lambda p:-len(ps[p]))[:15]
for p in top: print(p,len(ps[p]),round(pu[p],2))
json.dump({p:len(ps[p]) for p in top},open("multi_payers.json","w"))
