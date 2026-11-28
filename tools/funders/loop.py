import json,urllib.request,time,collections,gzip
R="https://base-rpc.publicnode.com"; TR="0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
b0,b1=62736122,63168121; start=b0-432000*2
def logs(fr,to,t1,t2):
  q={"jsonrpc":"2.0","id":1,"method":"eth_getLogs","params":[{"address":"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913","fromBlock":hex(fr),"toBlock":hex(to),"topics":[TR,t1,t2]}]}
  for i in range(8):
    try:
      r=json.load(urllib.request.urlopen(urllib.request.Request(R,json.dumps(q).encode(),{"content-type":"application/json"}),timeout=90))
      if "result" in r: return r["result"]
    except Exception: pass
    time.sleep(4)
  raise SystemExit("fail")
pad=lambda a:"0x"+"0"*24+a[2:].lower()
F="0xc4fa13abd72e205b5dcaa606eac2d59d6ebe6a3c"; P="0xf732ea490c5766071785a2310523f7fa2cebb829"
out=collections.Counter(); inn=collections.Counter(); back=0
for s in range(start,b1+1,50000):
  e=min(s+49999,b1)
  for l in logs(s,e,pad(F),None): out["0x"+l["topics"][2][-40:]]+=int(l["data"],16)/1e6
  for l in logs(s,e,None,pad(F)): inn["0x"+l["topics"][1][-40:]]+=int(l["data"],16)/1e6
  time.sleep(0.3)
print("0xc4fa sent to",len(out),"wallets, $",round(sum(out.values()),2),"| received from",len(inn),"senders $",round(sum(inn.values()),2))
print("top inflow sources:",[(a,round(v,2)) for a,v in inn.most_common(5)])
print("Pocket treasury -> 0xc4fa:",round(inn.get(P,0),2))
D=json.load(gzip.open('p27.json.gz')); paid=collections.Counter()
for w in out:
  for t,u in D['payers'].get(w,{}).items(): paid[t]+=u
print("where 0xc4fa-funded wallets paid on 27 Nov:",[(t,round(u,2)) for t,u in paid.most_common(5)])
