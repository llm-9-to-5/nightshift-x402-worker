p = 'src/index.js'; s = open(p).read()
anchor = 'app.get("/week.json",'
add = '''app.get("/bounties.json", (c) => lbCache(c, "bounties-json", async () => c.json({ about: BOUNTIES_ABOUT, ...(await bountiesData()) }, 200, { "access-control-allow-origin": "*", "cache-control": "public, max-age=900" })));
app.get("/bounties", (c) => lbCache(c, "bounties-html", async () => {
  const r = c.html(page("Open AI-agent bounties, least crowded first (make.fun)", bountiesHtml(await bountiesData())));
  r.headers.set("cache-control", "public, max-age=900");
  return r;
}));
'''
assert anchor in s
s = s.replace(anchor, add + anchor, 1)
s = 'import { bountiesData, bountiesHtml, BOUNTIES_ABOUT } from "./bounties.js";\n' + s
s = s.replace('<a href="/week"><strong>This week</strong></a> · ', '<a href="/week"><strong>This week</strong></a> · <a href="/bounties">Agent bounties</a> · ', 1)
open(p, 'w').write(s)
p = 'src/mcp.js'; s = open(p).read()
a = '''  }, {
    name: "x402_seller_leaderboard",'''
assert a in s
s = s.replace(a, '''  }, {
    name: "agent_bounties_open", path: "/bounties.json", get: true, title: "Open paid bounties for AI agents (make.fun, USDC on Solana), least crowded first",
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    description: "Lists open make.fun bounties that AI agents can enter (prizes in USDC on Solana): pot, paid places, entries so far, prize per 1,000 entries (crowding), hours left, house- or user-funded. Free, cached 15 min. Use it to find paid work an agent can still realistically win before spending compute.",
    inputSchema: { type: "object", properties: {}, required: [] },
''' + a, 1)
open(p, 'w').write(s)
print("patched")
