# python3 market.py -> per-day classification of x402 recipients (idx_*.json), and window-wide buyer stats
import json, glob, collections
AX1 = "0x7284d41b5b852f2bd4c99bdf95043d84452d299c"
files = sorted(glob.glob("idx_*.json"))
prev = None; out = []
win_payer_sellers = collections.defaultdict(set); win_payer_days = collections.Counter()
for fn in files:
    day = fn[4:-5]; idx = json.load(open(fn))
    payer_n = collections.Counter()
    for payee, ps in idx.items():
        for p in ps: payer_n[p] += 1; win_payer_sellers[p].add(payee)
    for p in payer_n: win_payer_days[p] += 1
    cls_usd = collections.Counter(); cls_n = collections.Counter(); cls_w = collections.Counter()
    for payee, ps in idx.items():
        usd = sum(v[1] for v in ps.values()); W = len(ps)
        if payee == AX1: c = "ax1"
        elif W < 20: c = "small (<20 wallets)"
        else:
            ret = sum(1 for p in ps if prev and p in prev.get(payee, {})) / W if prev else None
            excl = sum(1 for p in ps if payer_n[p] == 1) / W
            npp = sum(v[0] for v in ps.values()) / W
            if ret is None: c = "n/a"
            elif ret >= 0.95 and excl >= 0.95: c = "closed fleet"
            elif npp <= 1.05 and W >= 50: c = "one payment per wallet"
            elif ret >= 0.3: c = "repeat buyers (open)"
            else: c = "mostly new wallets"
        cls_usd[c] += usd; cls_n[c] += 1; cls_w[c] += W
    tot = sum(cls_usd.values())
    if prev is not None:
        out.append({"day": day, "usd": round(tot, 2), "by_class": {c: {"recipients": cls_n[c], "usd": round(cls_usd[c], 2), "wallet_links": cls_w[c]} for c in cls_usd}})
    prev = idx
for o in out:
    print(o["day"], o["usd"], "; ".join(f"{c}: {v['recipients']} r, ${v['usd']:.0f}, {v['wallet_links']} w" for c, v in sorted(o["by_class"].items(), key=lambda x: -x[1]["usd"])))
W = len(win_payer_sellers)
multi = sum(1 for s in win_payer_sellers.values() if len(s) >= 2)
multi_noax = sum(1 for s in win_payer_sellers.values() if len(s - {AX1}) >= 2)
print("window wallets", W, "paid >=2 sellers", multi, "excl ax1", multi_noax, "active >=2 days", sum(1 for v in win_payer_days.values() if v >= 2), "all days", sum(1 for v in win_payer_days.values() if v == len(files)))
json.dump({"days": out, "window": {"files": files, "wallets": W, "paid_2plus_sellers": multi, "paid_2plus_sellers_excl_ax1": multi_noax}}, open("market_summary.json", "w"), indent=1)
