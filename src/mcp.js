// Minimal remote MCP server (Streamable HTTP, JSON responses, stateless). Tools dispatch internally to the /api/* handlers.
const VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
const FREE_PER_DAY = 50; // per client IP per isolate (best effort)
const hits = new Map();

export function mcpTools(PRODUCTS) {
  const name = (p) => p.replace("/api/", "").replace(/-/g, "_");
  return Object.entries(PRODUCTS).map(([path, p]) => ({
    name: name(path), path,
    title: { "/api/weather": "Weather forecast", "/api/sec-company": "SEC company fundamentals", "/api/domain-intel": "Company/domain enrichment", "/api/x402-check": "Check an x402 endpoint before paying", "/api/x402-revenue": "On-chain revenue of an x402 seller", "/api/seller-audit": "Audit an x402 seller API", "/api/email-check": "Email address validation", "/api/dns": "DNS lookup", "/api/extract": "Web page to markdown", "/api/meta": "Web page metadata" }[path] || name(path),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    description: `${p.description} (Free via MCP, ${FREE_PER_DAY} calls/day; unlimited pay-per-call over x402 at ${p.price}: ${path})`,
    inputSchema: { type: "object", properties: Object.fromEntries(Object.entries(p.params).map(([k, v]) => [k, { type: v.type, description: v.description }])), required: Object.entries(p.params).filter(([, v]) => v.required).map(([k]) => k) },
  })).concat([{
    name: "x402_market_pulse", path: "/pulse.json", get: true, title: "x402 market pulse (on-chain, Base)",
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    description: "Daily on-chain totals of x402-sized (<= $1) USDC payments on Base, read from chain every 10 minutes: payments, USD, recipients, payers, concentration, top recipients. Free. Use it to size the agent-payments market before building or pricing an x402 API.",
    inputSchema: { type: "object", properties: {}, required: [] },
  }]);
}

export async function handleMcp(c, app, PRODUCTS) {
  if (c.req.method === "GET") return c.text("This MCP endpoint speaks Streamable HTTP via POST (JSON responses, no SSE stream).", 405, { allow: "POST" });
  if (c.req.method === "DELETE") return c.body(null, 405);
  let msg;
  try { msg = await c.req.json(); } catch { return c.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400); }
  const batch = Array.isArray(msg);
  const out = [];
  for (const m of batch ? msg : [msg]) { const r = await one(m, c, app, PRODUCTS); if (r) out.push(r); }
  if (!out.length) return c.body(null, 202);
  return c.json(batch ? out : out[0]);
}

async function one(m, c, app, PRODUCTS) {
  const { id, method, params } = m || {};
  const isNote = id === undefined || id === null;
  const ok = (result) => ({ jsonrpc: "2.0", id, result });
  const err = (code, message) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });
  if (method === "initialize" || method === "server/discover") {
    const v = VERSIONS.includes(params?.protocolVersion) ? params.protocolVersion : VERSIONS[1];
    return ok({ protocolVersion: v, capabilities: { tools: { listChanged: false } }, serverInfo: { name: "nightshift-agent-tools", title: "Nightshift agent tools", version: "0.1.0" },
      instructions: "Utility tools run by an autonomous AI agent (Nightshift, built on Claude): worldwide weather by city or lat/lon, SEC company fundamentals by ticker, company/domain enrichment, email validation, DNS lookup, x402 endpoint pre-payment check, web page to markdown, page metadata. Free tier is rate limited; the same tools are available pay-per-call over x402 (USDC on Base) at https://nightshift-agent.solaris-organization.workers.dev/api" });
  }
  if (isNote) return null; // notifications/initialized etc.
  if (method === "ping") return ok({});
  if (method === "tools/list") return ok({ tools: mcpTools(PRODUCTS).map(({ path, ...t }) => t) });
  if (method === "tools/call") {
    const tool = mcpTools(PRODUCTS).find((t) => t.name === params?.name);
    if (!tool) return err(-32602, `Unknown tool: ${params?.name}`);
    const ip = c.req.header("cf-connecting-ip") || "unknown";
    const day = new Date().toISOString().slice(0, 10);
    const k = `${day}:${ip}`;
    const n = (hits.get(k) || 0) + 1; hits.set(k, n);
    if (hits.size > 5000) hits.clear();
    if (n > FREE_PER_DAY) return ok({ isError: true, content: [{ type: "text", text: `Free MCP limit reached (${FREE_PER_DAY}/day). Pay per call over x402 instead: ${new URL(tool.path, c.req.url).href} (USDC on Base, no signup).` }] });
    const req = tool.get ? new Request(new URL(tool.path, c.req.url)) : new Request(new URL(tool.path, c.req.url), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(params?.arguments || {}) });
    const r = await app.fetch(req, { ...c.env, INTERNAL_MCP: true }, c.executionCtx);
    const text = await r.text();
    return ok({ isError: r.status >= 400, content: [{ type: "text", text }] });
  }
  return err(-32601, `Method not found: ${method}`);
}
