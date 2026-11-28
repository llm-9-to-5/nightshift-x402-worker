import json,urllib.request,time,collections,sys
R="https://base-rpc.publicnode.com"
def rpc(m,p):
  q=json.dumps({"jsonrpc":"2.0","id":1,"method":m,"params":p}).encode()
  for i in range(8):
    try:
      r=json.load(urllib.request.urlopen(urllib.request.Request(R,q,{"content-type":"application/json"}),timeout=90))
      if "result" in r: return r["result"],None
      e=r.get("error")
      if e and "max results" in e.get("message",""): return None,e
    except Exception as ex: e=str(ex)
    time.sleep(3)
  raise SystemExit(f"fail {m} {e}")
def getlogs(a,fr,to,topics=None):
  out=[]; stack=[(fr,to)]
  while stack:
    f,t=stack.pop(); p={"address":a,"fromBlock":hex(f),"toBlock":hex(t)}
    if topics: p["topics"]=topics
    L,e=rpc("eth_getLogs",[p])
    if L is None: m=(f+t)//2; stack+= [(f,m),(m+1,t)]; continue
    out+=L; time.sleep(0.15)
  return out
tip=int(rpc("eth_blockNumber",[])[0],16); start=tip-432000*7
B="0x4020074e9dF2ce1deE5A9C1b5c3f541D02a10003"
L=[]
for s in range(start,tip+1,50000): L+=getlogs(B,s,min(s+49999,tip))
json.dump(L,open("batch_logs.json","w"))
w=lambda x:int(x,16); ad=lambda h:"0x"+h[-40:]
chan={}; dep=collections.Counter(); settled=collections.defaultdict(float); claims=collections.Counter(); claimsUsd=collections.Counter(); tokens=collections.Counter()
for l in L:
  t0=l["topics"][0][:10]; d=l["data"][2:]
  if t0=="0x69d8248d":
    f=[d[i:i+64] for i in range(0,len(d),64)]
    chan[l["topics"][1]]={"payer":ad(f[0]),"receiver":ad(f[2]),"token":ad(f[4]),"recvAuth":ad(f[3])}
  elif t0=="0x6c2a0935": dep[l["topics"][1]]+=w(d[:64])/1e6
  elif t0=="0x36bd546b": claims[l["topics"][1]]+=1; claimsUsd[l["topics"][1]]+=w(d[:64])/1e6
  elif t0=="0x7337b438": settled[(ad(l["topics"][1]),ad(l["topics"][2]))]+=w(d[:64])/1e6
print("channels created (7d):",len(chan),"deposit $",round(sum(dep.values()),2),"claim events",sum(claims.values()),"claimed $",round(sum(claimsUsd.values()),4))
print("tokens:",collections.Counter(c["token"] for c in chan.values()))
print("payers:",len(set(c["payer"] for c in chan.values())),"receivers:",collections.Counter(c["receiver"] for c in chan.values()).most_common(6))
print("recvAuth:",collections.Counter(c["recvAuth"] for c in chan.values()).most_common(4))
print("settled by receiver:",sorted(((k[0],round(v,4)) for k,v in settled.items()),key=lambda x:-x[1])[:8])
print("claims per channel top:",[(k[:10],claims[k],round(claimsUsd[k],4)) for k,_ in claims.most_common(6)])
