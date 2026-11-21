import json,sys,re,collections
cen=open('src/census.js').read()
listed=set(re.findall(r'"(0x[0-9a-f]{40})":\[',cen))
d=json.load(open(sys.argv[1])); rows=[r for r in d["rows"] if 0<r["v"]<=1]
big=[r for r in d["rows"] if r["v"]>1]
pay=collections.defaultdict(lambda:[0,0.0,set()]); payers=collections.defaultdict(set)
for r in rows:
    p=pay[r["to"]]; p[0]+=1; p[1]+=r["v"]; p[2].add(r["from"]); payers[r["from"]].add(r["to"])
usd=sum(r["v"] for r in rows); vals=sorted(p[1] for p in pay.values())
top=sorted(pay.items(),key=lambda x:-x[1][1])
print(json.dumps({"blocks":d["blocks"],"payments":len(rows),"usd":round(usd,2),"recipients":len(pay),"payers":len(payers),
"one_seller":sum(1 for s in payers.values() if len(s)==1),"median":round(vals[len(vals)//2],3),
"top10":round(sum(p[1][1] for p in top[:10])/usd,3),"listed":round(sum(p[1] for a,p in pay.items() if a in listed)/usd,3),
"ge1_3":sum(1 for p in pay.values() if p[1]>=1 and len(p[2])>=3),"big_usd":round(sum(r["v"] for r in big)),
"top5":[(a[:10],round(p[1],2),p[0],len(p[2])) for a,p in top[:5]]}))
