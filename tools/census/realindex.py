# python3 realindex.py -> "Real x402 index": per UTC day, USD of <=$1 Base EIP-3009 payments that look like open-market
# commerce. Waterfall: total -> minus AX1 contest -> minus paid probes from crawler wallets (paid >=20 recipients that day)
# -> minus sellers with <20 non-crawler wallets -> minus closed fleets (>=95% returning AND >=95% exclusive)
# -> minus one-payment-per-wallet sellers (>=50 wallets, <=1.05 payments/wallet) = real index.
import json, glob, collections, csv
AX1 = "0x7284d41b5b852f2bd4c99bdf95043d84452d299c"
files = sorted(glob.glob("idx_*.json")); prev = None; out = []
for fn in files:
    day = fn[4:-5]; idx = json.load(open(fn))
    payer_n = collections.Counter()
    for payee, ps in idx.items():
        for p in ps: payer_n[p] += 1
    crawl = {p for p, n in payer_n.items() if n >= 20}
    w = collections.OrderedDict((k, 0.0) for k in ["total", "ax1_contest", "crawler_probes", "small_sellers", "closed_fleets", "one_pay_per_wallet", "real"])
    nreal = 0; wallets_real = set(); top = []
    for payee, ps in idx.items():
        usd = sum(v[1] for v in ps.values()); w["total"] += usd
        if payee == AX1: w["ax1_contest"] += usd; continue
        cu = sum(v[1] for p, v in ps.items() if p in crawl); w["crawler_probes"] += cu
        org = {p: v for p, v in ps.items() if p not in crawl}; ou = usd - cu; W = len(org)
        if W < 20: w["small_sellers"] += ou; continue
        if prev is not None:
            ret = sum(1 for p in org if p in prev.get(payee, {})) / W
            excl = sum(1 for p in org if payer_n[p] == 1) / W
            if ret >= 0.95 and excl >= 0.95: w["closed_fleets"] += ou; continue
        if W >= 50 and sum(v[0] for v in org.values()) / W <= 1.05: w["one_pay_per_wallet"] += ou; continue
        w["real"] += ou; nreal += 1; wallets_real |= set(org); top.append((ou, payee, W))
    if prev is not None:
        top.sort(reverse=True)
        out.append({"day": day, **{k: round(v, 2) for k, v in w.items()}, "real_sellers": nreal, "real_wallets": len(wallets_real),
                    "real_share": round(w["real"] / w["total"], 4), "top_real": [[a, round(u, 2), n] for u, a, n in top[:10]]})
    prev = idx
for o in out: print(o["day"], {k: o[k] for k in list(o)[1:-1]})
json.dump(out, open("realindex.json", "w"), indent=1)
with open("realindex.csv", "w") as f:
    cw = csv.writer(f); keys = [k for k in out[0] if k != "top_real"]; cw.writerow(keys)
    for o in out: cw.writerow([o[k] for k in keys])
