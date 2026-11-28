// node tools/dayscan.mjs YYYY-MM-DD [outdir] [rpc]
// Full-UTC-day scan of x402-sized EIP-3009 USDC payments on Base, written in the exact Pulse KV day format (v2),
// so the worker can import it as pulse:day:<day>. Runs in a GitHub Action (x402-onchain-data repo) or locally.
// Same method as src/pulse.js: AuthorizationUsed joined to the following Transfer; 0 < v <= $1 counted, larger = n_big.
// Also samples ~1,500 settlements for facilitator (tx sender) and ERC-8021 builder-code shares.
import fs from "fs";
import { parseBuilderCodeSuffixFromCalldata } from "@x402/extensions/builder-code";

const day = process.argv[2];
const outdir = process.argv[3] || ".";
const RPC = process.argv[4] || process.env.BASE_RPC_URL || "https://base-rpc.publicnode.com";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const AU = "0x98de503528ee59b575ef0c0a2576a82497bfc029a5685b209e9ec333479b10a5";
const TR = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
class TooMany extends Error {}

async function rpc(method, params) {
  for (let i = 0; i < 25; i++) {
    try {
      const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json", "user-agent": "nightshift-dayscan (AI-run)" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(120000) });
      const j = JSON.parse(await r.text());
      if (j.error) {
        const m = JSON.stringify(j.error);
        if (/max results|too many|limit exceeded|range/i.test(m) && method === "eth_getLogs" && !/rate/i.test(m)) throw new TooMany(m);
        throw new Error(m);
      }
      return j.result;
    } catch (e) {
      if (e instanceof TooMany) throw e;
      console.error("retry", method, String(e.message).slice(0, 150)); await sleep(Math.min(30000, 2000 * (i + 1)));
    }
  }
  throw new Error("rpc failed: " + method);
}
const ts = async (b) => parseInt((await rpc("eth_getBlockByNumber", ["0x" + b.toString(16), false])).timestamp, 16);
// first block with timestamp >= t (binary search, starting from a 0.2 s estimate)
async function firstBlockAt(t) {
  const tip = parseInt(await rpc("eth_blockNumber", []), 16); const tt = await ts(tip);
  let lo = Math.max(0, tip - Math.ceil((tt - t) / 0.2) - 5000), hi = Math.min(tip, lo + 10000);
  while ((await ts(lo)) >= t) lo -= 20000;
  while ((await ts(hi)) < t) { if (hi >= tip) throw new Error("day not finished yet"); hi = Math.min(tip, hi + 20000); }
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if ((await ts(m)) >= t) hi = m; else lo = m; }
  return hi;
}

const t0 = Date.parse(day + "T00:00:00Z") / 1000;
const start = await firstBlockAt(t0), end = (await firstBlockAt(t0 + 86400)) - 1;
const [ts0, ts1] = [await ts(start), await ts(end)];
const tsOf = (b) => Math.round(ts0 + ((b - start) * (ts1 - ts0)) / Math.max(1, end - start));
console.error(day, "blocks", start, end);

const rows = [];
async function trGet(lo, hi, auth) {
  try { return await rpc("eth_getLogs", [{ address: USDC, topics: [TR, auth], fromBlock: "0x" + lo.toString(16), toBlock: "0x" + hi.toString(16) }]); }
  catch (e) {
    if (!(e instanceof TooMany)) throw e;
    if (auth.length > 1) return [...(await trGet(lo, hi, auth.slice(0, auth.length >> 1))), ...(await trGet(lo, hi, auth.slice(auth.length >> 1)))];
    const m = (lo + hi) >> 1; return [...(await trGet(lo, m, auth)), ...(await trGet(m + 1, hi, auth))];
  }
}
async function proc(b, e) {
  let au;
  try { au = await rpc("eth_getLogs", [{ address: USDC, topics: [AU], fromBlock: "0x" + b.toString(16), toBlock: "0x" + e.toString(16) }]); }
  catch (err) { if (!(err instanceof TooMany) || e <= b) throw err; const m = (b + e) >> 1; await proc(b, m); await proc(m + 1, e); return; }
  if (!au.length) return;
  const want = new Set(au.map((l) => l.transactionHash + ":" + (parseInt(l.logIndex, 16) + 1)));
  const auth = [...new Set(au.map((l) => l.topics[1]))];
  for (let i = 0; i < auth.length; i += 80) {
    for (const l of await trGet(b, e, auth.slice(i, i + 80))) if (want.has(l.transactionHash + ":" + parseInt(l.logIndex, 16))) {
      const bn = parseInt(l.blockNumber, 16);
      rows.push({ b: bn, tx: l.transactionHash, from: "0x" + l.topics[1].slice(-40), to: "0x" + l.topics[2].slice(-40), v: Number(BigInt(l.data)) / 1e6 });
    }
  }
}
const STEP = 5000, chunks = [];
for (let b = start; b <= end; b += STEP) chunks.push([b, Math.min(end, b + STEP - 1)]);
let next = 0, done = 0;
await Promise.all(Array.from({ length: +(process.env.CONC || 2) }, async () => { while (next < chunks.length) { const c = chunks[next++]; await proc(...c); if (++done % 10 === 0) console.error(done, "/", chunks.length, rows.length); } }));

const D = { day, n: 0, usd: 0, n_big: 0, usd_big: 0, blocks: [start, end], hours: Array.from({ length: 24 }, () => [0, 0]), payees: {}, payers: {}, v: 2, pn: {}, source: "dayscan (full UTC day)" };
rows.sort((x, y) => x.b - y.b);
for (const r of rows) {
  if (!(r.v > 0 && r.v <= 1)) { D.n_big++; D.usd_big += r.v; continue; }
  D.n++; D.usd += r.v; const h = D.hours[new Date(tsOf(r.b) * 1000).getUTCHours()]; h[0]++; h[1] += r.v;
  const p = (D.payees[r.to] ||= [0, 0, 0]); p[0]++; p[1] += r.v;
  const s = (D.payers[r.from] ||= {}); const had = s[r.to]; if (!had) p[2]++; s[r.to] = +((had || 0) + r.v).toFixed(6);
  if (had) { const q = (D.pn[r.from] ||= {}); q[r.to] = (q[r.to] || 1) + 1; } // pn: per-pair payment count, only when >= 2
}
// Uniform sample for facilitator + builder-code shares (same structures as the live Pulse: D.fac, D.bc)
const small = rows.filter((r) => r.v > 0 && r.v <= 1);
const N = Math.min(1500, small.length), sample = [];
for (let i = 0; i < N; i++) sample.push(small[Math.floor(Math.random() * small.length)]);
D.fac = {}; D.bc = [0, 0, 0, {}, {}];
for (let i = 0; i < sample.length; i += 10) {
  const txs = await Promise.all(sample.slice(i, i + 10).map((r) => rpc("eth_getTransactionByHash", [r.tx]).catch(() => null)));
  txs.forEach((t, k) => {
    if (!t || !t.from) return; const r = sample[i + k];
    const f = (D.fac[t.from.toLowerCase()] ||= [0, 0, {}]); f[0]++; f[1] += r.v; f[2][r.to] = 1;
    let bc = null; try { bc = parseBuilderCodeSuffixFromCalldata(t.input || "0x"); } catch { bc = null; }
    const B = D.bc; B[0]++;
    if (bc) { B[1]++; if (bc.w) B[4][bc.w] = (B[4][bc.w] || 0) + 1; if (bc.a) { B[2]++; const e = (B[3][bc.a] ||= [0, {}]); e[0]++; e[1][r.to] = 1; } }
  });
}
D.usd = +D.usd.toFixed(6); D.usd_big = +D.usd_big.toFixed(2);
for (const p of Object.values(D.payees)) p[1] = +p[1].toFixed(6);
for (const h of D.hours) h[1] = +h[1].toFixed(4);
fs.mkdirSync(outdir, { recursive: true });
fs.writeFileSync(`${outdir}/${day}.json`, JSON.stringify(D));
console.log(JSON.stringify({ day, blocks: D.blocks, payments: D.n, usd: +D.usd.toFixed(2), payees: Object.keys(D.payees).length, payers: Object.keys(D.payers).length, sampled: D.bc[0] }));
