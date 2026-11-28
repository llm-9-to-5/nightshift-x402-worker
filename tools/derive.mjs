// node derive.mjs pulse/<day>.json.gz [pulse/<prev day>.json.gz]   (leaderboard.js = src/leaderboard.js next to it)
// From a dayscan file: writes pulse/<day>.crawlers.json (the recomputable crawler set) and pulse/<day>.real.json
// (real x402 index waterfall, same code as the live site: src/leaderboard.js realIndex). Window: one UTC day,
// except "returning" in the closed-fleet rule, which looks at the previous UTC day.
import fs from "fs"; import zlib from "zlib";
import { realIndex } from "./leaderboard.js";
const load = (f) => (f && fs.existsSync(f) ? JSON.parse(zlib.gunzipSync(fs.readFileSync(f))) : null);
const [fD, fP] = process.argv.slice(2);
const D = load(fD), P = load(fP);
const deg = Object.entries(D.payers).map(([w, s]) => [w, Object.keys(s).length, Object.values(s).reduce((a, b) => a + b, 0)]);
const crawlers = deg.filter((x) => x[1] >= 20).sort((a, b) => b[1] - a[1]).map(([wallet, recipients, usd]) => ({ wallet, recipients, usd: +usd.toFixed(4) }));
const base = fD.replace(/\.json\.gz$/, "");
fs.writeFileSync(base + ".crawlers.json", JSON.stringify({
  day: D.day, publisher: "Nightshift (an AI agent), https://nightshift-agent.solaris-organization.workers.dev/real-index",
  scope: { chain: "eip155:8453", asset_contract: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", event: "EIP-3009 AuthorizationUsed joined to its Transfer", amount_cap_usd: 1, window: "one UTC day", blocks: D.blocks },
  rule: "a payer wallet that paid >= 20 distinct recipients in this UTC day (directories, auditors, paid probes)",
  crawlers, crawler_usd: +crawlers.reduce((s, c) => s + c.usd, 0).toFixed(2),
}, null, 1));
const r = realIndex(D, P);
if (r) {
  r.source = "dayscan"; r.window = "per UTC day (closed-fleet 'returning' = paid the same seller the previous UTC day)";
  r.thresholds = { crawler_min_recipients: 20, small_seller_min_wallets: 20, closed_fleet_min_returning: 0.95, closed_fleet_min_exclusive: 0.95, one_pay_min_wallets: 50, one_pay_max_pays_per_wallet: 1.05 };
  r.buckets = { organic: r.real, identified_non_organic: +(r.ax1_contest + r.crawler_probes + r.closed_fleets + r.one_pay_per_wallet).toFixed(2), unclassified_small_sellers: r.small_sellers };
  fs.writeFileSync(base + ".real.json", JSON.stringify(r, null, 1));
}
console.log(D.day, "crawlers", crawlers.length, r ? `real $${r.real} of $${r.total}` : "no prev day");
