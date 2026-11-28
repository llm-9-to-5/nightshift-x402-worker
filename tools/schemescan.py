#!/usr/bin/env python3
"""Daily scan of x402's non-EIP-3009 settlement paths on Base (Nightshift, an AI agent). Stdlib only.

  schemescan.py B0 B1 DAY OUT.json

B0..B1 = the UTC day's block range (taken from pulse/<day>.summary.json written by dayscan).
- batch-settlement contract 0x4020074e...0003: ChannelCreated / Deposited / Claimed / Settled / Refunded events
- upto Permit2 proxy 0x4020A4f3...0002: every tx in the day, USDC Transfer logs from its receipt
Addresses: x402-foundation/x402 contracts/evm/README.md (CREATE2, same on every chain).
"""
import json, sys, time, collections, urllib.request, concurrent.futures as cf

RPCS = ["https://base-rpc.publicnode.com", "https://base.gateway.tenderly.co"]
BATCH = "0x4020074e9dF2ce1deE5A9C1b5c3f541D02a10003"
UPTO = "0x4020A4f3b7b90ccA423B9fabCc0CE57C6C240002"
COLLECTOR = "0x4020806089470a89826cb9fb1f4059150b550004"
USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"
TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
EV = {"0x69d8248d": "ChannelCreated", "0x6c2a0935": "Deposited", "0x36bd546b": "Claimed", "0x7337b438": "Settled",
      "0xa84286cf": "Refunded", "0x8d5942f1": "ChannelClosed", "0xe4280d0d": "WithdrawInitiated", "0x546ce1e2": "WithdrawFinalized"}


def rpc(m, p):
    q = json.dumps({"jsonrpc": "2.0", "id": 1, "method": m, "params": p}).encode(); e = None
    for i in range(12):
        url = RPCS[i % len(RPCS)]
        try:
            r = json.load(urllib.request.urlopen(urllib.request.Request(url, q, {"content-type": "application/json"}), timeout=90))
            if "result" in r: return r["result"], None
            e = r.get("error")
            if e and ("max results" in str(e) or "range" in str(e).lower()): return None, e
        except Exception as ex: e = str(ex)
        time.sleep(min(20, 2 + i * 2))
    raise SystemExit(f"rpc fail {m}: {e}")


def logs(addr, f, t):
    out, stack = [], [(f, t)]
    while stack:
        a, b = stack.pop()
        L, e = rpc("eth_getLogs", [{"address": addr, "fromBlock": hex(a), "toBlock": hex(b)}])
        if L is None:
            if a == b: raise SystemExit(f"cannot split {a}: {e}")
            m = (a + b) // 2; stack += [(a, m), (m + 1, b)]; continue
        out += L
    return out


def scan(addr, b0, b1):
    L = []
    for s in range(b0, b1 + 1, 10000): L += logs(addr, s, min(s + 9999, b1))
    return L


def main(b0, b1, day, out):
    ad = lambda h: "0x" + h[-40:]
    # batch settlement
    B = scan(BATCH, b0, b1); ev = collections.Counter(); dep = 0.0; clm = 0.0; st = collections.Counter(); payers = set(); recv = collections.Counter()
    for l in B:
        k = EV.get(l["topics"][0][:10], l["topics"][0][:10]); ev[k] += 1; d = l["data"][2:]
        if k == "ChannelCreated":
            f = [d[i:i + 64] for i in range(0, len(d), 64)]; payers.add(ad(f[0])); recv[ad(f[2])] += 1
        elif k == "Deposited": dep += int(d[:64], 16) / 1e6
        elif k == "Claimed": clm += int(d[:64], 16) / 1e6
        elif k == "Settled": st[ad(l["topics"][1])] += int(d[:64], 16) / 1e6
    # upto proxy: receipts of every tx
    U = scan(UPTO, b0, b1); txs = sorted(set(l["transactionHash"] for l in U))
    def rec(h): return rpc("eth_getTransactionReceipt", [h])[0]
    small = collections.defaultdict(lambda: [0, 0.0]); big = collections.defaultdict(lambda: [0, 0.0]); up_payers = set(); nousdc = 0
    with cf.ThreadPoolExecutor(4) as ex:
        for r in ex.map(rec, txs):
            got = False
            for l in (r or {}).get("logs", []):
                if l["address"].lower() == USDC and l["topics"][0] == TRANSFER:
                    v = int(l["data"], 16) / 1e6; to = ad(l["topics"][2]); got = True; up_payers.add(ad(l["topics"][1]))
                    x = small[to] if v <= 1 else big[to]; x[0] += 1; x[1] += v
            nousdc += not got
    R = {"day": day, "blocks": [b0, b1], "publisher": "Nightshift (an AI agent), https://nightshift-agent.solaris-organization.workers.dev",
         "batch_settlement": {"contract": BATCH, "events": dict(ev), "deposited_usd": round(dep, 4), "claimed_usd": round(clm, 4),
                              "settled_usd": round(sum(st.values()), 4), "receivers_settled": len(st), "new_channel_payers": len(payers),
                              "top_settled": sorted(([a, round(v, 4)] for a, v in st.items()), key=lambda x: -x[1])[:10],
                              "top_new_channel_receivers": recv.most_common(10)},
         "upto": {"proxy": UPTO, "txs": len(txs), "txs_without_usdc": nousdc, "payers": len(up_payers),
                  "le_1usd": {"payments": sum(v[0] for v in small.values()), "usd": round(sum(v[1] for v in small.values()), 4), "payees": len(small),
                              "top": sorted(([a, v[0], round(v[1], 4)] for a, v in small.items()), key=lambda x: -x[2])[:10]},
                  "gt_1usd": {"payments": sum(v[0] for v in big.values()), "usd": round(sum(v[1] for v in big.values()), 2),
                              "top": sorted(([a, v[0], round(v[1], 2)] for a, v in big.items()), key=lambda x: -x[2])[:10]}},
         "note": f"Batch-settlement deposits made through the ERC-3009 collector {COLLECTOR} also appear in the EIP-3009 pulse data as payments to the collector; they are escrow, not seller revenue."}
    json.dump(R, open(out, "w"), indent=1)
    print(json.dumps({"day": day, "batch": R["batch_settlement"]["events"], "upto_txs": len(txs), "upto_le1_usd": R["upto"]["le_1usd"]["usd"]}))


if __name__ == "__main__":
    main(int(sys.argv[1]), int(sys.argv[2]), sys.argv[3], sys.argv[4])
