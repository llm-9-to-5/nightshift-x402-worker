import { CENSUS, CENSUS_SUMMARY } from "./census.js";
// Pre-payment check of a third-party x402 endpoint: decode its 402, sanity-check terms, and pull directory reputation.
// USDC per network: from @x402/evm DEFAULT_ASSETS (symbol USDC) + Solana mainnet
export const USDC = {
 "eip155:8453": "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
 "eip155:84532": "0x036cbd53842c5426634e7929541ec2318f3dcf7e",
 "eip155:1": "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
 "eip155:43114": "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e",
 "eip155:143": "0x754704bc059f8c67012fed69bc8a327a5aafb603",
 "eip155:10143": "0x534b2f3a21130d7a60830c2df862319e593943a3",
 "eip155:137": "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359",
 "eip155:42161": "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
 "eip155:421614": "0x75faf114eafb1bdbe2f0316df893fd58ce46aa4d",
 "eip155:36900": "0x9cb8142aebbcdc60af7c97af897a67a8f3ca71c2",
 "eip155:190415": "0x401ecb1d350407f13ba348573e5630b83638e30d",
 "eip155:181228": "0x401ecb1d350407f13ba348573e5630b83638e30d",
 "eip155:50": "0xfa2958cb79b0491cc627c1557f441ef849ca8eb1",
 "eip155:51": "0xb5ab69f7bbada22b28e79c8ffaece55ef1c771d4",
 "eip155:38833": "0xa5b8bf902b2844da17d4506cc827f7f1681735e7",
 "eip155:42220": "0xceba9300f2b948710d2653dd7b07f33a8b32118c",
 "eip155:11142220": "0x01c5c0122039549ad1493b8220cabedd739bc44e",
 "eip155:1329": "0xe15fc38f6d8c56af07bbcbe3baf5708a2bf42392",
 "eip155:1328": "0x4fcf1784b31630811181f670aea7a7bef803eaed",
 "eip155:5042": "0x3600000000000000000000000000000000000000",
 "eip155:5042002": "0x3600000000000000000000000000000000000000",
 "eip155:43111": "0xad11a8beb98bbf61dbb1aa0f6d6f2ecd87b35afa",
 "eip155:743111": "0xd47971c7f5b1067d25cd45d30b2c9eb60de96443",
 "eip155:480": "0x79a02482a880bce3f13e09da970dc34db4cd24d1",
 "eip155:4801": "0x66145f38cbac35ca6f1dfb4914df98f1614aea88",
 "eip155:10": "0x0b2c639c533813f4aa9d7837caf62653d097ff85",
 "eip155:130": "0x078d782b760474a361dda0af3839290b0ef57ad6",
 "eip155:146": "0x29219dd400f2bf60e5a23d13be72b486d4038894",
 "eip155:999": "0xb88339cb7199b77e23db6e890353e22632ba630f",
 "eip155:57073": "0x2d270e6886d130d724215a266106e6832161eaed",
 "eip155:59144": "0x176211869ca2b568f2a7d4ee941e073a821ee1ff",
 "eip155:81224": "0xd996633a415985dbd7d6d12f4a4343e31f5037cf",
 "eip155:98866": "0x222365ef19f7947e5484218551b56bb3965aa7af",
 "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
};
export const V1_NET = { base: "eip155:8453", "base-sepolia": "eip155:84532", ethereum: "eip155:1", polygon: "eip155:137", arbitrum: "eip155:42161", optimism: "eip155:10", avalanche: "eip155:43114", celo: "eip155:42220", solana: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp" };
const NET_NAME = { "eip155:8453": "Base", "eip155:84532": "Base Sepolia (TESTNET)", "eip155:1": "Ethereum", "eip155:137": "Polygon", "eip155:42161": "Arbitrum", "eip155:10": "Optimism", "eip155:43114": "Avalanche", "eip155:42220": "Celo", "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp": "Solana" };
const TESTNETS = new Set(["eip155:84532", "eip155:11155111", "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1"]);

export function b64json(s) {
  try { const bin = atob(s.trim()); const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0)); return JSON.parse(new TextDecoder().decode(bytes)); } catch { return null; }
}

async function rpc(method, params) {
  const r = await fetch("https://mainnet.base.org", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  return (await r.json()).result;
}
async function baseWalletInfo(addr) {
  try {
    const a = addr.toLowerCase().replace(/^0x/, "");
    const [code, bal] = await Promise.all([
      rpc("eth_getCode", [addr, "latest"]),
      rpc("eth_call", [{ to: USDC["eip155:8453"], data: "0x70a08231" + a.padStart(64, "0") }, "latest"]),
    ]);
    return { is_contract: !!code && code !== "0x", usdc_balance: bal ? Number(BigInt(bal)) / 1e6 : null };
  } catch { return null; }
}

export async function nohumans(url) {
  try {
    const r = await fetch(`https://api.nohumans.directory/v1/resolve?url=${encodeURIComponent(url)}`, { cf: { cacheTtl: 600 } });
    const j = await r.json();
    const d = j.detail || {};
    return { match: j.match, status: d.status ?? null, probe_score: d.score ?? null, probes: d.probe_count ?? null, price_usd: d.amount_usd ?? d.price_amount ?? null, pay_to: d.obs_pay_to ?? null, payto_unstable: d.payto_unstable ?? null,
      paid_verified: d.paid_verified ?? null, latest_purchase_delivered: d.latest_purchase_delivered ?? d.paid_verification_latest?.delivered ?? null, latest_purchase_failure_kind: d.paid_verification_latest?.failure_kind ?? null,
      distinct_payers: d.distinct_payers ?? null, listing: d.id ? `https://nohumans.directory/l/${d.id}` : null };
  } catch { return null; }
}
export async function index402(url) {
  try {
    const host = new URL(url).hostname;
    const r = await fetch(`https://402index.io/api/v1/services?q=${encodeURIComponent(host)}&limit=50`, { cf: { cacheTtl: 600 } });
    const j = await r.json();
    const base = url.split("?")[0];
    const hit = (j.services || []).find((s) => s.url.split("?")[0] === base) || null;
    const sameHost = (j.services || []).filter((s) => { try { return new URL(s.url).hostname === host; } catch { return false; } });
    return { listed: !!hit, endpoints_from_host: sameHost.length, health_status: hit?.health_status ?? null, uptime_30d: hit?.uptime_30d ?? null, reliability_score: hit?.reliability_score ?? null, payment_valid: hit?.x402_payment_valid ?? null, domain_verified: hit ? !!hit.domain_verified : null, price_usd: hit?.price_usd ?? null };
  } catch { return null; }
}

export async function x402Check({ url, method = "GET", body }) {
  let u;
  try { u = new URL(url); } catch { return { error: "Provide ?url= of the x402 endpoint to check", code: 400 }; }
  if (!/^https?:$/.test(u.protocol) || /^(localhost|127\.|10\.|192\.168\.|169\.254\.)/.test(u.hostname)) return { error: "Public http(s) URL required", code: 400 };
  method = String(method || "GET").toUpperCase();
  if (!["GET", "POST", "PUT", "DELETE"].includes(method)) method = "GET";
  const warnings = [], problems = [];
  const t0 = Date.now();
  let r, text = "";
  const [dirNH, dir402] = [nohumans(u.href), index402(u.href)];
  try {
    r = await fetch(u.href, { method, redirect: "manual", headers: { "user-agent": "NightshiftX402Check/0.1 (+https://nightshift-agent.solaris-organization.workers.dev)", accept: "application/json", ...(method !== "GET" ? { "content-type": "application/json" } : {}) }, body: method !== "GET" ? (typeof body === "string" ? body : JSON.stringify(body ?? {})) : undefined });
    text = (await r.text()).slice(0, 200000);
    if (method === "GET" && (r.status === 405 || r.status === 404 || r.status === 400) && !r.headers.get("payment-required")) {
      const r2 = await fetch(u.href, { method: "POST", redirect: "manual", headers: { "user-agent": "NightshiftX402Check/0.1 (+https://nightshift-agent.solaris-organization.workers.dev)", accept: "application/json", "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body ?? {}) });
      if (r2.status === 402) { warnings.push(`GET returned ${r.status}; endpoint answers 402 to POST, so call it with POST`); r = r2; method = "POST"; text = (await r2.text()).slice(0, 200000); }
    }
  } catch (e) {
    return { url: u.href, reachable: false, verdict: "do_not_pay", problems: [`unreachable: ${e.message || e}`], directories: { nohumans: await dirNH, index402: await dir402 } };
  }
  const latency = Date.now() - t0;
  let challenge = null, transport = null;
  const hdr = r.headers.get("payment-required");
  if (hdr) { challenge = b64json(hdr); transport = "header (x402 v2)"; }
  if (!challenge && r.status === 402) { try { const j = JSON.parse(text); if (j.accepts) { challenge = j; transport = `body (x402 v${j.x402Version ?? 1})`; } } catch {} }
  const www = r.headers.get("www-authenticate");
  if (r.status !== 402) problems.push(`returned HTTP ${r.status}, not 402${r.status >= 300 && r.status < 400 ? ` (redirect to ${r.headers.get("location")})` : ""}`);
  if (r.status === 402 && !challenge) problems.push(www ? `402 with WWW-Authenticate (${www.split(" ")[0]}): L402/MPP rather than x402` : "402 without a readable x402 payment requirement");

  const options = [];
  for (const a of challenge?.accepts || []) {
    const network = V1_NET[a.network] || a.network;
    const amountAtomic = a.amount ?? a.maxAmountRequired;
    const known = USDC[network];
    const isUSDC = known && String(a.asset).toLowerCase() === known.toLowerCase();
    const o = { scheme: a.scheme, network, network_name: NET_NAME[network] || network, asset: a.asset, asset_is_usdc: !!isUSDC, amount_atomic: amountAtomic, price_usd: isUSDC && amountAtomic ? Number(amountAtomic) / 1e6 : null, pay_to: a.payTo, max_timeout_s: a.maxTimeoutSeconds ?? null, eip712_domain: a.extra?.name ? { name: a.extra.name, version: a.extra.version } : null, issues: [] };
    if (TESTNETS.has(network)) o.issues.push("testnet: payment has no real value, likely a demo");
    if (known && !isUSDC) o.issues.push("asset is not the canonical USDC contract for this network");
    if (!known) o.asset_note = "network not in our USDC table; asset not verified";
    if (network.startsWith("eip155:") && !/^0x[0-9a-fA-F]{40}$/.test(a.payTo || "")) o.issues.push("payTo is not a valid EVM address");
    if (network.startsWith("eip155:") && a.scheme === "exact" && !a.extra?.name) o.issues.push("missing EIP-712 domain (extra.name/version): standard clients may fail to sign");
    if (o.price_usd != null && o.price_usd > 1) o.issues.push(`high price: $${o.price_usd} per call`);
    if (o.max_timeout_s != null && o.max_timeout_s < 30) o.issues.push("very short maxTimeoutSeconds");
    options.push(o);
  }
  if (challenge && !options.length) problems.push("402 lists no payment options (accepts is empty)");
  const resourceUrl = challenge?.resource?.url ?? challenge?.accepts?.[0]?.resource ?? null;
  if (resourceUrl) { try { const ru = new URL(resourceUrl); if (ru.hostname !== u.hostname) warnings.push(`resource URL host (${ru.hostname}) differs from the URL you called`); } catch {} }

  const base = options.find((o) => o.network === "eip155:8453" && o.pay_to);
  const [nh, i4, wallet] = await Promise.all([dirNH, dir402, base ? baseWalletInfo(base.pay_to) : null]);
  if (nh?.match === "delisted") problems.push("delisted on nohumans.directory");
  if (nh?.latest_purchase_delivered === false) problems.push(`nohumans.directory's latest real purchase did NOT deliver (${nh.latest_purchase_failure_kind || "unknown reason"})`);
  if (nh?.payto_unstable) warnings.push("payTo address has changed between probes (nohumans)");
  if (nh?.pay_to && base && nh.pay_to.toLowerCase() !== String(base.pay_to).toLowerCase()) warnings.push("payTo differs from the address nohumans.directory recorded for this listing");
  if (nh?.price_usd != null && base?.price_usd != null && base.price_usd > nh.price_usd * 1.001) warnings.push(`price now ($${base.price_usd}) is higher than the directory-recorded price ($${nh.price_usd})`);
  if (i4?.health_status && !["healthy", "unknown"].includes(i4.health_status)) warnings.push(`402index health: ${i4.health_status}`);
  if (!nh?.status && !i4?.listed) warnings.push("not found in nohumans.directory or 402index: no third-party track record");
  for (const o of options) for (const i of o.issues) (i.startsWith("testnet") || i.startsWith("payTo is not") ? problems : warnings).push(`${o.network_name}: ${i}`);

  let onchain = null;
  if (base) {
    const row = CENSUS[String(base.pay_to).toLowerCase()];
    onchain = row
      ? { in_census: true, snapshot: CENSUS_SUMMARY.date, window_days: CENSUS_SUMMARY.window_days, payments_le_1usd: row[0], usd_received: row[1], distinct_payers: row[2], usd_excl_directory_test_buyers: row[3], payers_excl_directory_test_buyers: row[4], hosts_sharing_wallet: row[5] }
      : { in_census: false, snapshot: CENSUS_SUMMARY.date, note: "payTo wallet not in the Nightshift census (not found via 402index at snapshot time)" };
    if (row && row[0] === 0) warnings.push(`on-chain census (${CENSUS_SUMMARY.date}): this payTo wallet received no x402-size USDC payments in the prior 3 days`);
  }
  // Night 12: trailing-7-day on-chain evidence (data repo evidence/latest, built daily from full-day chain scans)
  let evidence7d = null;
  if (base) {
    try {
      const er = await fetch("https://raw.githubusercontent.com/llm-9-to-5/x402-onchain-data/main/evidence/latest/sellers/" + String(base.pay_to).toLowerCase() + ".json", { cf: { cacheTtl: 900 } });
      if (er.ok) { const E = await er.json(); evidence7d = { window: [E.scope.window_start, E.scope.window_end], ...E.evidence.counts, crawler_payer_share_by_payers: E.evidence.crawler_payer_share_by_payers, returning_wallet_share_by_wallets: E.evidence.returning_wallet_share_by_wallets, record: "https://nightshift-agent.solaris-organization.workers.dev/evidence/" + String(base.pay_to).toLowerCase() + ".json" };
        if (E.evidence.crawler_payer_share_by_payers >= 0.8) warnings.push(`last 7 days on-chain: ${Math.round(E.evidence.crawler_payer_share_by_payers * 100)}% of paying wallets were crawlers (directories/auditors paying 20+ sellers a day), little evidence of real customers`); }
      else if (er.status === 404) evidence7d = { paying_wallets_lt3: true, note: "fewer than 3 distinct paying wallets in the trailing 7 full UTC days" };
    } catch { evidence7d = null; }
  }
  const verdict = problems.length ? "do_not_pay" : warnings.length ? "caution" : "looks_ok";
  return {
    url: u.href, method, reachable: true, http_status: r.status, latency_ms: latency, transport, x402_version: challenge?.x402Version ?? null,
    description: challenge?.resource?.description ?? challenge?.accepts?.[0]?.description ?? null,
    payment_options: options, cheapest_usd: options.reduce((m, o) => (o.price_usd != null && (m == null || o.price_usd < m) ? o.price_usd : m), null),
    pay_to_wallet_base: wallet ? { address: base.pay_to, ...wallet, ...(wallet.is_contract ? { note: "contract address: usually a smart wallet or payment splitter" } : {}) } : null,
    directories: { nohumans: nh, index402: i4 },
    onchain_census: onchain,
    onchain_7d: evidence7d,
    verdict, problems, warnings,
    sources: "Live unpaid probe by Nightshift; reputation from nohumans.directory and 402index.io public APIs; wallet data from Base RPC; onchain_census from the Nightshift 30-day on-chain census of 1,987 x402 seller wallets (/census).",
    note: "Unpaid probe only: this does not pay the endpoint, so it cannot prove delivery. nohumans.directory 'latest_purchase_delivered' is the best delivery evidence when present.",
  };
}
