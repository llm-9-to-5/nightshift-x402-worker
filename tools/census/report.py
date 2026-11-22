# python3 report.py 0xPAYTO [name]  -> report_<addr>.md + report_<addr>.csv from idx_*.json (x402-sized <= $1 payments, Base)
import json, sys, glob, collections
ANON = "--anon" in sys.argv; args = [x for x in sys.argv[1:] if x != "--anon"]
a = args[0].lower(); name = args[1] if len(args) > 1 else a
_c = open("/home/agent/projects/agent-worker/src/census.js").read().split("export const CENSUS = ", 1)[1]
CENSUS = json.JSONDecoder().raw_decode(_c)[0]
LABELS = {"0x7284d41b5b852f2bd4c99bdf95043d84452d299c": "AX1 (quest contest)", "0xcc1984e79726e7a0ae2b9df2ac9e79fb4983930e": "botpay.network"}
nm = lambda q: LABELS.get(q) or ", ".join((CENSUS.get(q) or [None]*6)[5] or []) or "not listed"
sh = lambda w: (w[:6] + "…" + w[-4:]) if ANON else w
files = sorted(glob.glob("idx_*.json"))
days, D = [], {}
for fn in files:
    day = fn[4:-5]; idx = json.load(open(fn)); days.append(day)
    mine = idx.get(a, {})
    # other sellers my payers paid that day
    others = collections.Counter(); others_usd = collections.Counter()
    tot_recip = len(idx)
    if mine:
        ps = set(mine)
        for payee, payers in idx.items():
            if payee == a: continue
            hit = ps.intersection(payers)
            if hit: others[payee] += len(hit); others_usd[payee] += sum(payers[p][1] for p in hit)
    rank = sorted(idx, key=lambda k: -len(idx[k])).index(a) + 1 if mine else None
    D[day] = dict(mine=mine, others=others, others_usd=others_usd, rank=rank, recipients=tot_recip,
                  excl=sum(1 for p in mine if all(p not in idx[q] for q in others)) if mine else 0)
    del idx
first_seen = {}
for day in days:
    for p in D[day]["mine"]: first_seen.setdefault(p, day)
L = []; P = L.append
P(f"# x402 buyer report: {name}\n")
P(f"payTo `{sh(a)}` on Base. Window: {days[0]} to {days[-1]} (UTC days, {len(days)} days). Source: every EIP-3009 USDC transfer of $1 or less on Base, read from the chain. Prepared by Nightshift, an AI agent (Claude).\n")
P("## Daily\n")
P("| Day | Paying wallets | New wallets | Payments | USD | Rank by wallets | Wallets paying nobody else |")
P("|---|---|---|---|---|---|---|")
allusd = collections.Counter(); alln = collections.Counter(); daysactive = collections.Counter()
for day in days:
    m = D[day]["mine"]; new = sum(1 for p in m if first_seen[p] == day)
    n = sum(v[0] for v in m.values()); u = sum(v[1] for v in m.values())
    for p, v in m.items(): allusd[p] += v[1]; alln[p] += v[0]; daysactive[p] += 1
    P(f"| {day} | {len(m)} | {new} | {n:,} | ${u:.2f} | {('#' + str(D[day]['rank']) + ' of ' + format(D[day]['recipients'], ',')) if m else '-'} | {D[day]['excl']} |")
tot = sum(allusd.values()); W = len(allusd)
top = allusd.most_common()
P("\n## Who pays\n")
if W:
    P(f"- {W:,} distinct wallets paid ${tot:.2f} in {sum(alln.values()):,} payments.")
    P(f"- Concentration: the top wallet paid {top[0][1]/tot:.0%}, the top 10 paid {sum(v for _, v in top[:10])/tot:.0%}.")
    P(f"- Loyalty: {sum(1 for p in daysactive if daysactive[p] >= 2):,} wallets ({sum(1 for p in daysactive if daysactive[p] >= 2)/W:.0%}) paid on 2 or more days; {sum(1 for p in daysactive if daysactive[p] >= len(days)//2+1):,} paid on more than half the days.")
    P("\nRetention by first-seen day (share of that day's new wallets that paid again on any later day):\n")
    P("| First seen | New wallets | Came back later |"); P("|---|---|---|")
    for day in days[:-1]:
        coh = [p for p, d in first_seen.items() if d == day]
        if not coh: continue
        later = [d2 for d2 in days if d2 > day]
        back = sum(1 for p in coh if any(p in D[d2]["mine"] for d2 in later))
        P(f"| {day} | {len(coh)} | {back} ({back/len(coh):.0%}) |")
    P("\nTop 10 paying wallets:\n"); P("| Wallet | Payments | USD | Days active |"); P("|---|---|---|---|")
    for p, u in top[:10]: P(f"| `{sh(p)}` | {alln[p]:,} | ${u:.2f} | {daysactive[p]} |")
oth = collections.Counter(); oth_u = collections.Counter()
for day in days: oth.update(D[day]["others"]); oth_u.update(D[day]["others_usd"])
P("\n## Where else your buyers pay\n")
P("Other recipients paid by your paying wallets (wallet-days summed over the window). These are the sellers competing for the same buyers.\n")
P("| Other recipient | Listed as | Your buyers who paid it (wallet-days) | USD they paid it |"); P("|---|---|---|---|")
for q, c in oth.most_common(10): P(f"| `{q[:8]}…{q[-4:]}` | {nm(q)} | {c:,} | ${oth_u[q]:.2f} |")
P("\n## Caveats\n\nBase only. Not every EIP-3009 transfer of $1 or less is x402. Wallets are not customers: one agent can use many wallets, and many agents can share one facilitator-funded wallet. Days are UTC, cut by block number (432,000 blocks of 0.2 s).")
open(f"report_{a[:10]}.md", "w").write("\n".join(L))
with open(f"report_{a[:10]}.csv", "w") as f:
    f.write("day,payer,payments,usd\n")
    for day in days:
        for p, v in D[day]["mine"].items(): f.write(f"{day},{p},{v[0]},{v[1]:.6f}\n")
print("\n".join(L))
