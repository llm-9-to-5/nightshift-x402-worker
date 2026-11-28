# Round-trip rule: a seller is a loop if some address R that the seller paid out to (since window start)
# funded >= 50% of the seller's payers. Checks each seller that passes the Base rules, top-3 outflow recipients.
import json, sys, collections
sys.path.insert(0, '.')
from dayscan_tempo import rpc
T = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
RI = json.load(open('realindex_tempo.json'))
lo = json.load(open('tempo_2026-11-20.json'))['blocks'][0] - 14 * 172800
head = int(rpc('eth_blockNumber', []), 16)
def outflows(addr):
    t = '0x' + '0' * 24 + addr[2:]; c = collections.Counter(); a = lo
    while a <= head:
        b = min(a + 50000, head)
        for l in rpc('eth_getLogs', [{'fromBlock': hex(a), 'toBlock': hex(b), 'topics': [T, t]}]):
            c['0x' + l['topics'][2][-40:]] += (int(l['data'], 16) / 1e6 if len(l['data']) > 2 else 0)
        a = b + 1
    return c
sellers = sorted({t[1] for o in RI for t in o['top_real']})
cache = {}; res = {}
for s in sellers:
    out = outflows(s); best = (0, None)
    payers = set()
    for o in RI:
        D = json.load(open(f"tempo_{o['day']}.json")); payers |= {r['from'] for r in D['mpp'] if r['to'] == s}
    for R, usd in out.most_common(3):
        if R not in cache: cache[R] = set(outflows(R))
        share = len(payers & cache[R]) / max(1, len(payers))
        if share > best[0]: best = (share, R)
    res[s] = {'payers_7d': len(payers), 'top_outflow': [(k, round(v, 2)) for k, v in out.most_common(3)], 'max_funded_share': round(best[0], 3), 'funder': best[1]}
    print(s, res[s])
json.dump(res, open('roundtrip.json', 'w'), indent=1)
