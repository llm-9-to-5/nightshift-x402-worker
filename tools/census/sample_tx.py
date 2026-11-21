import json,urllib.request,random,time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
R="https://base-rpc.publicnode.com"
AU="0x98de503528ee59b575ef0c0a2576a82497bfc029a5685b209e9ec333479b10a5"
def rpc(m,p):
    for i in range(5):
        try: return json.loads(urllib.request.urlopen(urllib.request.Request(R,json.dumps({"jsonrpc":"2.0","id":1,"method":m,"params":p}).encode(),{"content-type":"application/json","User-Agent":"x"}),timeout=60).read())["result"]
        except Exception: time.sleep(2)
L=json.load(open('logs.json'))['logs']
small=[l for l in L if 0<l[3]<=1_000_000]
random.seed(4); S=random.sample(small,min(400,len(small)))
def f(l):
    r=rpc("eth_getTransactionReceipt",[l[4]])
    if not r: return None
    return {'auth':any(x['topics'] and x['topics'][0]==AU for x in r['logs']),'from':r['from'],'to':r['to']}
res=[x for x in ThreadPoolExecutor(8).map(f,S) if x]
print('sampled',len(res),'with AuthorizationUsed',sum(x['auth'] for x in res))
print('tx senders',Counter(x['from'] for x in res).most_common(10))
json.dump(res,open('sample_tx.json','w'))
