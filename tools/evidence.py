# python3 evidence.py OUTDIR pulse/<d1>.json.gz pulse/<d2>.json.gz ...   (consecutive UTC days, from tools/dayscan.mjs)
# Writes records in the x402 sales-integrity schema draft v3.3.3 (x402-foundation/x402#4127, logout2login/x402-probe-workflow):
#   OUTDIR/ecosystem.json            record_type ecosystem_measurement (real x402 index buckets over the window)
#   OUTDIR/sellers/<payTo>.json      record_type per_seller_evidence, for every payTo with >= 3 distinct payer wallets
#   OUTDIR/index.json                one summary row per seller
# Definitions (stated, per UTC day; window end-exclusive):
#   crawler (day d) = payer that paid >= 20 distinct recipients on d.  "outside wallets" = all payers (no operator list known).
#   returning wallet = a wallet that paid this payTo on >= 2 distinct UTC days in the window; returning payments = its payments.
import json, gzip, sys, os, collections, datetime, hashlib

AX1 = "0x7284d41b5b852f2bd4c99bdf95043d84452d299c"
out, files = sys.argv[1], sys.argv[2:]
days = [json.load(gzip.open(f)) for f in files]
days.sort(key=lambda D: D["day"])
ws = days[0]["day"]; we = str(datetime.date.fromisoformat(days[-1]["day"]) + datetime.timedelta(days=1))
DEF = "https://nightshift-agent.solaris-organization.workers.dev/diary/real-x402-index-nov-2026"
DATA = "https://github.com/llm-9-to-5/x402-onchain-data/tree/main/pulse"
sha = hashlib.sha256(b"".join(open(f, "rb").read() for f in sorted(files))).hexdigest()
SCOPE = {"chain": "eip155:8453", "asset_contract": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", "event": "EIP-3009 TransferWithAuthorization",
         "amount_cap_usd": 1, "utc_day_boundary": "00:00:00Z", "probe_level": "chain_read", "window_start": ws, "window_end": we,
         "data_ref": DATA + " (files " + ", ".join(os.path.basename(f) for f in sorted(files)) + ")", "data_sha256": sha}
PUB = {"name": "Nightshift (an AI agent, Claude), github.com/llm-9-to-5", "key_id": "[to-be-published]", "definition_ref": DEF}
CRAWL = {"mark_rule": {"mark_if": "a wallet that paid >= 20 distinct recipients on that UTC day"},
         "population_ref": "scope.chain + scope.event + scope.amount_cap_usd, grouped by UTC day (scope.utc_day_boundary)",
         "recompute_method": {"language": "python", "pseudocode": "for each UTC day d:\n  recipients[w] = distinct payTo paid by payer w on d\n  crawlers[d] = { w : len(recipients[w]) >= 20 }\nper-day crawler lists: pulse/<day>.crawlers.json in the data_ref repo"}}
TH = [{"name": "small_seller_20_wallet_bar_per_day", "window": "per_day", "value": 20, "unit": "distinct wallets / day", "aggregate": "max",
       "classifier": {"kind": "below_size_threshold", "applied_to": "per_day"}},
      {"name": "small_seller_20_wallet_bar_series", "window": "whole_series", "value": 20, "unit": "distinct wallets / series",
       "classifier": {"kind": "below_size_threshold", "applied_to": "whole_series"}}]
NM = {"delivery": False, "single_buyer_determination": False, "note": "Chain data only: whether anything was delivered, and whether a wallet is one buyer, are not determined."}

# per seller accumulation
S = collections.defaultdict(lambda: {"pay": 0, "usd": 0.0, "wallets": collections.defaultdict(lambda: [0, set()]), "crawl_pay": 0, "crawlers": set(), "maxday": 0})
for D in days:
    deg = {w: len(s) for w, s in D["payers"].items()}
    pn = D.get("pn", {})
    for w, s in D["payers"].items():
        for to, usd in s.items():
            n = pn.get(w, {}).get(to, 1)
            e = S[to]; e["pay"] += n; e["usd"] += usd
            ww = e["wallets"][w]; ww[0] += n; ww[1].add(D["day"])
            if deg[w] >= 20: e["crawl_pay"] += n; e["crawlers"].add(w)
    for to, (n, usd, pc) in D["payees"].items():
        S[to]["maxday"] = max(S[to]["maxday"], pc)
    if "pn" not in D: print("WARNING: no per-pair counts for", D["day"], "(payment counts per wallet assume 1)", file=sys.stderr)

vd = lambda x: "below_bar" if x < 20 else "at_bar" if x == 20 else "above_bar"
os.makedirs(out + "/sellers", exist_ok=True); rows = []
for to, e in S.items():
    W = len(e["wallets"])
    if W < 3: continue
    ret = [w for w, (n, ds) in e["wallets"].items() if len(ds) >= 2]
    rp = sum(e["wallets"][w][0] for w in ret)
    pay = max(e["pay"], 1)
    rec = {"schema_version": "v3.3.3-draft", "record_type": "per_seller_evidence", "publisher": PUB, "scope": SCOPE,
           "method": {"thresholds": TH, "crawler_spec": CRAWL}, "not_measured": NM,
           "evidence": {"payTo": "0x" + to[2:].lower(),
                        "counts": {"payments": e["pay"], "distinct_outside_wallets": W, "returning_wallets": len(ret), "returning_payments": rp},
                        "returning_wallet_share_by_payments": round(rp / pay, 6), "returning_wallet_share_by_wallets": round(len(ret) / W, 6),
                        "crawler_payer_share_by_payments": round(e["crawl_pay"] / pay, 6), "crawler_payer_share_by_payers": round(len(e["crawlers"]) / W, 6),
                        "threshold_verdicts": [
                            {"threshold": "small_seller_20_wallet_bar_per_day", "window": "per_day", "aggregate": "max", "observed": e["maxday"], "verdict": vd(e["maxday"])},
                            {"threshold": "small_seller_20_wallet_bar_series", "window": "whole_series", "observed": W, "verdict": vd(W)}]}}
    json.dump(rec, open(f"{out}/sellers/{to}.json", "w"), indent=1)
    rows.append({"payTo": to, "usd": round(e["usd"], 2), "payments": e["pay"], "wallets": W, "returning_wallets": len(ret),
                 "crawler_wallets": len(e["crawlers"]), "max_wallets_per_day": e["maxday"], "contest": to == AX1})
rows.sort(key=lambda r: -r["wallets"])
json.dump({"window_start": ws, "window_end": we, "publisher": PUB["name"], "sellers": rows}, open(out + "/index.json", "w"), indent=0)

# ecosystem record: sum of the per-day real-index waterfall (pulse/<day>.real.json from tools/derive.mjs)
reals = [json.load(open(f.replace(".json.gz", ".real.json"))) for f in files if os.path.exists(f.replace(".json.gz", ".real.json"))]
if reals:
    T = sum(r["total"] for r in reals); org = sum(r["real"] for r in reals); unc = sum(r["small_sellers"] for r in reals)
    o, u = round(org / T, 6), round(unc / T, 6); i = round(1 - o - u, 6)
    eco = {"schema_version": "v3.3.3-draft", "record_type": "ecosystem_measurement", "publisher": PUB,
           "scope": {**SCOPE, "window_start": min(r["day"] for r in reals), "window_end": str(datetime.date.fromisoformat(max(r["day"] for r in reals)) + datetime.timedelta(days=1))},
           "method": {"thresholds": TH[:1], "crawler_spec": CRAWL}, "not_measured": NM,
           "result": {"buckets": {"open_market_share": o, "identified_non_organic_share": i, "unclassified_share": u},
                      "headline": {"outside_open_market_share": round(i + u, 6),
                                   "caveat": f"Sum of daily waterfalls over {len(reals)} UTC days, USD-weighted (${T:,.0f} total, ${org:,.0f} open-market). Only identified_non_organic_share (contest, crawler probes, closed fleets, one-payment-per-wallet sellers) is asserted non-organic; unclassified_share is sellers below 20 non-crawler wallets that day and likely includes real business customers."}}}
    json.dump(eco, open(out + "/ecosystem.json", "w"), indent=1)
    print("ecosystem", eco["result"])
print("sellers with >=3 wallets:", len(rows))
