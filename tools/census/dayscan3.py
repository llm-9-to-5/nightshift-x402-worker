# NOTE (night 8): Base blocks are 0.2s, so 43200 blocks = 2h24m, not 24h. Use 432000 for 24h.
# Sample all EIP-3009 transferWithAuthorization settlements on Base USDC for N blocks, join to Transfer, save.
import json,urllib.request,time,sys
R="https://base-rpc.publicnode.com"
def rpc(m,p):
    for i in range(6):
        try:
            r=json.loads(urllib.request.urlopen(urllib.request.Request(R,json.dumps({"jsonrpc":"2.0","id":1,"method":m,"params":p}).encode(),{"content-type":"application/json","User-Agent":"nightshift-flow"}),timeout=120).read())
            if "error" in r:
                if "max results" in str(r["error"]): raise ValueError("toomany")
                raise Exception(r["error"])
            return r["result"]
        except ValueError: raise
        except Exception as e: print("retry",e,flush=True); time.sleep(4)
    raise SystemExit("rpc failed")
USDC="0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
AU="0x98de503528ee59b575ef0c0a2576a82497bfc029a5685b209e9ec333479b10a5"
TR="0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
start=int(sys.argv[1]); N=int(sys.argv[2]); tip=start+N-1
out=[]; step=int(sys.argv[3]) if len(sys.argv)>3 else 5000
def proc(b,e):
    try:
        au=rpc("eth_getLogs",[{"address":USDC,"topics":[AU],"fromBlock":hex(b),"toBlock":hex(e)}])
    except ValueError:
        m=(b+e)//2; proc(b,m); proc(m+1,e); return
    if not au: return
    want={(l["transactionHash"],int(l["logIndex"],16)+1) for l in au}
    auth=sorted({l["topics"][1] for l in au})
    tr=[]
    def trget(lo,hi,a):
        try: return rpc("eth_getLogs",[{"address":USDC,"topics":[TR,a],"fromBlock":hex(lo),"toBlock":hex(hi)}])
        except ValueError:
            if len(a)>1: return trget(lo,hi,a[:len(a)//2])+trget(lo,hi,a[len(a)//2:])
            m=(lo+hi)//2; return trget(lo,m,a)+trget(m+1,hi,a)
    for i in range(0,len(auth),80): tr+=trget(b,e,auth[i:i+80])
    for l in tr:
        if (l["transactionHash"],int(l["logIndex"],16)) in want:
            out.append({"b":int(l["blockNumber"],16),"tx":l["transactionHash"],"from":"0x"+l["topics"][1][-40:],"to":"0x"+l["topics"][2][-40:],"v":int(l["data"],16)/1e6})
for b in range(start,tip+1,step):
    e=min(b+step-1,tip); proc(b,e)
    print(b-start,len(out),flush=True)
json.dump({"blocks":[start,tip],"rows":out},open(f"day_{start}.json","w"))
print("done",len(out))
