# For every 'real' seller on a day: which share of its non-crawler payer wallets (and USD) were funded, within the
# 3 days up to the day's end, by a single funder that funded >= 5 of that seller's payers. Chain only.
import json,urllib.request,time,collections,gzip,sys
R="https://base-rpc.publicnode.com"; TR="0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
D=json.load(gzip.open(sys.argv[1])); real=json.load(open(sys.argv[2])); b0,b1=D['blocks']; start=b0-432000*2
def logs(fr,to,t2):
  q={"jsonrpc":"2.0","id":1,"method":"eth_getLogs","params":[{"address":"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913","fromBlock":hex(fr),"toBlock":hex(to),"topics":[TR,None,t2]}]}
  for i in range(10):
    try:
      r=json.load(urllib.request.urlopen(urllib.request.Request(R,json.dumps(q).encode(),{"content-type":"application/json"}),timeout=120))
      if "result" in r: return r["result"]
    except Exception: pass
    time.sleep(5)
  raise SystemExit("fail")
deg={p:len(s) for p,s in D['payers'].items()}
sellers=[a for a,_,_ in real['top_real']] if len(real['top_real'])>=real['real_sellers'] else None
# real.json keeps top 10 only; recompute real-seller list = payees with >=20 non-crawler payers not in excluded buckets is complex; use top_real
S=[a for a,_,_ in real['top_real']]
pay={a:[p for p,s in D['payers'].items() if a in s and deg[p]<20] for a in S}
allp=sorted(set(p for v in pay.values() for p in v)); print("sellers",len(S),"payers",len(allp),flush=True)
fund=collections.defaultdict(set)   # payer -> funders (nonzero)
P=["0x"+"0"*24+p[2:] for p in allp]
for s in range(start,b1+1,50000):
  for k in range(0,len(P),120):
    for l in logs(s,min(s+49999,b1),P[k:k+120]):
      if int(l["data"],16)>=250000: fund["0x"+l["topics"][2][-40:]].add("0x"+l["topics"][1][-40:])
    time.sleep(0.25)
res=[]
for a in S:
  ps=pay[a]; c=collections.Counter(f for p in ps for f in fund.get(p,()))
  big={f for f,n in c.items() if n>=5}
  hit=[p for p in ps if fund.get(p,set())&big]
  usd=sum(D['payers'][p][a] for p in ps); husd=sum(D['payers'][p][a] for p in hit)
  res.append({"seller":a,"payers":len(ps),"usd":round(usd,2),"common_funder_payers":len(hit),"common_funder_usd":round(husd,2),"share_usd":round(husd/max(usd,1e-9),3),"funders":[(f,c[f]) for f in big]})
  print(a,len(ps),round(usd,2),"->",len(hit),round(husd,2),[(f[:10],c[f]) for f in big],flush=True)
json.dump(res,open(sys.argv[1].split('/')[-1]+".funders_min025.json","w"),indent=1)
