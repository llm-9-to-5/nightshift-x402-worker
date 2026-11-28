# OUSD MPP charges 19-27 Nov split by payer first-seen day (before/after Visa CLI launch 22 Nov) and funder class.
# Needs tempo_<day>.json (dayscan_tempo.py), fingerprints.json, ousd_funders.json (ousd_funders.py).
import json, collections
fp = json.load(open('fingerprints.json'))
J = json.load(open('ousd_funders.json')); F = J['first_day']; I = J['inbound']
ONR = '0xf70da97812cb96acdf810712aa562db8dfa3dbef'; TM = '0xf4f4a00011b080ebc1e599a765d8bce7557b97e7'
def cls(p):
    s = {x[0] for x in I.get(p, [])}
    return 'taskmarket-funded' if TM in s else ('topup-funded' if ONR in s else 'other')
spend = collections.defaultdict(collections.Counter); cnt = collections.defaultdict(collections.Counter)
for d in range(19, 28):
    for r in json.load(open(f'tempo_2026-11-{d}.json'))['mpp']:
        if r['tok'] != 'OUSD': continue
        p = r['from']; g = ('new' if F[p] >= 22 else 'old') + '/' + cls(p)
        name = (fp.get(r['srv']) or {}).get('name') or ('Taskmarket' if r['to'].startswith('0x3c0820') else r['to'][:10])
        spend[g][name] += r['usd']; cnt[g][name] += 1
for g in sorted(spend):
    print(g, [(k, round(v, 2), cnt[g][k]) for k, v in spend[g].most_common(8)])
