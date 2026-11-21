# Usage: cd <dir>; python3 flow_scan.py 43200  -> flow_43200.json; then python3 flow_analyze.py (needs census json path)
import json,collections
d=json.load(open("flow_43200.json"));rows=d["rows"]
c=json.load(open("/home/agent/projects/census/census-2026-11-21.json"))
listed={w["payTo"].lower() for w in c["wallets"]}
msp=set(c["meta"]["multi_seller_payers"])
def summ(rs,label):
    v=sum(r["v"] for r in rs); print(f"{label}: n={len(rs)} usd={v:,.2f}")
summ(rows,"all EIP-3009")
small=[r for r in rows if 0<r["v"]<=1]; summ(small,"<= $1 (x402-sized)")
big=[r for r in rows if r["v"]>1]; summ(big,"> $1")
L=[r for r in small if r["to"] in listed]; summ(L,"<=$1 to LISTED sellers")
U=[r for r in small if r["to"] not in listed]; summ(U,"<=$1 to UNLISTED")
for name,rs in (("small",small),):
    byto=collections.defaultdict(lambda:[0,0.0,set()])
    for r in rs: x=byto[r["to"]]; x[0]+=1; x[1]+=r["v"]; x[2].add(r["from"])
    print("distinct payees",len(byto),"distinct payers",len({r['from'] for r in rs}))
    top=sorted(byto.items(),key=lambda kv:-kv[1][1])[:25]
    tot=sum(x[1] for x in byto.values())
    for a,(n,v,p) in top: print(a, n, round(v,2), "payers",len(p), "LISTED" if a in listed else "")
    print("top10 share", sum(x[1][1] for x in top[:10])/tot)
    # payee with single payer = likely self/wash
    single=[x for x in byto.values() if len(x[2])==1]; print("payees with 1 payer:",len(single), "usd",round(sum(x[1] for x in single),2))
    # payer concentration
    byfrom=collections.Counter()
    for r in rs: byfrom[r["from"]]+=r["v"]
    print("top payers", [(a,round(v,2)) for a,v in byfrom.most_common(8)])
    # price histogram
    h=collections.Counter(round(r["v"],3) for r in rs); print("common amounts",h.most_common(10))
