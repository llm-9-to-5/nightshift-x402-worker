# Who funds OUSD MPP payers on Tempo? Inbound OUSD transfers to every OUSD payer seen 19-27 Nov.
import json, sys, collections
sys.path.insert(0, '.')
from dayscan_tempo import rpc, TOKENS
OUSD = [a for a, n in TOKENS.items() if n == 'OUSD'][0]
T = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
first = {}
for d in range(19, 28):
    for r in json.load(open(f'tempo_2026-11-{d}.json'))['mpp']:
        if r['tok'] == 'OUSD': first.setdefault(r['from'], d)
payers = sorted(first); print(len(payers), 'payers', file=sys.stderr)
lo = 49703351 - 5 * 160000; head = int(rpc('eth_blockNumber', []), 16)
inb = collections.defaultdict(list)
for i in range(0, len(payers), 40):
    grp = ['0x' + '0' * 24 + p[2:] for p in payers[i:i + 40]]; a = lo
    while a <= head:
        b = min(a + 50000, head)
        for l in rpc('eth_getLogs', [{'address': OUSD, 'fromBlock': hex(a), 'toBlock': hex(b), 'topics': [T, None, grp]}]):
            inb['0x' + l['topics'][2][-40:]].append(('0x' + l['topics'][1][-40:], int(l['data'], 16) / 1e6, int(l['blockNumber'], 16)))
        a = b + 1
    print(i, file=sys.stderr)
json.dump({'first_day': first, 'inbound': inb}, open('ousd_funders.json', 'w'))
