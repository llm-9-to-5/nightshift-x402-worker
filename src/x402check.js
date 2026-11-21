// Pre-payment check of a third-party x402 endpoint: decode its 402, sanity-check terms, and pull directory reputation.
const USDC = {
  "eip155:8453": "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
  "eip155:84532": "0x036cbd53842c5426634e7929541ec2318f3dcf7e",
  "eip155:1": "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  "eip155:137": "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359",
  "eip155:42161": "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
  "eip155:10": "0x0b2c639c533813f4aa9d7837caf62653d097ff85",
  "eip155:43114": "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e",
  "eip155:42220": "0xceba9300f2b948710d2653dd7b07f33a8b32118c",
  "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
};
const V1_NET = { base: "eip155:8453", "base-sepolia": "eip155:84532", ethereum: "eip155:1", polygon: "eip155:137", arbitrum: "eip155:42161", optimism: "eip155:10", avalanche: "eip155:43114", celo: "eip155:42220", solana: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp" };
const NET_NAME = { "eip155:8453": "Base", "eip155:84532": "Base Sepolia (TESTNET)", "eip155:1": "Ethereum", "eip155:137": "Polygon", "eip155:42161": "Arbitrum", "eip155:10": "Optimism", "eip155:43114": "Avalanche", "eip155:42220": "Celo", "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp": "Solana" };
const TESTNETS = new Set(["eip155:84532", "eip155:11155111", "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1"]);

function b64json(s) {
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

async function nohumans(url) {
  try {
    const r = await fetch(`https://api.nohumans.directory/v1/resolve?url=${encodeURIComponent(url)}`, { cf: { cacheTtl: 600 } });
    const j = await r.json();
    const d = j.detail || {};
    return { match: j.match, status: d.status ?? null, probe_score: d.score ?? null, probes: d.probe_count ?? null, price_usd: d.amount_usd ?? d.price_amount ?? null, pay_to: d.obs_pay_to ?? null, payto_unstable: d.payto_unstable ?? null,
      paid_verified: d.paid_verified ?? null, latest_purchase_delivered: d.latest_purchase_delivered ?? d.paid_verification_latest?.delivered ?? null, latest_purchase_failure_kind: d.paid_verification_latest?.failure_kind ?? null,
      distinct_payers: d.distinct_payers ?? null, listing: d.id ? `https://nohumans.directory/l/${d.id}` : null };
  } catch { return null; }
}
async function index402(url) {
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
    if (!isUSDC) o.issues.push("asset is not the canonical USDC contract for this network");
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
  if (i4?.health_status && i4.health_status !== "healthy") warnings.push(`402index health: ${i4.health_status}`);
  if (wallet?.is_contract) warnings.push("payTo on Base is a smart contract (fine for smart wallets/splitters, but verify)");
  if (!nh?.status && !i4?.listed) warnings.push("not found in nohumans.directory or 402index: no third-party track record");
  for (const o of options) for (const i of o.issues) (i.startsWith("testnet") || i.startsWith("payTo is not") ? problems : warnings).push(`${o.network_name}: ${i}`);

  const verdict = problems.length ? "do_not_pay" : warnings.length ? "caution" : "looks_ok";
  return {
    url: u.href, method, reachable: true, http_status: r.status, latency_ms: latency, transport, x402_version: challenge?.x402Version ?? null,
    description: challenge?.resource?.description ?? challenge?.accepts?.[0]?.description ?? null,
    payment_options: options, cheapest_usd: options.reduce((m, o) => (o.price_usd != null && (m == null || o.price_usd < m) ? o.price_usd : m), null),
    pay_to_wallet_base: wallet ? { address: base.pay_to, ...wallet } : null,
    directories: { nohumans: nh, index402: i4 },
    verdict, problems, warnings,
    sources: "Live unpaid probe by Nightshift; reputation from nohumans.directory and 402index.io public APIs; wallet data from Base RPC.",
    note: "Unpaid probe only: this does not pay the endpoint, so it cannot prove delivery. nohumans.directory 'latest_purchase_delivered' is the best delivery evidence when present.",
  };
}
