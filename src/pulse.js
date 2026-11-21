// x402 Pulse: every 10 min, read new EIP-3009 transferWithAuthorization settlements on Base USDC
// (AuthorizationUsed event joined to the following Transfer), bucket by UTC day, store in KV.
// x402-sized = 0 < amount <= $1. Method: /diary/x402-base-24h-flow-nov-2026
const RPC = "https://base-rpc.publicnode.com";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const AU = "0x98de503528ee59b575ef0c0a2576a82497bfc029a5685b209e9ec333479b10a5";
const TR = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const MAX_BLOCKS = 900; // per run (~30 min of Base blocks), keeps subrequests and CPU small

const RPCS = ["https://gateway.tenderly.co/public/base", "https://base.gateway.tenderly.co", RPC];
const BASE_T0 = 1674438335; // Base: timestamp = T0 + 2*block (verified 2026-11-21)
async function rpc(method, params) {
  const errs = [];
  for (const [i, url] of [...RPCS, ...RPCS].entries()) {
    if (i === RPCS.length) await new Promise((r) => setTimeout(r, 2500));
    try {
      const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "user-agent": "nightshift-pulse (AI-run)" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
      const t = await r.text(); let j; try { j = JSON.parse(t); } catch { throw new Error(`${url} HTTP ${r.status}: ${t.slice(0, 120)}`); }
      if (j.error) throw new Error(`${method}@${url}: ${JSON.stringify(j.error).slice(0, 200)}`);
      return j.result;
    } catch (e) { errs.push(String(e.message || e).slice(0, 160)); }
  }
  throw new Error(`${method} failed: ${errs.join(" | ")}`);
}
const emptyDay = (day) => ({ day, n: 0, usd: 0, n_big: 0, usd_big: 0, blocks: [null, null], hours: Array.from({ length: 24 }, () => [0, 0]), payees: {}, payers: {} });

export async function pulseTick(env) {
  const tip = parseInt(await rpc("eth_blockNumber", []), 16) - 5;
  const last = parseInt((await env.STATS.get("pulse:last")) || "0", 10);
  const from = last ? last + 1 : tip - 300;
  if (from > tip) return { skipped: true };
  const to = Math.min(tip, from + MAX_BLOCKS - 1);
  const toTs = BASE_T0 + 2 * to;
  const au = await rpc("eth_getLogs", [{ address: USDC, topics: [AU], fromBlock: "0x" + from.toString(16), toBlock: "0x" + to.toString(16) }]);
  const want = new Set(au.map((l) => l.transactionHash + ":" + (parseInt(l.logIndex, 16) + 1)));
  const auth = [...new Set(au.map((l) => l.topics[1]))];
  const rows = [];
  for (let i = 0; i < auth.length; i += 80) {
    const tr = await rpc("eth_getLogs", [{ address: USDC, topics: [TR, auth.slice(i, i + 80)], fromBlock: "0x" + from.toString(16), toBlock: "0x" + to.toString(16) }]);
    for (const l of tr) if (want.has(l.transactionHash + ":" + parseInt(l.logIndex, 16))) {
      const b = parseInt(l.blockNumber, 16);
      rows.push({ b, ts: toTs - (to - b) * 2, from: "0x" + l.topics[1].slice(-40), to: "0x" + l.topics[2].slice(-40), v: Number(BigInt(l.data)) / 1e6 });
    }
  }
  const days = {};
  const get = async (d) => (days[d] ||= (await env.STATS.get(`pulse:day:${d}`, "json")) || emptyDay(d));
  // make sure every day touched by the block range exists even with no rows
  for (const ts of [toTs - (to - from) * 2, toTs]) await get(new Date(ts * 1000).toISOString().slice(0, 10));
  for (const r of rows) {
    const iso = new Date(r.ts * 1000).toISOString(); const D = await get(iso.slice(0, 10));
    if (!(r.v > 0 && r.v <= 1)) { D.n_big++; D.usd_big += r.v; continue; }
    D.n++; D.usd += r.v; const h = D.hours[+iso.slice(11, 13)]; h[0]++; h[1] += r.v;
    const p = (D.payees[r.to] ||= [0, 0, 0]); p[0]++; p[1] += r.v;
    if (!D.payers[r.from]) D.payers[r.from] = {};
    if (!D.payers[r.from][r.to]) { D.payers[r.from][r.to] = 1; p[2]++; }
  }
  for (const D of Object.values(days)) {
    D.blocks = [D.blocks[0] ?? from, to];
    await env.STATS.put(`pulse:day:${D.day}`, JSON.stringify(D));
  }
  await env.STATS.put("pulse:last", String(to));
  return { from, to, rows: rows.length };
}

// Compact summary for pages/JSON. census: { payTo: row } of listed wallets.
export function summarize(D, census) {
  const payees = Object.entries(D.payees).sort((a, b) => b[1][1] - a[1][1]);
  const vals = payees.map((p) => p[1][1]).sort((a, b) => a - b);
  const payerSets = Object.values(D.payers);
  const listedUsd = payees.filter(([a]) => census[a]).reduce((s, p) => s + p[1][1], 0);
  const top10 = payees.slice(0, 10).reduce((s, p) => s + p[1][1], 0);
  return {
    day: D.day, blocks: D.blocks, payments: D.n, usd: +D.usd.toFixed(2), recipients: payees.length,
    payers: payerSets.length, payers_one_seller: payerSets.filter((s) => Object.keys(s).length === 1).length,
    median_recipient_usd: vals.length ? +vals[Math.floor(vals.length / 2)].toFixed(3) : 0,
    top10_share: D.usd ? +(top10 / D.usd).toFixed(3) : 0, listed_share: D.usd ? +(listedUsd / D.usd).toFixed(3) : 0,
    recipients_ge1_3payers: payees.filter((p) => p[1][1] >= 1 && p[1][2] >= 3).length,
    over_1usd: { transfers: D.n_big, usd: +D.usd_big.toFixed(2), note: "EIP-3009 transfers above $1, excluded (mostly not x402)" },
    hours: D.hours.map(([n, u]) => [n, +u.toFixed(2)]),
    top: payees.slice(0, 15).map(([a, [n, u, pc]]) => ({ payTo: a, payments: n, usd: +u.toFixed(2), payers: pc, listed_hosts: census[a]?.[5] || null })),
  };
}

export async function loadPulse(env, n = 30) {
  const list = await env.STATS.list({ prefix: "pulse:day:" });
  const keys = list.keys.map((k) => k.name).sort().slice(-n);
  return (await Promise.all(keys.map((k) => env.STATS.get(k, "json")))).filter(Boolean);
}
