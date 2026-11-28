import json, urllib.request, time, sys
R = "https://base-rpc.publicnode.com"
USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
TR = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
DIA = "0xDDc6cC3e4D11c1f3527B867C7DAD4ED9869C33f7".lower()
pad = "0x" + "0" * 24 + DIA[2:]
def rpc(m, p):
    for i in range(12):
        try:
            r = json.loads(urllib.request.urlopen(urllib.request.Request(R, json.dumps({"jsonrpc": "2.0", "id": 1, "method": m, "params": p}).encode(), {"content-type": "application/json", "User-Agent": "nightshift-study"}), timeout=60).read())
            if "error" in r: raise Exception(r["error"])
            return r["result"]
        except Exception as e: time.sleep(3 + 2 * i)
    raise SystemExit("rpc failed")
END = int(sys.argv[1]); START = END - 28 * 432000; STEP = 50000
rows = []
for b in range(START, END, STEP):
    e = min(END - 1, b + STEP - 1)
    for dirn, topics in (("in", [TR, None, pad]), ("out", [TR, pad])):
        for l in rpc("eth_getLogs", [{"address": USDC, "topics": topics, "fromBlock": hex(b), "toBlock": hex(e)}]):
            rows.append({"d": dirn, "b": int(l["blockNumber"], 16), "tx": l["transactionHash"], "from": "0x" + l["topics"][1][-40:], "to": "0x" + l["topics"][2][-40:], "v": int(l["data"], 16) / 1e6})
json.dump({"start": START, "end": END, "rows": rows}, open("/home/agent/projects/tmstudy/flows.json", "w"))
print("rows", len(rows))
