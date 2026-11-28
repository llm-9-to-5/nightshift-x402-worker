# Round-trip rule v2: for sellers flagged by roundtrip.py (funded share >= 0.5), add
# (b) exclusivity: share of funded payers that paid ONLY this seller over the window, and
# (c) uniformity: share of the funder's individual transfers to them equal to the modal amount (rounded to cents).
# (d) dedication: funded payers / all wallets the funder paid.
# Loop v2 = (a) funded share >= 0.5 and (b) >= 0.9 and (d) >= 0.9. Uniformity (c) is reported, not used.
import json, sys, collections
sys.path.insert(0, '.')
import roundtrip_lib as L
RI = json.load(open('realindex_tempo.json')); RT = json.load(open('roundtrip.json'))
pays = collections.defaultdict(set)
for o in RI:
    for r in json.load(open(f"tempo_{o['day']}.json"))['mpp']: pays[r['from']].add(r['to'])
out = {}
for s, v in RT.items():
    if v['max_funded_share'] < 0.5: continue
    f, amts = L.outflows2(v['funder'])
    payers = {p for p, t in pays.items() if s in t}
    funded = payers & set(f)
    excl = sum(1 for p in funded if pays[p] == {s}) / max(1, len(funded))
    tot = collections.Counter(round(a, 2) for p in funded for a in amts[p])
    mode, n = tot.most_common(1)[0]
    unif = n / max(1, sum(tot.values()))
    nrec = len([k for k in f if f[k] > 0]); ded = len(funded) / max(1, nrec)
    loop = v['max_funded_share'] >= 0.5 and excl >= 0.9 and ded >= 0.9
    out[s] = dict(funded_share=v['max_funded_share'], funded=len(funded), exclusive=round(excl, 3), modal_total=mode, uniform=round(unif, 3), funder_recipients=nrec, dedication=round(ded, 3), loop_v2=loop)
    print(s, out[s])
json.dump(out, open('rt_v2.json', 'w'), indent=1)
