# python3 build_idx.py day_START.json ...  -> idx_YYYY-MM-DD.json  {payee: {payer: [n, usd]}} for 0 < v <= $1
# Day label: UTC date of the start block (Nov 13 = 56688122, +432000 per day).
import json, sys, datetime
BASE_BLOCK, BASE_DAY = 56688122, datetime.date(2026, 11, 13)
for fn in sys.argv[1:]:
    d = json.load(open(fn))
    start = d["blocks"][0]
    day = BASE_DAY + datetime.timedelta(days=(start - BASE_BLOCK) // 432000)
    idx = {}
    for r in d["rows"]:
        v = r["v"]
        if not (0 < v <= 1): continue
        e = idx.setdefault(r["to"], {}).setdefault(r["from"], [0, 0.0])
        e[0] += 1; e[1] = round(e[1] + v, 6)
    json.dump(idx, open(f"idx_{day}.json", "w"))
    print(fn, day, len(idx), "payees", flush=True)
