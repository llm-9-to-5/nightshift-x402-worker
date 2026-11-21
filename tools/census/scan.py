import json,urllib.request,time,sys
from collections import defaultdict
R="https://base-rpc.publicnode.com"
T="0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
USDC="0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
def rpc(m,p):
    for i in range(6):
        try:
            r=json.loads(urllib.request.urlopen(urllib.request.Request(R,json.dumps({"jsonrpc":"2.0","id":1,"method":m,"params":p}).encode(),{"content-type":"application/json","User-Agent":"nightshift-census"}),timeout=90).read())
            return r
        except Exception as e:
            time.sleep(2+i*3)
    return {"error":{"message":"failed"}}
probe=json.load(open('probe.json'))
addrs=sorted({a['payTo'].lower() for r in probe for a in r['accepts'] if str(a['payTo']).startswith('0x') and len(a['payTo'])==42 and ('8453' in str(a.get('network')) or str(a.get('network')).lower()=='base')})
print('addrs',len(addrs),flush=True)
tip=int(rpc("eth_blockNumber",[])["result"],16)
DAYS=int(sys.argv[1]) if len(sys.argv)>1 else 30
start=tip-DAYS*43200
logs=[]
def get(frm,to,batch):
    topics=[T,None,["0x"+"0"*24+a[2:] for a in batch]]
    r=rpc("eth_getLogs",[{"address":USDC,"fromBlock":hex(frm),"toBlock":hex(to),"topics":topics}])
    if "error" in r:
        if to-frm<50: print("giveup",frm,to,r["error"],flush=True); return
        mid=(frm+to)//2; get(frm,mid,batch); get(mid+1,to,batch); return
    for l in r["result"]:
        logs.append((int(l["blockNumber"],16),"0x"+l["topics"][1][26:],"0x"+l["topics"][2][26:],int(l["data"],16),l["transactionHash"]))
B=100
for bi in range(0,len(addrs),B):
    batch=addrs[bi:bi+B]
    for frm in range(start,tip,50000):
        get(frm,min(frm+49999,tip),batch)
    print('batch',bi,len(logs),flush=True)
json.dump({"tip":tip,"start":start,"days":DAYS,"addrs":addrs,"logs":logs},open('logs.json','w'))
print('done',len(logs))
