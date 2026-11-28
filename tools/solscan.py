#!/usr/bin/env python3
"""Solana x402 day scan (Nightshift, an AI agent). Stdlib only.

x402 'exact' payments on Solana are SPL token transfers signed by the buyer, with a facilitator
as fee payer. We list every successful tx whose fee payer is a known facilitator address, in one
UTC day, then read each tx's transfers (amount, buyer = transfer authority, seller = owner of the
destination token account).

  solscan.py list  DAY OUT.json                 # signatures per facilitator fee payer
  solscan.py fetch SIGS.json SHARD NSHARDS OUT.jsonl
  solscan.py merge DAY SIGS.json OUTDIR PART.jsonl...   # -> OUTDIR/DAY.{tx.jsonl.gz,pulse.json.gz,summary.json}

Every fetched row is written, and a tx that no RPC returned is written with "missing": true.
The summary counts missing rows, so silent undercounts are visible.
"""
import json, sys, os, time, gzip, datetime, urllib.request, collections, concurrent.futures as cf

# Facilitator fee payers on Solana mainnet. Sources: each facilitator's GET /supported (extra.feePayer)
# and x402scan.com/facilitators. Add more here and they are picked up next run.
FAC = {
    "PayAI": ["CjNFTjvBhbJJd2B5ePPMHRLx1ELZpa8dwQgGL727eKww", "2wKupLR9q6wXYppw8Gr2NvWxKBUqm4PPJKkQfoxHDBg4"],
    "Coinbase": ["L54zkaPQFeTn1UsEqieEXBqWrPShiaZEPD7mS5WXfQg", "BENrLoUbndxoNMUS5JXApGMtNykLjFXXixMtpDwDR9SP",
                 "BFK9TLC3edb13K6v4YyH3DwPb5DSUpkWvb7XnqCL9b4F", "D6ZhtNQ5nT9ZnTHUbqXZsTx5MH2rPFiBBggX4hY1WePM",
                 "GVJJ7rdGiXr5xaYbRwRbjfaJL7fmwRygFi1H6aGqDveb", "Hc3sdEAsCGQcpgfivywog9uwtk8gUBUZgsxdME1EJy88",
                 "92QcYJZpkwYyacR3G69QNR2JfjadQxd16cp5d7x5GEzU"],
    "Dexter": ["DeXterR2kQm8AvRHnNPatWkE46TfAcMeBDjb6FySoAb8"],
    "Daydreams": ["DuQ4jFMmVABWGxabYHFkGzdyeJgS1hp4wrRuCtsJgT9a"],
    "UltravioletaDAO": ["F742C4VfFLQ9zRQyithoj5229ZgtX2WqKCSFKgH2EThq"],
    "other": ["8B5UKhwfAyFW67h58cBkQj1Ur6QXRgwWJJcQp8ZBsDPa", "Hbe1vdFs4EQVVAzcV12muHhr6DEKwrT9roMXGPLxLBLP"],
}
MINTS = {"EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v": "USDC", "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB": "USDT"}
OFFICIAL = "https://api.mainnet-beta.solana.com"   # complete history; rate-limited
FAST = "https://solana-rpc.publicnode.com"          # fast; getSignaturesForAddress history truncated, some txs null


def rpc(url, m, p, tries=25):
    q = json.dumps({"jsonrpc": "2.0", "id": 1, "method": m, "params": p}).encode()
    for i in range(tries):
        try:
            r = json.load(urllib.request.urlopen(urllib.request.Request(url, q, {"content-type": "application/json"}), timeout=40))
            if "result" in r:
                return r["result"], True
        except Exception:
            pass
        time.sleep(min(20, 1.5 + i * 1.5))
    return None, False


def day_bounds(day):
    t0 = int(datetime.datetime.fromisoformat(day + "T00:00:00+00:00").timestamp())
    return t0, t0 + 86400


def cmd_list(day, out):
    t0, t1 = day_bounds(day); sigs = []; counts = {}
    for fac, L in FAC.items():
        for a in L:
            before, n = None, 0
            while True:
                p = {"limit": 1000}
                if before: p["before"] = before
                s, ok = rpc(OFFICIAL, "getSignaturesForAddress", [a, p])
                time.sleep(0.8)
                if not ok: raise SystemExit(f"list failed for {a}")   # never silently truncate
                if not s: break
                for x in s:
                    bt = x.get("blockTime")
                    if bt and t0 <= bt < t1 and not x["err"]:
                        sigs.append([fac, a, x["signature"], bt]); n += 1
                before = s[-1]["signature"]
                if s[-1].get("blockTime") and s[-1]["blockTime"] < t0: break
            counts[a] = n; print(fac, a, n, flush=True)
    json.dump({"day": day, "counts": counts, "sigs": sigs}, open(out, "w"))


def parse(t):
    keys = [k["pubkey"] for k in t["transaction"]["message"]["accountKeys"]]
    own = {}
    for b in (t["meta"].get("preTokenBalances") or []) + (t["meta"].get("postTokenBalances") or []):
        own[keys[b["accountIndex"]]] = (b.get("owner"), b.get("mint"))
    tr = []
    ins = list(t["transaction"]["message"]["instructions"])
    for g in t["meta"].get("innerInstructions") or []: ins += g["instructions"]
    for i in ins:
        pr = i.get("parsed")
        if i.get("program") in ("spl-token", "spl-token-2022") and isinstance(pr, dict) and pr.get("type") in ("transferChecked", "transfer"):
            f = pr["info"]; dst = own.get(f["destination"], (None, None))
            mint = f.get("mint") or dst[1]
            amt = int(f["tokenAmount"]["amount"]) if "tokenAmount" in f else int(f.get("amount", 0))
            tr.append({"from": f.get("authority") or f.get("multisigAuthority"), "to": dst[0] or f["destination"], "mint": MINTS.get(mint, mint), "amt": amt})
    return tr


def get_tx(sig):
    p = [sig, {"encoding": "jsonParsed", "maxSupportedTransactionVersion": 1, "commitment": "finalized"}]
    t, ok = rpc(FAST, "getTransaction", p, tries=4)
    if t: return t, "fast"
    t, ok = rpc(OFFICIAL, "getTransaction", p, tries=25)
    return t, "official"


def cmd_fetch(sigsf, shard, nsh, out):
    S = json.load(open(sigsf))["sigs"]; mine = [s for k, s in enumerate(S) if k % nsh == shard]
    done = set()
    if os.path.exists(out):
        for l in open(out): done.add(json.loads(l)["sig"])
    todo = [s for s in mine if s[2] not in done]; print("shard", shard, "todo", len(todo), flush=True)
    W = int(os.environ.get("W", "4"))
    def one(s):
        fac, fp, sig, bt = s; t, src = get_tx(sig)
        if not t: return {"sig": sig, "fac": fac, "fp": fp, "t": bt, "missing": True, "tr": []}
        return {"sig": sig, "fac": fac, "fp": fp, "t": bt, "src": src, "tr": parse(t)}
    with open(out, "a") as fo, cf.ThreadPoolExecutor(W) as ex:
        for k, r in enumerate(ex.map(one, todo)):
            fo.write(json.dumps(r) + "\n"); fo.flush()
            if k % 1000 == 0: print("fetched", k, time.strftime("%H:%M:%S"), flush=True)


def cmd_merge(day, sigsf, outdir, parts, cap=1.0):
    L = json.load(open(sigsf)); rows = {}
    for f in parts:
        for l in open(f):
            r = json.loads(l)
            if r["sig"] not in rows or rows[r["sig"]].get("missing"): rows[r["sig"]] = r
    os.makedirs(outdir, exist_ok=True)
    with gzip.open(f"{outdir}/{day}.tx.jsonl.gz", "wt") as g:
        for r in rows.values(): g.write(json.dumps(r) + "\n")
    P = collections.defaultdict(lambda: collections.defaultdict(float)); n = collections.Counter(); u = collections.Counter()
    byfac = collections.defaultdict(lambda: [0, 0.0]); big = [0, 0.0]; nonusdc = collections.Counter(); notr = 0; missing = 0; other_mints = collections.Counter()
    for r in rows.values():
        if r.get("missing"): missing += 1; continue
        if not r["tr"]: notr += 1
        for t in r["tr"]:
            usd = t["amt"] / 1e6
            if t["mint"] != "USDC":
                if t["mint"] == "USDT": nonusdc["USDT"] += usd
                else: other_mints[t["mint"]] += 1   # unknown decimals: count only
                continue
            if usd > cap: big[0] += 1; big[1] += usd; continue
            P[t["from"]][t["to"]] += usd; n[t["to"]] += 1; u[t["to"]] += usd
            byfac[r["fac"]][0] += 1; byfac[r["fac"]][1] += usd
    pc = collections.Counter()
    for p, s in P.items():
        for q in s: pc[q] += 1
    D = {"v": 2, "day": day, "chain": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp", "payers": {p: dict(s) for p, s in P.items()},
         "payees": {q: [n[q], u[q], pc[q]] for q in n}}
    with gzip.open(f"{outdir}/{day}.pulse.json.gz", "wt") as g: json.dump(D, g)
    fp = collections.Counter(s[1] for s in L["sigs"])
    summ = {"day": day, "publisher": "Nightshift (an AI agent), https://nightshift-agent.solaris-organization.workers.dev",
            "scope": {"chain": "solana mainnet", "rule": "successful txs whose fee payer is a known x402 facilitator address; SPL USDC transfers <= $1 counted as x402 payments", "facilitators": FAC},
            "signatures": len(L["sigs"]), "by_fee_payer": dict(fp), "rows": len(rows), "missing_txs": missing, "txs_without_token_transfer": notr,
            "payments_le_1usd": sum(n.values()), "usd_le_1usd": round(sum(u.values()), 2), "payers": len(P), "payees": len(n),
            "by_facilitator": {k: [v[0], round(v[1], 2)] for k, v in byfac.items()},
            "usdc_over_cap": [big[0], round(big[1], 2)], "non_usdc_usd": {k: round(v, 2) for k, v in nonusdc.items()}, "other_mint_transfers": dict(other_mints),
            "top_payees": sorted(([q, n[q], round(u[q], 4), pc[q]] for q in n), key=lambda x: -x[2])[:25]}
    json.dump(summ, open(f"{outdir}/{day}.summary.json", "w"), indent=1)
    print(json.dumps({k: summ[k] for k in ("signatures", "rows", "missing_txs", "payments_le_1usd", "usd_le_1usd", "payers", "payees")}))


if __name__ == "__main__":
    a = sys.argv[1:]
    if a[0] == "list": cmd_list(a[1], a[2])
    elif a[0] == "fetch": cmd_fetch(a[1], int(a[2]), int(a[3]), a[4])
    elif a[0] == "merge": cmd_merge(a[1], a[2], a[3], a[4:])
