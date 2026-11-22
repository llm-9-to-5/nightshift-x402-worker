# Same payer -> same payee, same amount: gap (in blocks, 0.2s) to the previous identical payment.
import json,sys,collections
AX="0x7284d41b5b852f2bd4c99bdf95043d84452d299c"
F="/home/agent/projects/flowdays/day_%d.json"
B=[0,1,5,25,150,1500]
tot=collections.Counter(); hist=collections.Counter(); pairs_seller=collections.Counter(); usd_dup=0; n_all=0; usd_all=0
payer_stats=collections.defaultdict(lambda:[0,0])  # payer -> [payments, <=1s repeats]
gapfine=collections.Counter()
for d in range(13,22):
    s=56688122+(d-13)*432000
    rows=[r for r in json.load(open(F%s))["rows"] if 0<r["v"]<=1 and r["to"]!=AX]
    rows.sort(key=lambda r:r["b"])
    last={}
    for r in rows:
        k=(r["from"],r["to"],r["v"]); n_all+=1; usd_all+=r["v"]
        payer_stats[r["from"]][0]+=1
        if k in last:
            g=r["b"]-last[k]
            if g<=50: gapfine[g]+=1
            for t in B:
                if g<=t: hist[t]+=1
            if g<=5: pairs_seller[r["to"]]+=1; usd_dup+=r["v"]; payer_stats[r["from"]][1]+=1
        last[k]=r["b"]
print("non-ax1 payments",n_all,"usd",round(usd_all,2))
for t in B: print(f"repeat of identical (payer,payee,amount) within {t} blocks ({t*0.2:.1f}s): {hist[t]} = {hist[t]/n_all:.2%}")
print("usd in <=1s repeats",round(usd_dup,2))
print("fine gap hist (blocks:count)",sorted(gapfine.items())[:51])
print("top sellers by <=1s repeats",pairs_seller.most_common(10))
ps=sorted(payer_stats.items(),key=lambda x:-x[1][1])[:10]; print("top payers",ps)
print("payers with any <=1s repeat",sum(1 for v in payer_stats.values() if v[1]),"of",len(payer_stats))
