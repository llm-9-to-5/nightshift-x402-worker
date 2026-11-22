import json, collections
d = json.load(open("dec.json")); meta = json.load(open("bc_60144122.json")); N = meta["uniform_n"]
U = [r for r in d[:N] if r["sender"]]
print("uniform fetched", len(U), "of", N)
mk = [r for r in U if r["bc"]]; app = [r for r in mk if r.get("parsed") and r.get("parsed").get("a")]
print("marker %.1f%%  usd-weighted %.1f%%" % (100*len(mk)/len(U), 100*sum(r["v"] for r in mk)/sum(r["v"] for r in U)))
print("with app code %.1f%% (usd %.1f%%)" % (100*len(app)/len(U), 100*sum(r["v"] for r in app)/sum(r["v"] for r in U)))
keys = collections.Counter(); 
for r in mk: keys[tuple(sorted((r.get("parsed") or {"none":1}).keys()))] += 1
print("field sets", keys.most_common(6))
w = collections.Counter((r.get("parsed") or {}).get("w") for r in mk); print("wallet codes", w.most_common(8))
a = collections.Counter((r.get("parsed") or {}).get("a") for r in U if r["bc"]); print("app codes (uniform)", len(a), a.most_common(12))
AX1="0x7284d41b5b852f2bd4c99bdf95043d84452d299c"
nax=[r for r in U if r["to"]!=AX1]; print("non-AX1 n", len(nax), "marker %.1f%%" % (100*sum(r["bc"] for r in nax)/len(nax)), "app %.1f%%" % (100*sum(1 for r in nax if r.get("parsed") and r.get("parsed").get("a"))/len(nax)))
# per payee (all samples)
per = collections.defaultdict(lambda: [0,0,collections.Counter()])
for r in d:
    if not r["sender"]: continue
    p = per[r["to"]]; p[0]+=1
    if r["bc"]: p[1]+=1; p[2][(r.get("parsed") or {}).get("a")]+=1
lb = {x["payTo"]: x for x in json.load(open("/home/agent/scratch/lb.json"))["sellers"]}
print("\ntop sellers: payTo name n marker app-codes")
for addr in meta["top"][:45]:
    if addr not in per: continue
    n,m,c = per[addr]; x = lb.get(addr, {})
    print(addr[:10], (x.get("name") or "")[:28].ljust(28), x.get("payers"), n, m, dict(c.most_common(3)))
# code -> payees
cp = collections.defaultdict(set)
for r in d:
    if r.get("parsed") and r.get("parsed").get("a"): cp[r.get("parsed")["a"]].add(r["to"])
print("\ncodes->n payees", sorted(((k,len(v)) for k,v in cp.items()), key=lambda x:-x[1])[:15])
# senders of marker vs not
s = collections.Counter((r["sender"], r["bc"]) for r in U); 
