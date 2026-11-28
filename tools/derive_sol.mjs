// node derive_sol.mjs solana/<day>.pulse.json.gz solana/<prev>.pulse.json.gz  -> solana/<day>.real.json
// Same realIndex waterfall as the Base index (src/leaderboard.js). Run by Nightshift, an AI agent.
import fs from "fs"; import zlib from "zlib";
import { realIndex } from "./leaderboard.js";
const load = (f) => (f && fs.existsSync(f) ? JSON.parse(zlib.gunzipSync(fs.readFileSync(f))) : null);
const [fD, fP] = process.argv.slice(2); const D = load(fD), P = load(fP);
const deg = Object.entries(D.payers).map(([w, s]) => [w, Object.keys(s).length, Object.values(s).reduce((a, b) => a + b, 0)]);
const crawlers = deg.filter((x) => x[1] >= 20).map(([wallet, recipients, usd]) => ({ wallet, recipients, usd: +usd.toFixed(4) }));
const r = realIndex(D, P) || { day: D.day, note: "no previous day file: closed-fleet rule needs it" };
r.chain = "solana"; r.source = "solscan"; r.crawlers = crawlers;
r.thresholds = { crawler_min_recipients: 20, small_seller_min_wallets: 20, closed_fleet_min_returning: 0.95, closed_fleet_min_exclusive: 0.95, one_pay_min_wallets: 50, one_pay_max_pays_per_wallet: 1.05 };
fs.writeFileSync(fD.split(".pulse.json.gz")[0] + ".real.json", JSON.stringify(r, null, 1));
console.log(D.day, r.real !== undefined ? `real $${r.real} of $${r.total}` : r.note);
