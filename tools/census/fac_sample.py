# python3 fac_sample.py day_START.json N -> fac_<START>.json: uniform sample of <= $1 payments with tx submitter + target + selector
import json, sys, random, urllib.request, concurrent.futures as cf
d = json.load(open(sys.argv[1])); N = int(sys.argv[2]); random.seed(9)
rows = [r for r in d["rows"] if 0 < r["v"] <= 1]
S = random.sample(rows, N)
def rpc(m, p):
    for i in range(5):
        try:
            return json.loads(urllib.request.urlopen(urllib.request.Request("https://base-rpc.publicnode.com", json.dumps({"jsonrpc": "2.0", "id": 1, "method": m, "params": p}).encode(), {"content-type": "application/json"}), timeout=60).read())["result"]
        except Exception: pass
def get(r):
    t = rpc("eth_getTransactionByHash", [r["tx"]])
    return {**r, "sender": t["from"] if t else None, "target": t["to"] if t else None, "sel": t["input"][:10] if t else None}
with cf.ThreadPoolExecutor(8) as ex: out = list(ex.map(get, S))
json.dump({"total_rows": len(rows), "total_usd": sum(r["v"] for r in rows), "sample": out}, open("fac_" + sys.argv[1][4:], "w"))
print("ok", len(out), sum(1 for o in out if o["sender"]))
