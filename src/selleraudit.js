// Seller-side audit of an x402 origin: discovery docs, per-route 402 conformance, directory presence, competitor prices, fixes.
import { b64json, USDC, V1_NET, nohumans } from "./x402check.js";

const UA = "NightshiftSellerAudit/0.1 (+https://nightshift-agent.solaris-organization.workers.dev)";
const MAX_ROUTES = 8;

async function getJson(url) {
  try {
    const r = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" }, redirect: "follow" });
    if (!r.ok) return { status: r.status, json: null };
    return { status: r.status, json: await r.json().catch(() => null) };
  } catch (e) { return { status: 0, json: null, error: String(e.message || e) }; }
}

async function probe(url, method, body) {
  const t0 = Date.now();
  try {
    const r = await fetch(url, { method, redirect: "manual", headers: { "user-agent": UA, accept: "application/json", ...(method !== "GET" ? { "content-type": "application/json" } : {}) }, body: method !== "GET" ? JSON.stringify(body ?? {}) : undefined });
    const text = await r.text();
    let ch = r.headers.get("payment-required") ? b64json(r.headers.get("payment-required")) : null;
    let transport = ch ? "header-v2" : null;
    if (!ch && r.status === 402) { try { const j = JSON.parse(text); if (j.accepts) { ch = j; transport = `body-v${j.x402Version ?? 1}`; } } catch {} }
    return { status: r.status, ms: Date.now() - t0, challenge: ch, transport };
  } catch (e) { return { status: 0, ms: Date.now() - t0, error: String(e.message || e) }; }
}

function priceOf(ch) {
  for (const a of ch?.accepts || []) {
    const net = V1_NET[a.network] || a.network;
    if (USDC[net] && String(a.asset).toLowerCase() === USDC[net].toLowerCase()) return Number(a.amount ?? a.maxAmountRequired) / 1e6;
  }
  return null;
}

async function competitors(q) {
  try {
    const r = await fetch(`https://api.nohumans.directory/v1/discover?q=${encodeURIComponent(q.slice(0, 200))}&limit=10&evidence=paid_verified`, { cf: { cacheTtl: 3600 } });
    const j = await r.json();
    const prices = (j.results || []).map((x) => x.price_amount).filter((x) => typeof x === "number" && x > 0).sort((a, b) => a - b);
    if (!prices.length) return null;
    return { paid_verified_competitors: prices.length, min_usd: prices[0], median_usd: prices[Math.floor(prices.length / 2)], max_usd: prices[prices.length - 1], examples: (j.results || []).slice(0, 3).map((x) => ({ name: x.name, price_usd: x.price_amount, payers_30d: x.onchain_unique_payers_30d ?? null })) };
  } catch { return null; }
}

export async function sellerAudit({ origin }) {
  let o;
  try { o = new URL(/^https?:\/\//.test(origin || "") ? origin : `https://${origin}`); } catch { return { error: "Provide ?origin= (e.g. https://api.example.com)", code: 400 }; }
  const base = o.origin;
  const fixes = [];
  const [oa, wk, i402] = await Promise.all([
    getJson(`${base}/openapi.json`), getJson(`${base}/.well-known/x402`),
    fetch(`https://402index.io/api/v1/services?q=${encodeURIComponent(o.hostname)}&limit=100`).then((r) => r.json()).catch(() => null),
  ]);
  const spec = oa.json && oa.json.paths ? oa.json : null;
  const discovery = {
    openapi_json: spec ? { found: true, title: spec.info?.title ?? null, has_x_guidance: !!spec.info?.["x-guidance"], has_contact_email: !!spec.info?.contact?.email, paths: Object.keys(spec.paths).length } : { found: false, status: oa.status },
    well_known_x402: wk.json && typeof wk.json === "object" ? { found: true, resources: (wk.json.resources || wk.json.endpoints || []).length || null } : { found: false, status: wk.status },
  };
  if (!spec) fixes.push("Serve /openapi.json. x402scan and agentcash discovery read only this file. Mark each paid operation with x-payment-info {protocols:[{x402:{}}], price:{mode:'fixed',currency:'USD',amount:'0.010000'}}.");
  else {
    if (!spec.info?.["x-guidance"]) fixes.push("Add info.x-guidance to /openapi.json: a short paragraph telling an agent which endpoint to call with which body.");
    if (!spec.info?.contact?.email) fixes.push("Add info.contact.email to /openapi.json. x402scan uses it to verify ownership.");
  }

  // routes to test
  let routes = [];
  if (spec) {
    for (const [path, ops] of Object.entries(spec.paths)) {
      for (const [m, op] of Object.entries(ops)) {
        if (!["get", "post", "put", "delete"].includes(m)) continue;
        const paid = !!(op["x-payment-info"] || op["x-x402"] || op.responses?.["402"]);
        if (!paid) continue;
        const ex = op.requestBody?.content?.["application/json"]?.example ?? op.requestBody?.content?.["application/json"]?.schema?.example;
        const qp = (op.parameters || []).filter((p) => p.in === "query" && p.required).map((p) => [p.name, p.example ?? p.schema?.example ?? "test"]);
        const filled = path.replace(/\{[^}]+\}/g, "test");
        routes.push({ path, method: m.toUpperCase(), url: base + filled + (m === "get" && qp.length ? "?" + new URLSearchParams(qp) : ""), body: ex, summary: op.summary || op.description || path, declared_price: op["x-payment-info"]?.price?.amount ?? op["x-payment-info"]?.price ?? null, has_input_schema: !!(op.requestBody || (op.parameters || []).length), has_output_schema: !!op.responses?.["200"]?.content });
      }
    }
  }
  if (!routes.length && Array.isArray(wk.json?.resources)) {
    for (const x of wk.json.resources.slice(0, MAX_ROUTES)) {
      const url = typeof x === "string" ? x : x?.url || x?.resource;
      try { const ru = new URL(url, base); routes.push({ path: ru.pathname, method: (x?.method || "GET").toUpperCase(), url: ru.href, summary: x?.description || ru.pathname }); } catch {}
    }
  }
  if (!routes.length && o.pathname !== "/") routes.push({ path: o.pathname, method: "GET", url: o.href, summary: o.pathname });
  if (!routes.length) fixes.push("No paid routes found to test: publish them in /openapi.json or /.well-known/x402, or pass a full endpoint URL as origin.");
  const totalPaid = routes.length;
  // prefer one method per path
  const seen = new Set();
  routes = routes.filter((r) => (seen.has(r.path) ? false : (seen.add(r.path), true))).slice(0, MAX_ROUTES);

  const results = await Promise.all(routes.map(async (rt) => {
    let p = await probe(rt.url, rt.method, rt.body);
    const issues = [];
    if (p.status !== 402 && rt.method === "GET") { const p2 = await probe(rt.url, "POST", rt.body); if (p2.status === 402) { issues.push("GET does not answer 402 but POST does. Many probers use GET first, so either answer 402 on GET too or declare POST only."); p = p2; } }
    if (p.status !== 402) issues.push(`unpaid request returned ${p.status || "no response"} instead of 402${p.status === 400 || p.status === 422 ? " (validate input after the payment check, so probes get a 402)" : ""}`);
    else if (!p.challenge) issues.push("402 without a decodable x402 payment requirement (PAYMENT-REQUIRED header or JSON body with accepts)");
    const price = priceOf(p.challenge);
    const a0 = p.challenge?.accepts?.[0];
    if (a0) {
      const net = V1_NET[a0.network] || a0.network;
      if (net === "eip155:84532") issues.push("TESTNET (Base Sepolia): real buyers cannot pay you. Switch to eip155:8453.");
      if (String(net).startsWith("eip155:") && !a0.extra?.name) issues.push("missing extra.name/version (EIP-712 domain): standard clients can't sign");
      if (price == null) issues.push("asset is not canonical USDC on its network; most agent wallets only hold USDC");
      if (rt.declared_price && price != null && Math.abs(Number(rt.declared_price) - price) > 1e-9) issues.push(`openapi declares $${rt.declared_price} but the live 402 asks $${price}`);
      if (!p.challenge.extensions?.bazaar && p.transport === "header-v2") issues.push("no bazaar discovery extension in the 402 (CDP Bazaar and some indexers use it for input/output schemas)");
    }
    if (spec && !rt.has_input_schema) issues.push("no input schema in openapi (requestBody or parameters)");
    if (spec && !rt.has_output_schema) issues.push("no 200 response schema in openapi");
    if (p.ms > 3000) issues.push(`slow 402 (${p.ms} ms)`);
    return { path: rt.path, method: rt.method, probed: rt.url, status: p.status, latency_ms: p.ms, transport: p.transport, price_usd: price, pay_to: a0?.payTo ?? null, issues, _summary: rt.summary };
  }));

  // directories
  const hosted = (i402?.services || []).filter((s) => { try { return new URL(s.url).hostname === o.hostname; } catch { return false; } });
  const nh = await Promise.all(results.slice(0, 5).map((r) => nohumans(r.probed)));
  const comp = await Promise.all(results.slice(0, 3).map((r) => competitors(String(r._summary))));
  results.forEach((r, i) => {
    r.nohumans = nh[i] ? { match: nh[i].match, status: nh[i].status, paid_verified: nh[i].paid_verified, latest_purchase_delivered: nh[i].latest_purchase_delivered } : undefined;
    r.market = comp[i] ?? undefined;
    if (r.market && r.price_usd != null && r.price_usd > r.market.median_usd * 2) r.issues.push(`priced at $${r.price_usd}, over 2x the median ($${r.market.median_usd}) of paid-verified competitors`);
    delete r._summary;
  });
  const payTos = [...new Set(results.map((r) => r.pay_to).filter(Boolean).map((x) => x.toLowerCase()))];
  if (payTos.length > 1) fixes.push(`${payTos.length} different payTo addresses across routes. Intentional? Directories flag payTo changes.`);
  if (!hosted.length) fixes.push("Not on 402index.io: POST https://402index.io/api/v1/register {url,name,protocol:'x402',price_usd,...} (free, verify your domain once).");
  if (results.length && !nh.some((x) => x && x.match === "active")) fixes.push("Not on nohumans.directory, where agents search before paying: POST https://api.nohumans.directory/v1/listings ($0.25 over x402, includes one real purchase so you get a delivery record).");
  fixes.push("x402scan: register the whole origin with a Sign-In-With-X signature: POST https://www.x402scan.com/api/x402/registry/register-origin {origin}. Script: https://github.com/llm-9-to-5/nightshift-x402-worker/blob/main/tools/x402scan-register.mjs");
  const routeIssues = results.reduce((n, r) => n + r.issues.length, 0);
  const passing = results.filter((r) => r.status === 402 && r.price_usd != null).length;
  const score = Math.max(0, Math.round(100 * (passing / Math.max(1, results.length)) - 4 * routeIssues - (spec ? 0 : 20)));
  return {
    origin: base, score, summary: `${passing}/${results.length} tested routes return a valid USDC x402 challenge; ${routeIssues} route issues; ${fixes.length} origin-level fixes.`,
    discovery, paid_routes_declared: totalPaid, routes_tested: results.length, routes: results,
    directories: { index402: { listed_endpoints: hosted.length, healthy: hosted.filter((s) => s.health_status === "healthy").length } },
    fixes,
    note: "Unpaid probes only (nothing is purchased). Market prices: paid-verified listings on nohumans.directory matching each route's summary.",
  };
}
