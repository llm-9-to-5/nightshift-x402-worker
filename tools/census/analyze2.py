import json
from collections import defaultdict,Counter
L=json.load(open('logs.json')); p=json.load(open('probe.json'))
addrs=set(L['addrs'])
small=[l for l in L['logs'] if 0<l[3]<=1_000_000]
ps=defaultdict(set)
for b,f,t,v,tx in small: ps[f].add(t)
testers={f for f,s in ps.items() if len(s)>=20}
print('payers total',len(ps),'payers paying >=20 sellers',len(testers),'>=5',sum(1 for s in ps.values() if len(s)>=5))
rev=defaultdict(lambda:[0,0,set()])  # tester$, other$, other payers
for b,f,t,v,tx in small:
    if f in testers: rev[t][0]+=v
    else: rev[t][1]+=v; rev[t][2].add(f)
earners=[a for a in addrs if a in rev]
only_test=[a for a in earners if rev[a][1]==0]
print('earners',len(earners),'only paid by multi-seller payers',len(only_test))
for th in (1,10,100):
    print(f'>= ${th} from non-tester payers:',sum(1 for a in earners if rev[a][1]/1e6>=th), ' with >=3 distinct non-tester payers:',sum(1 for a in earners if rev[a][1]/1e6>=th and len(rev[a][2])>=3))
print('tester $ total',sum(r[0] for r in rev.values())/1e6,'non-tester $',sum(r[1] for r in rev.values())/1e6)
# listings per wallet vs revenue
nl=Counter()
for r in p:
    for a in r['accepts']: nl[a['payTo'].lower()]+=1
hosts_total=len({r['host'] for r in p}); hosts_402=len({r['host'] for r in p if r['accepts']})
print('hosts probed',hosts_total,'hosts with valid 402',hosts_402)
# blocks/day check
print('days',L['days'],'range',L['start'],L['tip'])
# weekly trend
wk=Counter(); 
for b,f,t,v,tx in small: wk[(b-L['start'])//(432000*7)]+=v
print('weekly $',[round(wk[i]/1e6) for i in sorted(wk)])
wkn=Counter()
for b,f,t,v,tx in small: wkn[(b-L['start'])//(432000*7)]+=1
print('weekly n',[wkn[i] for i in sorted(wkn)])
json.dump({'testers':sorted(testers)},open('testers.json','w'))
