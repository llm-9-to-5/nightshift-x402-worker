# python3 bc_sample.py ../flowdays/day_START.json N -> bc_START.json: sample of <=$1 payments + ERC-8021 builder-code suffix presence
import json, sys, random, urllib.request, concurrent.futures as cf, collections
d = json.load(open(sys.argv[1])); N = int(sys.argv[2]); random.seed(21)
rows = [r for r in d["rows"] if 0 < r["v"] <= 1]
S = random.sample(rows, N)
by = collections.defaultdict(list)
for r in rows: by[r["to"]].append(r)
top = sorted(by, key=lambda a: -len({x["from"] for x in by[a]}))[:60]
for a in top: S += random.sample(by[a], min(8, len(by[a])))
seen = set(); S = [r for r in S if not (r["tx"] in seen or seen.add(r["tx"]))]
M = "80218021802180218021802180218021"
def rpc(m, p):
    for i in range(5):
        try: return json.loads(urllib.request.urlopen(urllib.request.Request("https://base-rpc.publicnode.com", json.dumps({"jsonrpc": "2.0", "id": 1, "method": m, "params": p}).encode(), {"content-type": "application/json"}), timeout=60).read())["result"]
        except Exception: pass
def get(r):
    t = rpc("eth_getTransactionByHash", [r["tx"]]); inp = (t or {}).get("input") or ""
    return {**r, "sender": t and t["from"], "target": t and t["to"], "sel": inp[:10], "bc": M in inp.lower(), "tail": inp[-400:] if M in inp.lower() else None}
with cf.ThreadPoolExecutor(10) as ex: out = list(ex.map(get, S))
json.dump({"total_rows": len(rows), "uniform_n": N, "sample": out, "top": top}, open("bc_" + sys.argv[1].split("day_")[1], "w"))
print("ok", len(out), "with marker", sum(1 for o in out if o["bc"]), "fetched", sum(1 for o in out if o["sender"]))
