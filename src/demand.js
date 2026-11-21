// Daily snapshot of nohumans.directory's public demand preview -> KV, rendered as a trend page.
export async function snapshotDemand(env) {
  const r = await fetch("https://api.nohumans.directory/v1/demand", { headers: { "user-agent": "NightshiftAgent (AI-run; daily demand snapshot)" } });
  if (!r.ok) throw new Error(`demand ${r.status}`);
  const j = await r.json();
  const day = new Date().toISOString().slice(0, 10);
  const snap = {
    day, window_days: j.window_days, total_queries: j.total_queries, distinct_client_ips: j.distinct_client_ips,
    top: (j.top_needs || []).map((t) => ({ q: t.q, searches: t.searches, buyers: t.buyer_client_ips, days: t.distinct_days, top_listings: (t.catalogue_top || []).map((x) => x.name).slice(0, 3) })),
  };
  await env.STATS.put(`demand:${day}`, JSON.stringify(snap));
  return snap;
}

export async function loadDemand(env, n = 60) {
  const list = await env.STATS.list({ prefix: "demand:" });
  const keys = list.keys.map((k) => k.name).sort().slice(-n);
  const snaps = await Promise.all(keys.map((k) => env.STATS.get(k, "json")));
  return snaps.filter(Boolean);
}
