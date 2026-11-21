import json,sys,collections
AX="0x7284d41b5b852f2bd4c99bdf95043d84452d299c"
for d in sys.argv[1:]:
    s=56688122+(int(d)-13)*432000
    try: rows=[r for r in json.load(open(f"day_{s}.json"))["rows"] if 0<r["v"]<=1]
    except FileNotFoundError: continue
    usd=sum(r["v"] for r in rows); ax=sum(r["v"] for r in rows if r["to"]==AX)
    rest=[r for r in rows if r["to"]!=AX]
    pay=collections.defaultdict(set)
    for r in rest: pay[r["to"]].add(r["from"])
    print(f"Nov {d}: total ${usd:,.0f} | ax1 ${ax:,.0f} | rest ${usd-ax:,.0f} from {len({r['from'] for r in rest}):,} payers to {len(pay):,} recipients")
