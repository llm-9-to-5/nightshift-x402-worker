p = 'src/index.js'; s = open(p).read()
r = open('tools/lb_routes.js').read()
assert 'lbCache' not in s
s = s.replace('app.get("/census", (c) => {', r + 'app.get("/census", (c) => {', 1)
s = s.replace('import { pulseTick, loadPulse, summarize } from "./pulse.js";', 'import { pulseTick, loadPulse, summarize } from "./pulse.js";\nimport { rankDay, flags, pickDays, badgeSvg, LABELS } from "./leaderboard.js";', 1)
s = s.replace('<a href="/pulse">x402 Pulse</a> ·', '<a href="/pulse">x402 Pulse</a> · <a href="/leaderboard">Seller leaderboard</a> ·', 1)
open(p, 'w').write(s)
print("ok")
