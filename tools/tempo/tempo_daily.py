#!/usr/bin/env python3
"""Daily MPP-on-Tempo scan + real index (run by Nightshift, an AI agent).
Usage: tempo_daily.py DAY OUTDIR LABELDIR
Writes OUTDIR/DAY.json.gz (raw MPP-tagged charges) and OUTDIR/DAY.real.json (waterfall), updates OUTDIR/index.json.
Waterfall (same rules as the Base real x402 index, plus round-trip loops):
 total (<= $1 MPP-tagged TIP-20 transferWithMemo) - crawler probes (payer paid >= 20 payTos that day)
 - small sellers (< 20 non-crawler wallets) - known round-trip loops (labels/tempo_loops.json: payTo whose
 outflows fund >= 50% of its payers) - closed fleets (>= 95% returning and exclusive) - one pay per wallet = real.
"""
import json, sys, os, gzip, datetime, collections, subprocess
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import dayscan_tempo as ds

def load(path):
    if not os.path.exists(path): return None
    with gzip.open(path, 'rt') as f: return json.load(f)

def index(D):
    idx = collections.defaultdict(dict); srv = collections.defaultdict(collections.Counter)
    for r in D['mpp']:
        if r['usd'] > 1: continue
        v = idx[r['to']].setdefault(r['from'], [0, 0.0]); v[0] += 1; v[1] += r['usd']; srv[r['to']][r['srv']] += 1
    return idx, srv

def waterfall(D, P, loops, fp):
    idx, srv = index(D); prev = index(P)[0] if P else None
    payer_n = collections.Counter()
    for ps in idx.values():
        for p in ps: payer_n[p] += 1
    crawl = {p for p, n in payer_n.items() if n >= 20}
    w = collections.OrderedDict((k, 0.0) for k in ['total', 'crawler_probes', 'small_sellers', 'round_trip_loops', 'closed_fleets', 'one_pay_per_wallet', 'real'])
    top = []; wr = set()
    for payee, ps in idx.items():
        usd = sum(v[1] for v in ps.values()); w['total'] += usd
        cu = sum(v[1] for p, v in ps.items() if p in crawl); w['crawler_probes'] += cu
        org = {p: v for p, v in ps.items() if p not in crawl}; ou = usd - cu; W = len(org)
        if W < 20: w['small_sellers'] += ou; continue
        if payee in loops: w['round_trip_loops'] += ou; continue
        ret = excl = None
        if prev is not None:
            ret = sum(1 for p in org if p in prev.get(payee, {})) / W
            excl = sum(1 for p in org if payer_n[p] == 1) / W
            if ret >= 0.95 and excl >= 0.95: w['closed_fleets'] += ou; continue
        if W >= 50 and sum(v[0] for v in org.values()) / W <= 1.05: w['one_pay_per_wallet'] += ou; continue
        w['real'] += ou; wr |= set(org)
        names = [fp.get(s, {}).get('realm', s) for s, _ in srv[payee].most_common(3)]
        top.append({'payTo': payee, 'usd': round(ou, 2), 'wallets': W, 'returning': ret and round(ret, 2), 'exclusive': excl and round(excl, 2), 'servers': names})
    top.sort(key=lambda t: -t['usd'])
    return {'day': D['day'], 'chain': 'tempo', 'blocks': D['blocks'], **{k: round(v, 2) for k, v in w.items()},
            'payers': len(payer_n), 'real_sellers': len(top), 'real_wallets': len(wr), 'all_mpp_usd': round(sum(r['usd'] for r in D['mpp']), 2),
            'non_mpp_memo_transfers': D.get('non_mpp_memo_transfers'), 'top_real': top[:15],
            'method': 'https://github.com/llm-9-to-5/nightshift-x402-worker/tree/main/tools/tempo'}

def main():
    day, outdir, labeldir = sys.argv[1], sys.argv[2], sys.argv[3]
    os.makedirs(outdir, exist_ok=True)
    raw = os.path.join(outdir, f'{day}.json.gz')
    D = load(raw)
    if D is None:
        tmp = f'/tmp/tempo_{day}.json'; sys.argv = ['x', day, tmp]; ds.main(); D = json.load(open(tmp))
        with gzip.open(raw, 'wt') as f: json.dump(D, f)
    pday = (datetime.date.fromisoformat(day) - datetime.timedelta(days=1)).isoformat()
    P = load(os.path.join(outdir, f'{pday}.json.gz'))
    loops = set(json.load(open(os.path.join(labeldir, 'tempo_loops.json')))['loops'])
    fp = json.load(open(os.path.join(labeldir, 'mpp_fingerprints.json')))
    R = waterfall(D, P, loops, fp)
    json.dump(R, open(os.path.join(outdir, f'{day}.real.json'), 'w'), indent=1)
    ip = os.path.join(outdir, 'index.json')
    I = json.load(open(ip)) if os.path.exists(ip) else {'days': {}}
    I['days'][day] = {k: R[k] for k in ['total', 'crawler_probes', 'small_sellers', 'round_trip_loops', 'closed_fleets', 'one_pay_per_wallet', 'real', 'payers', 'real_sellers', 'real_wallets', 'all_mpp_usd']}
    I['days'] = dict(sorted(I['days'].items())); I['updated'] = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    json.dump(I, open(ip, 'w'), indent=1)
    print(json.dumps({k: R[k] for k in list(R)[:12]}))

if __name__ == '__main__':
    main()
