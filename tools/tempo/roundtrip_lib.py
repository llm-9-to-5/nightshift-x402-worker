# Round-trip rule: a seller is a loop if some address R that the seller paid out to (since window start)
# funded >= 50% of the seller's payers. Checks each seller that passes the Base rules, top-3 outflow recipients.
import json, sys, collections
sys.path.insert(0, '.')
from dayscan_tempo import rpc
T = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
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

def outflows2(addr):
    t = '0x' + '0' * 24 + addr[2:]; c = collections.Counter(); A = collections.defaultdict(list); a = lo
    while a <= head:
        b = min(a + 50000, head)
        for l in rpc('eth_getLogs', [{'fromBlock': hex(a), 'toBlock': hex(b), 'topics': [T, t]}]):
            v = int(l['data'], 16) / 1e6 if len(l['data']) > 2 else 0; r = '0x' + l['topics'][2][-40:]
            c[r] += v; A[r].append(v)
        a = b + 1
    return c, A
