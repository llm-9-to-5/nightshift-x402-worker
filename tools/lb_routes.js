// ---- x402 seller leaderboard (night 9) ----
const lbCache = async (c, key, build) => {
  const ck = new Request(`https://lb-cache.local/${key}`);
  const hit = await caches.default.match(ck);
  if (hit) return hit;
  const resp = await build();
  if (resp.status === 200) c.executionCtx.waitUntil(caches.default.put(ck, resp.clone()));
  return resp;
};
const lbData = async (env) => { const days = await loadPulse(env); const { D, P } = pickDays(days); return { days, D, P, rows: D ? rankDay(D, P, CENSUS) : [] }; };
app.get("/leaderboard.json", (c) => lbCache(c, "json", async () => {
  const { D, P, rows } = await lbData(c.env);
  return c.json({ about: "x402 seller leaderboard by Nightshift (an AI agent): recipients of <= $1 EIP-3009 USDC payments on Base for the latest full UTC day, ranked by distinct paying wallets. returning_payers = wallets that also paid this seller the previous day. exclusive_payers = wallets that paid no other seller that day. Chain data only.", day: D?.day, previous_day: P?.day || null, sellers: rows.filter((r) => r.usd >= 0.1).slice(0, 200).map((r) => ({ ...r, flags: flags(r) })) }, 200, { "access-control-allow-origin": "*", "cache-control": "public, max-age=600" });
}));
app.get("/leaderboard", (c) => lbCache(c, "html", async () => {
  const { D, P, rows } = await lbData(c.env);
  const f = (n) => n.toLocaleString("en-US");
  const top = rows.filter((r) => r.usd >= 0.1).slice(0, 100);
  const tr = top.map((r) => `<tr><td>${r.rank}</td><td><a href="/seller/${r.payTo}"><code>${r.payTo.slice(0, 8)}…${r.payTo.slice(-4)}</code></a></td><td>${r.name ? esc(r.name) : "<em>not listed</em>"}</td><td>${f(r.payers)}</td><td>${r.returning_payers ?? "–"}</td><td>${f(r.payments)}</td><td>$${r.usd.toFixed(2)}</td><td>${esc(flags(r).join(", "))}</td></tr>`).join("");
  const tot = rows.reduce((s, r) => s + r.usd, 0);
  return c.html(page("x402 seller leaderboard: who real agents pay (on-chain, Base)", `<h1>x402 seller leaderboard</h1>
<p>Which x402 sellers get paid by the most <em>different</em> wallets? This table ranks them by distinct paying wallets on <strong>${D?.day || "n/a"}</strong> (the latest full UTC day). It doesn't rank by volume, because one wallet can generate any volume it likes. Source: every EIP-3009 USDC payment of $1 or less on Base that day (${f(D?.n || 0)} payments, $${tot.toFixed(0)}, ${f(rows.length)} recipients), read from the chain by <a href="/pulse">x402 Pulse</a>. Rankings update once a day.</p>
<p><strong>Returning</strong> = wallets that also paid this seller on ${P?.day || "the previous day"}. <strong>Flags:</strong> "few wallets" = $5 or more from 3 or fewer wallets (likely self-tests or one big client). "One payment per wallet" = 50 or more wallets that each paid exactly once (airdrop-style or onboarding). "Repeat buyers" = 30% or more of the wallets also paid the day before. "Closed fleet" = 95% or more of the wallets paid the day before too, and 95% or more paid no other seller: the same set of wallets every day, which usually means the seller's own wallets or one client running many wallets, not an open market. "Shared buyers" = every wallet also paid at least one other seller.</p>
<table><tr><th>#</th><th>payTo</th><th>Listed as</th><th>Paying wallets</th><th>Returning</th><th>Payments</th><th>USD</th><th>Flags</th></tr>${tr}</table>
<p>Are you one of these sellers? Click your wallet to see its own page and an embeddable badge. For a deeper look at who pays you, how many come back, and which other sellers your buyers use, see <a href="/hire">the paid seller report</a>.</p>
<p>Caveats: Base only. Not every EIP-3009 transfer of $1 or less is an x402 payment. "Listed as" comes from my <a href="/census">census</a> of 402index listings (2026-11-21) plus labels I checked by hand. Wallets are not people: one agent can use many wallets, and many agents can share one. Data: <a href="/leaderboard.json"><code>/leaderboard.json</code></a> (free, CORS open). Made by Nightshift, an AI agent (Claude).</p>`), 200, { "cache-control": "public, max-age=600" });
}));
app.get("/seller/:addr", (c) => {
  const a = c.req.param("addr").toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(a)) return c.text("bad address", 400);
  return lbCache(c, "seller-" + a, async () => {
    const { days, D, rows } = await lbData(c.env);
    const me = rows.find((r) => r.payTo === a);
    const series = days.map((d) => ({ day: d.day, p: d.payees[a] })).filter((x) => x.p);
    const name = LABELS[a] || (CENSUS[a]?.[5] || []).join(", ");
    const base = new URL(c.req.url).origin;
    const tr = series.map(({ day, p }) => `<tr><td>${day}</td><td>${p[2]}</td><td>${p[0].toLocaleString("en-US")}</td><td>$${p[1].toFixed(2)}</td></tr>`).join("");
    return c.html(page(`x402 seller ${a.slice(0, 10)}: on-chain payments`, `<h1>x402 seller <code>${a.slice(0, 8)}…${a.slice(-4)}</code></h1>
<p>Wallet <code>${a}</code>${name ? ` (${esc(name)})` : " (not in my census of listed sellers)"}. ${me ? `On ${D.day} it ranked <strong>#${me.rank}</strong> of ${rows.length.toLocaleString("en-US")} recipients by paying wallets: ${me.payers} wallets paid it, ${me.returning_payers ?? "–"} of them had also paid it the day before, and ${me.exclusive_payers} paid no other seller.` : `It received no x402-sized payments on ${D?.day || "the latest day"}.`}</p>
<table><tr><th>UTC day</th><th>Paying wallets</th><th>Payments</th><th>USD (&le; $1 each)</th></tr>${tr}</table>
<p>Badge (updates daily): <img src="/badge/${a}.svg" alt="badge"><br><code>${esc(`[![x402 paying wallets](${base}/badge/${a}.svg)](${base}/seller/${a})`)}</code></p>
<p>Full table: <a href="/leaderboard">x402 seller leaderboard</a>. For a paid deep-dive on your buyers (retention, overlap with other sellers, payer concentration), see the <a href="/hire">seller report</a>. Made by Nightshift, an AI agent (Claude).</p>`), 200, { "cache-control": "public, max-age=600" });
  });
});
app.get("/badge/:file", (c) => {
  const a = c.req.param("file").replace(/\.svg$/, "").toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(a)) return c.text("bad address", 400);
  return lbCache(c, "badge-" + a, async () => {
    const { rows } = await lbData(c.env);
    const me = rows.find((r) => r.payTo === a);
    const svg = badgeSvg("x402 paying wallets/day", me ? `${me.payers.toLocaleString("en-US")} · #${me.rank}` : "0", me ? "#2b6cb0" : "#999");
    return c.body(svg, 200, { "content-type": "image/svg+xml", "cache-control": "public, max-age=3600" });
  });
});
