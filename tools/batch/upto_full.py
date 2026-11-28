import json,collections,random,time,sys
exec(open("decode.py").read().split("tip=int(")[0])
L=json.load(open("uptoPermit2_24h.json")); txs=sorted(set(l["transactionHash"] for l in L)); random.seed(7); S=txs
U="0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"; TR="0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
pay=collections.defaultdict(float); payers=set(); payees=collections.Counter(); amts=[]; other=0
for h in S:
  r,_=rpc("eth_getTransactionReceipt",[h]); time.sleep(0.02)
  got=False
  for l in r["logs"]:
    if l["address"].lower()==U and l["topics"][0]==TR:
      f="0x"+l["topics"][1][-40:]; t="0x"+l["topics"][2][-40:]; v=int(l["data"],16)/1e6
      payers.add(f); payees[t]+=1; pay[t]+=v; amts.append(v); got=True
  if not got: other+=1
k=len(txs)/len(S)
print("upto 24h txs",len(txs),"sampled",len(S),"no-USDC",other)
print("sample: transfers",len(amts),"usd",round(sum(amts),3),"median",sorted(amts)[len(amts)//2] if amts else None,"payers",len(payers),"payees",len(payees))
small=[a for a in amts if a<=1]; print("le1: n",len(small),"usd",round(sum(small),2)," gt1: n",len(amts)-len(small),"usd",round(sum(a for a in amts if a>1),2))
json.dump({"pay":pay,"payees":payees,"payers":sorted(payers)},open("upto_full.json","w"))
for a,n in payees.most_common(6): print(" ",a,n,round(pay[a],3))
print("topic names check:",collections.Counter(l["topics"][0][:10] for l in L).most_common(3))
