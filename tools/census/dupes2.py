# Casual buyers: (payer,payee) pairs with few payments in the 9-day window. How often is a payment an identical repeat within T seconds?
import json,collections
AX="0x7284d41b5b852f2bd4c99bdf95043d84452d299c"
F="/home/agent/projects/flowdays/day_%d.json"
pairs=collections.defaultdict(list)
for d in range(13,22):
    s=56688122+(d-13)*432000
    for r in json.load(open(F%s))["rows"]:
        if 0<r["v"]<=1 and r["to"]!=AX: pairs[(r["from"],r["to"])].append((r["b"],r["v"],r["tx"]))
for cap in (2,5,10,30):
    sel={k:sorted(v) for k,v in pairs.items() if len(v)<=cap}
    n=sum(len(v) for v in sel.values())
    for T in (5,25,150):
        dup=0; usd=0; ppairs=set(); ex=[]
        for k,v in sel.items():
            for a,b in zip(v,v[1:]):
                if b[1]==a[1] and b[0]-a[0]<=T: dup+=1; usd+=b[1]; ppairs.add(k); ex.append((k,a,b))
        print(f"pairs with <= {cap} payments: {len(sel)} pairs, {n} payments; identical repeat within {T*0.2:.0f}s: {dup} payments ({dup/n:.2%}), ${usd:.2f}, in {len(ppairs)} pairs ({len(ppairs)/len(sel):.2%}), sellers {len({k[1] for k in ppairs})}")
        if cap==10 and T==25: json.dump([[k[0],k[1],a[0],b[0],a[1],a[2],b[2]] for k,a,b in ex],open("ex_cap10_5s.json","w"))
