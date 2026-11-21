import json,statistics
from collections import defaultdict,Counter
p=json.load(open('probe.json')); L=json.load(open('logs.json'))
addrs=set(L['addrs'])
hosts=defaultdict(set); cats=defaultdict(Counter); nlist=Counter()
for r in p:
    for a in r['accepts']:
        k=a['payTo'].lower()
        if k in addrs: hosts[k].add(r['host']); cats[k][r['cat']]+=1; nlist[k]+=1
SMALL=1_000_000  # <= $1.00
inb=defaultdict(list)
for b,frm,to,v,tx in L['logs']:
    inb[to].append((frm,v,tx,b))
sellers={}
payer_sellers=defaultdict(set); payer_val=Counter()
for a in addrs:
    xs=inb.get(a,[])
    sm=[x for x in xs if x[1]<=SMALL and x[1]>0]
    payers=Counter(); pv=Counter()
    for frm,v,tx,b in sm: payers[frm]+=1; pv[frm]+=v; payer_sellers[frm].add(a); payer_val[frm]+=v
    tot=sum(v for _,v,_,_ in sm)
    sellers[a]={'payTo':a,'hosts':sorted(hosts[a]),'cats':dict(cats[a].most_common(3)),'small_n':len(sm),'small_usd':tot/1e6,'all_in_usd':sum(x[1] for x in xs)/1e6,'all_n':len(xs),
      'payers':len(payers),'top_payer_share':(max(pv.values())/tot if tot else 0),'top_payer':(pv.most_common(1)[0][0] if pv else None),
      'self_or_seller_payers_usd':sum(v for f,v in pv.items() if f in addrs)/1e6}
S=list(sellers.values())
earning=[s for s in S if s['small_n']>0]
print('payTo wallets scanned',len(S),'with >=1 small inbound (<=$1) in 30d',len(earning))
tot=sum(s['small_usd'] for s in S); print('total small inbound $',round(tot,2),'n',sum(s['small_n'] for s in S))
for th in (1,10,100):
    print(f'wallets with >= ${th}',sum(1 for s in S if s['small_usd']>=th))
ranked=sorted(S,key=lambda s:-s['small_usd'])
print('top10 share',sum(s['small_usd'] for s in ranked[:10])/tot)
print('median among earners $',statistics.median([s['small_usd'] for s in earning]) if earning else 0)
print('earners whose biggest payer is >=50% of revenue',sum(1 for s in earning if s['top_payer_share']>=.5))
print('earners with 1 payer only',sum(1 for s in earning if s['payers']==1), ' with >=10 payers',sum(1 for s in earning if s['payers']>=10))
# payers who pay many sellers (directory testers / crawlers)
multi=sorted(payer_sellers,key=lambda f:-len(payer_sellers[f]))[:15]
print('top multi-seller payers:')
for f in multi: print(' ',f,len(payer_sellers[f]),'sellers $',round(payer_val[f]/1e6,2))
print('revenue from payers that are themselves listed payTo wallets $',round(sum(s['self_or_seller_payers_usd'] for s in S),2))
print('TOP 25:')
for s in ranked[:25]: print(round(s['small_usd'],2),s['small_n'],s['payers'],round(s['top_payer_share'],2),s['hosts'][:2],list(s['cats'])[:1])
json.dump({'sellers':ranked,'multi_payers':[{'payer':f,'sellers':len(payer_sellers[f]),'usd':payer_val[f]/1e6} for f in multi]},open('analysis.json','w'),indent=1)
