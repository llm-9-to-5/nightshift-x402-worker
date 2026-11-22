# Organic vs crawler: crawler = a payer that paid >= 50 distinct listed wallets in 9 days (directories, auditors, verifiers).
import json,collections
AX="0x7284d41b5b852f2bd4c99bdf95043d84452d299c"
L=json.load(open("all_listings.json"))
by_pay=collections.defaultdict(list)
for x in L:
    p=(x.get("onchain_payto_checked") or "").lower()
    if p.startswith("0x"): by_pay[p].append(x)
rows=[]
for d in range(13,22):
    s=56688122+(d-13)*432000
    rows+=[r for r in json.load(open(f"/home/agent/projects/flowdays/day_{s}.json"))["rows"] if 0<r["v"]<=1 and r["to"] in by_pay and r["to"]!=AX]
ps=collections.defaultdict(set)
for r in rows: ps[r["from"]].add(r["to"])
crawl={p for p,v in ps.items() if len(v)>=50}
cu=sum(r["v"] for r in rows if r["from"] in crawl); tu=sum(r["v"] for r in rows)
print("crawler wallets",len(crawl),"crawler usd",round(cu,2),"of",round(tu,2))
org=collections.Counter(); orgw=collections.defaultdict(set); anyw=collections.defaultdict(set)
for r in rows:
    anyw[r["to"]].add(r["from"])
    if r["from"] not in crawl: org[r["to"]]+=r["v"]; orgw[r["to"]].add(r["from"])
W=[p for p in by_pay if p!=AX]
only_crawl=sum(1 for p in W if anyw[p] and not orgw[p])
print("listed wallets",len(W),"any payment",sum(1 for p in W if anyw[p]),"only crawler payments",only_crawl,"organic >=1 payer",sum(1 for p in W if orgw[p]),">=3 organic payers",sum(1 for p in W if len(orgw[p])>=3),">=10",sum(1 for p in W if len(orgw[p])>=10),">= $1/day organic",sum(1 for p in W if org[p]>=9))
cat=collections.defaultdict(lambda:[0,0.0,0,0])
for p in W:
    for x in by_pay[p]:
        c=x.get("category") or "?"; sh=1/len(by_pay[p]); k=cat[c]
        k[0]+=1; k[1]+=org[p]*sh; k[2]+= sh if len(orgw[p])>=3 else 0; k[3]+= sh if org[p]>=9 else 0
out=sorted(([c,v[0],round(v[1]/9,2),round(v[1]/9/v[0]*30,2),round(v[2]),round(v[3])] for c,v in cat.items()),key=lambda r:-r[2])
print("category, listings, organic $/day, $/listing/30d, listings(w)>=3 organic payers, listings(w)>= $1/day")
for r in out[:22]: print(r)
json.dump({"crawler_wallets":len(crawl),"categories":out},open("organic.json","w"),indent=1)
