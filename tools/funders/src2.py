import json,urllib.request,time,collections
import sys; payers=json.load(open(sys.argv[1])); b0,b1=62736122,63168121
R="https://base-rpc.publicnode.com"; TR="0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
def logs(fr,to,t2):
  q={"jsonrpc":"2.0","id":1,"method":"eth_getLogs","params":[{"address":"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913","fromBlock":hex(fr),"toBlock":hex(to),"topics":[TR,None,t2]}]}
  for i in range(8):
    try:
      r=json.load(urllib.request.urlopen(urllib.request.Request(R,json.dumps(q).encode(),{"content-type":"application/json"}),timeout=90))
      if "result" in r: return r["result"]
      err=r.get("error")
    except Exception as e: err=str(e)
    time.sleep(4)
  raise SystemExit(f"fail {fr} {err}")
src=collections.defaultdict(lambda:[0,0.0,set()])
start=b0-432000*2
P=["0x"+"0"*24+p[2:] for p in payers]
for s in range(start,b1+1,25000):
  for k in range(0,len(P),120):
    for l in logs(s,min(s+24999,b1),P[k:k+120]):
      f="0x"+l["topics"][1][-40:]; t="0x"+l["topics"][2][-40:]; v=int(l["data"],16)/1e6
      x=src[f]; x[0]+=1; x[1]+=v; x[2].add(t)
    time.sleep(0.3)
rows=sorted(((f,n,u,len(ts)) for f,(n,u,ts) in src.items()),key=lambda x:-x[3])
json.dump(rows,open(sys.argv[1]+'.sources.json','w'))
print("distinct funders",len(rows))
for r in rows[:15]: print(r[0],r[1],round(r[2],2),"->",r[3],"payers")
funded=set().union(*[src[r[0]][2] for r in rows]) if rows else set()
print("payers with any USDC inflow in window:",len(funded),"of",len(payers))
