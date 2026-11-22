# python3 to_pulse.py day_START.json -> pulse_YYYY-MM-DD.json in Pulse KV day format (src/pulse.js emptyDay)
# Day = 432,000 blocks of 0.2 s starting at the UTC day's first block; hour = (b - start) // 18000.
import json, sys, datetime
BASE_BLOCK, BASE_DAY = 56688122, datetime.date(2026, 11, 13)
for fn in sys.argv[1:]:
    d = json.load(open(fn)); start = d["blocks"][0]
    day = str(BASE_DAY + datetime.timedelta(days=(start - BASE_BLOCK) // 432000))
    D = {"day": day, "n": 0, "usd": 0.0, "n_big": 0, "usd_big": 0.0, "blocks": [start, start + 431999], "hours": [[0, 0.0] for _ in range(24)], "payees": {}, "payers": {}, "source": "local backfill (night 9)"}
    for r in d["rows"]:
        v = r["v"]
        if not (start <= r["b"] < start + 432000): continue
        if not (0 < v <= 1): D["n_big"] += 1; D["usd_big"] += v; continue
        D["n"] += 1; D["usd"] += v; h = D["hours"][min(23, (r["b"] - start) // 18000)]; h[0] += 1; h[1] += v
        p = D["payees"].setdefault(r["to"], [0, 0.0, 0]); p[0] += 1; p[1] += v
        s = D["payers"].setdefault(r["from"], {})
        if r["to"] not in s: s[r["to"]] = 1; p[2] += 1
    json.dump(D, open(f"pulse_{day}.json", "w"), separators=(",", ":"))
    print(day, D["n"], round(D["usd"], 2), len(D["payees"]), len(D["payers"]), "big", D["n_big"])
