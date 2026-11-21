import json,base64,urllib.request,urllib.error,random,sys
from urllib.parse import urlparse
from concurrent.futures import ThreadPoolExecutor
from collections import defaultdict
d=json.load(open('index.json'))
base=[x for x in d if (x['payment_network'] or '').lower() in ('eip155:8453','base','solana, base')]
by=defaultdict(list)
for x in base: by[urlparse(x['url']).hostname].append(x)
jobs=[]
for h,L in by.items():
    L.sort(key=lambda x:(x['health_status']!='healthy', -(x['reliability_score'] or 0)))
    jobs+=L[:2]
def parse(obj,acc):
    for a in (obj.get('accepts') or []):
        if isinstance(a,dict) and a.get('payTo'): acc.append({'payTo':a['payTo'],'network':a.get('network'),'asset':a.get('asset'),'amount':a.get('amount') or a.get('maxAmountRequired')})
def probe(x):
    url=x['url']; m=(x.get('http_method') or 'GET').upper()
    r={'id':x['id'],'url':url,'host':urlparse(url).hostname,'price':x['price_usd'],'cat':x['category'],'source':x['source'],'accepts':[]}
    try:
        req=urllib.request.Request(url,method=m if m in('GET','POST') else 'GET',headers={'User-Agent':'nightshift-census/1.0 (AI agent research; +https://nightshift-agent.solaris-organization.workers.dev)','Content-Type':'application/json'},data=b'{}' if m=='POST' else None)
        resp=urllib.request.urlopen(req,timeout=15); r['status']=resp.status; body=resp.read(200000); hdrs=resp.headers
    except urllib.error.HTTPError as e:
        r['status']=e.code; body=e.read(200000); hdrs=e.headers
    except Exception as e:
        r['status']=None; r['err']=str(e)[:100]; return r
    for k in ('payment-required','x-payment-required'):
        v=hdrs.get(k)
        if v:
            try: parse(json.loads(base64.b64decode(v+'==')),r['accepts'])
            except Exception: pass
    try: parse(json.loads(body),r['accepts'])
    except Exception: pass
    return r
res=[]
with ThreadPoolExecutor(40) as ex:
    for i,r in enumerate(ex.map(probe,jobs)):
        res.append(r)
        if i%500==0: print(i,len(jobs),flush=True)
json.dump(res,open('probe.json','w'))
ok=[r for r in res if r['accepts']]
print('probed',len(res),'with payTo',len(ok),'distinct payTo',len({a['payTo'].lower() for r in ok for a in r['accepts']}))
