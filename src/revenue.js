import { CENSUS, CENSUS_SUMMARY } from "./census.js";

const ranked = Object.entries(CENSUS).sort((a, b) => b[1][3] - a[1][3]).map(([a]) => a);
const rank = Object.fromEntries(ranked.map((a, i) => [a, i + 1]));

function b64json(s) { try { return JSON.parse(atob(s.replace(/-/g, "+").replace(/_/g, "/"))); } catch { return null; } }

async function payToFromUrl(url) {
  const tries = ["GET", "POST"];
  for (const method of tries) {
    const r = await fetch(url, { method, redirect: "manual", headers: { "user-agent": "NightshiftRevenue/0.1 (+https://nightshift-agent.solaris-organization.workers.dev/census)", accept: "application/json", ...(method === "POST" ? { "content-type": "application/json" } : {}) }, body: method === "POST" ? "{}" : undefined });
    let ch = r.headers.get("payment-required") ? b64json(r.headers.get("payment-required")) : null;
    if (!ch && r.status === 402) { try { ch = await r.json(); } catch {} }
    const evm = (ch?.accepts || []).filter((a) => /^0x[0-9a-fA-F]{40}$/.test(a.payTo || ""));
    const base = evm.find((a) => a.network === "eip155:8453" || a.network === "base") || evm[0];
    if (base) return { payTo: base.payTo, network: base.network, status: r.status };
    if (r.status !== 404 && r.status !== 405 && r.status !== 400) return { payTo: null, status: r.status };
  }
  return { payTo: null };
}

export async function x402Revenue({ url, payTo }) {
  let probe = null;
  if (!payTo && url) {
    let u; try { u = new URL(url); } catch { return { error: "Provide ?payTo=0x... or ?url= of an x402 endpoint", code: 400 }; }
    if (!/^https?:$/.test(u.protocol)) return { error: "Public http(s) URL required", code: 400 };
    try { probe = await payToFromUrl(u.href); } catch (e) { return { url, error: `unreachable: ${e.message || e}`, code: 502 }; }
    payTo = probe.payTo;
    if (!payTo) return { url, error: `no EVM payTo found in the 402 (HTTP ${probe.status ?? "?"})`, code: 422 };
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(payTo || "")) return { error: "Provide ?payTo=0x... (EVM address) or ?url= of an x402 endpoint", code: 400 };
  const a = payTo.toLowerCase();
  const row = CENSUS[a];
  const ctx = { snapshot: CENSUS_SUMMARY.date, window_days: CENSUS_SUMMARY.window_days, wallets_in_census: CENSUS_SUMMARY.wallets, median_earner_usd: CENSUS_SUMMARY.median_earner_usd, wallets_with_zero: CENSUS_SUMMARY.zero };
  if (!row) return { pay_to: payTo, ...(url ? { url } : {}), in_census: false, note: "Wallet not in the census (not found via 402index listings on Base at snapshot time). Absence is not evidence of zero revenue.", census: ctx };
  const r = rank[a];
  return {
    pay_to: payTo, ...(url ? { url } : {}), in_census: true,
    payments_le_1usd_3d: row[0], usd_received_3d: row[1], distinct_payers_3d: row[2],
    usd_excl_directory_test_buyers: row[3], distinct_payers_excl_directory_test_buyers: row[4],
    rank_by_independent_revenue: r, percentile: Math.round((1 - (r - 1) / ranked.length) * 1000) / 10,
    hosts_sharing_wallet: row[5], category: row[6],
    signal: row[4] >= 10 ? "many independent payers" : row[4] >= 3 ? "a few independent payers" : row[0] > 0 ? "paid mostly by directory test buyers or a single payer" : "no x402-size payments in the window",
    census: ctx,
    method: "USDC Transfer logs on Base into the payTo wallet, transfers <= $1.00, last ~3 days (1,296,000 blocks = 72h) before the snapshot (originally mislabeled as 30 days; corrected night 8); 'directory test buyers' = payer wallets that paid >= 20 different sellers. Details: /census",
  };
}
