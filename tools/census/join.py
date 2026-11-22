# Join nohumans catalog (payTo per listing) with 9 days of on-chain <= $1 EIP-3009 payments on Base (13-21 Nov 2026).
import json,collections
AX="0x7284d41b5b852f2bd4c99bdf95043d84452d299c"
L=json.load(open("all_listings.json"))
by_pay=collections.defaultdict(list)
for x in L:
    p=(x.get("onchain_payto_checked") or "").lower()
    if p.startswith("0x") and "base" in (x.get("chains") or []) or p.startswith("0x"): by_pay[p].append(x)
print("listings",len(L),"with evm payTo",sum(len(v) for v in by_pay.values()),"wallets",len(by_pay))
usd=collections.Counter(); pays=collections.Counter(); wal=collections.defaultdict(set); days=collections.defaultdict(set)
for d in range(13,22):
    s=56688122+(d-13)*432000
    for r in json.load(open(f"/home/agent/projects/flowdays/day_{s}.json"))["rows"]:
        if 0<r["v"]<=1 and r["to"] in by_pay:
            usd[r["to"]]+=r["v"]; pays[r["to"]]+=1; wal[r["to"]].add(r["from"]); days[r["to"]].add(d)
cat_usd=collections.Counter(); cat_list=collections.Counter(); cat_earn=collections.Counter(); cat_w10=collections.Counter(); cat_wal=collections.defaultdict(set)
for p,ls in by_pay.items():
    share=1/len(ls)
    for x in ls:
        c=x.get("category") or "?"; cat_list[c]+=1
        if p==AX: continue
        cat_usd[c]+=usd[p]*share
        if usd[p]>0: cat_earn[c]+=share
        if len(wal[p])>=10: cat_w10[c]+=share
        cat_wal[c]|=wal[p]
rows=[]
for c,n in cat_list.most_common():
    rows.append({"category":c,"listings":n,"usd_9d":round(cat_usd[c],2),"usd_per_day":round(cat_usd[c]/9,2),"per_listing_9d":round(cat_usd[c]/n,3),"listings_earning_any":round(cat_earn[c]),"listings_wallet_10plus_payers":round(cat_w10[c]),"distinct_payers":len(cat_wal[c])})
rows.sort(key=lambda r:-r["usd_9d"])
json.dump(rows,open("categories.json","w"),indent=1)
for r in rows[:30]: print(r)
tot=sum(r["usd_9d"] for r in rows); print("total non-ax1 listed usd 9d",round(tot,2))
# top wallets with listing names
top=sorted(((usd[p],p) for p in by_pay if p!=AX),reverse=True)[:40]
tw=[{"payTo":p,"usd_9d":round(u,2),"payers":len(wal[p]),"days_paid":len(days[p]),"listings":len(by_pay[p]),"categories":collections.Counter(x.get("category") for x in by_pay[p]).most_common(3),"example":by_pay[p][0]["name"][:80],"url":by_pay[p][0]["endpoint_url"][:80]} for u,p in top]
json.dump(tw,open("top_wallets.json","w"),indent=1)
for t in tw[:25]: print(t["usd_9d"],t["payers"],t["days_paid"],t["listings"],t["categories"][:2],t["example"][:50],t["url"][:50])
# wallet-level distribution
vals=sorted(usd[p] for p in by_pay if p!=AX)
n=len(vals); zero=sum(1 for v in vals if v==0)
print("wallets",n,"zero",zero,round(zero/n,3),"median",vals[n//2],"p90",round(vals[int(n*0.9)],2),"top10 share",round(sum(vals[-10:])/sum(vals),3))
print("wallets >=10 payers",sum(1 for p in by_pay if p!=AX and len(wal[p])>=10),"paid on all 9 days",sum(1 for p in by_pay if p!=AX and len(days[p])==9))
pv=collections.Counter()
for x in L:
    p=(x.get("onchain_payto_checked") or "").lower()
    pv[(x.get("evidence_tier") or "none")]+=1
print(pv.most_common())
