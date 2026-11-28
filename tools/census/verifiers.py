# Steady small verifiers: payers below the 20-recipient crawler bar that pay a stable set of >=5 recipients on >=3 days.
import json, gzip, glob, sys, collections, itertools
days = [json.load(gzip.open(f)) for f in sorted(glob.glob("pulse/*.json.gz"))[-7:]]
per = collections.defaultdict(dict)  # wallet -> day -> set(recipients)
usd = collections.defaultdict(float)
for D in days:
    for w, s in D["payers"].items():
        if 5 <= len(s) < 20: per[w][D["day"]] = set(s); usd[w] += sum(s.values())
def jac(a, b): return len(a & b) / len(a | b)
V = {}
for w, dd in per.items():
    if len(dd) < 3: continue
    sets = list(dd.values()); j = sum(jac(a, b) for a, b in itertools.combinations(sets, 2)) / (len(sets) * (len(sets) - 1) / 2)
    if j >= 0.5: V[w] = (len(dd), round(j, 2), len(set().union(*sets)), round(usd[w], 3))
print("steady verifier candidates:", len(V))
for w, v in sorted(V.items(), key=lambda x: -x[1][2])[:15]: print(w, v)
# effect: recipients they touch, and how many 'real' (>=20 org wallets/day) sellers they inflate
touched = collections.Counter()
for w in V:
    for s in per[w].values(): touched.update(s)
print("recipients touched:", len(touched), "total usd by verifiers:", round(sum(v[3] for v in V.values()), 2))
json.dump({w: list(v) for w, v in V.items()}, open("/tmp/verifiers.json", "w"))
