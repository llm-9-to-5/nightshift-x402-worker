#!/usr/bin/env python3
"""Scan one UTC day of MPP charges on Tempo mainnet (chain 4217).

An MPP charge made with the mppx SDK is a TIP-20 transferWithMemo whose memo
(indexed topic3) starts with keccak256("mpp")[0:4] = 0xef1ed712 + version 0x01.
memo bytes 5..14 = keccak256(serverId/realm)[0:10], 15..24 = clientId fingerprint.
Usage: dayscan_tempo.py YYYY-MM-DD [out.json]
"""
import json, sys, time, datetime, urllib.request

RPC = "https://rpc.tempo.xyz"
TOPIC = "0x57bc7354aa85aed339e000bccffabbc529466af35f0772c8f8ee1145927de7f0"
TAG = "0xef1ed71201"
TOKENS = {
    "0x20c0000000000000000000006a37da5c996874be": "OUSD",
    "0x20c0000000000000000000006fd9a167923ba194": "DLUSD",
    "0x20c000000000000000000000b9537d11c60e8b50": "USDC.e",
    "0x20c000000000000000000000f37de3740adec032": "MACH",
    "0x20c0000000000000000000000000000000000000": "pathUSD",
}
CHUNK = 20000


def rpc(method, params, tries=6):
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode()
    for i in range(tries):
        try:
            req = urllib.request.Request(RPC, body, {"content-type": "application/json", "user-agent": "nightshift-measure/1"})
            r = json.load(urllib.request.urlopen(req, timeout=120))
            if "result" in r:
                return r["result"]
            err = r.get("error")
        except Exception as e:  # noqa
            err = str(e)
        time.sleep(2 * (i + 1))
    raise RuntimeError(f"{method} failed: {err}")


def ts(b):
    return int(rpc("eth_getBlockByNumber", [hex(b), False])["timestamp"], 16)


def block_at(t, lo, hi):
    """first block with timestamp >= t"""
    while lo < hi:
        m = (lo + hi) // 2
        if ts(m) < t:
            lo = m + 1
        else:
            hi = m
    return lo


def logs(a, b):
    try:
        return rpc("eth_getLogs", [{"fromBlock": hex(a), "toBlock": hex(b), "topics": [TOPIC]}], tries=3)
    except RuntimeError:
        if b - a < 500:
            raise
        m = (a + b) // 2
        return logs(a, m) + logs(m + 1, b)


def main():
    day = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else f"tempo_{day}.json"
    d0 = int(datetime.datetime.strptime(day, "%Y-%m-%d").replace(tzinfo=datetime.timezone.utc).timestamp())
    head = int(rpc("eth_blockNumber", []), 16)
    start = block_at(d0, 1, head)
    end = block_at(d0 + 86400, start, head) - 1
    rows, other = [], 0
    a = start
    while a <= end:
        b = min(a + CHUNK - 1, end)
        for l in logs(a, b):
            memo = l["topics"][3]
            if not memo.startswith(TAG):
                other += 1
                continue
            rows.append({
                "b": int(l["blockNumber"], 16),
                "tx": l["transactionHash"],
                "tok": TOKENS.get(l["address"].lower(), l["address"].lower()),
                "from": "0x" + l["topics"][1][-40:],
                "to": "0x" + l["topics"][2][-40:],
                "usd": int(l["data"], 16) / 1e6,
                "srv": "0x" + memo[12:32],
                "cli": "0x" + memo[32:52],
            })
        a = b + 1
        print(f"{day} {a-start}/{end-start+1} rows={len(rows)}", file=sys.stderr)
    json.dump({"day": day, "blocks": [start, end], "mpp": rows, "non_mpp_memo_transfers": other}, open(out, "w"))
    print(out, len(rows), other)


if __name__ == "__main__":
    main()
