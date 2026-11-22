// x402 seller leaderboard + per-seller badges, built from Pulse day data (pulse:day:*).
// Ranks recipients of x402-sized (<= $1) EIP-3009 USDC payments on Base by DISTINCT PAYING WALLETS,
// not by volume, and adds "returning" (paid the same seller the day before) and "exclusive" payers.

// Hand-checked labels for big recipients that no directory lists (sources in the diary).
export const LABELS = {
  "0x7284d41b5b852f2bd4c99bdf95043d84452d299c": "AX1 (quest contest with prize pool)",
  "0xcc1984e79726e7a0ae2b9df2ac9e79fb4983930e": "botpay.network (via x402scan)",
};

const invert = (D) => {
  const by = {}; // payee -> [payer...]
  for (const [payer, set] of Object.entries(D.payers || {})) for (const payee of Object.keys(set)) (by[payee] ||= []).push(payer);
  return by;
};

// D = full day, P = previous day (or null). Returns rows sorted by payers.
export function rankDay(D, P, census) {
  const by = invert(D);
  const prevBy = P ? invert(P) : {};
  const rows = [];
  // "Wide buyers": wallets that paid >= 20 different recipients that day. Mostly directory/auditor crawlers doing paid
  // verification (see /diary/which-x402-apis-get-paid-nohumans-onchain-nov-2026). A paid probe is not a customer.
  const wide = new Set(Object.entries(D.payers || {}).filter(([, set]) => Object.keys(set).length >= 20).map(([p]) => p));
  for (const [a, [n, usd, pc]] of Object.entries(D.payees)) {
    const payers = by[a] || [];
    const prev = new Set(prevBy[a] || []);
    const exclusive = payers.filter((p) => Object.keys(D.payers[p]).length === 1).length;
    rows.push({
      payTo: a, payers: pc, payments: n, usd: +usd.toFixed(2),
      returning_payers: P ? payers.filter((p) => prev.has(p)).length : null,
      exclusive_payers: exclusive,
      crawler_payers: payers.filter((p) => wide.has(p)).length,
      payments_per_payer: +(n / Math.max(1, pc)).toFixed(1),
      usd_prev_day: P && P.payees[a] ? +P.payees[a][1].toFixed(2) : P ? 0 : null,
      name: LABELS[a] || (census[a]?.[5] || []).slice(0, 2).join(", ") || null,
      listed: !!census[a],
    });
  }
  rows.sort((x, y) => y.payers - x.payers || y.usd - x.usd);
  rows.forEach((r, i) => (r.rank = i + 1));
  return rows;
}

export function flags(r) {
  const f = [];
  if (r.payers <= 3 && r.usd >= 5) f.push("few wallets");
  if (r.payers >= 50 && r.payments_per_payer <= 1.05) f.push("one payment per wallet");
  const closed = r.returning_payers !== null && r.payers >= 20 && r.returning_payers / r.payers >= 0.95 && r.exclusive_payers / r.payers >= 0.95;
  if (closed) f.push("closed fleet");
  else if (r.returning_payers !== null && r.payers >= 20 && r.returning_payers / r.payers >= 0.3) f.push("repeat buyers");
  if (r.payers >= 50 && r.exclusive_payers === 0) f.push("shared buyers");
  if (r.crawler_payers && r.crawler_payers >= r.payers) f.push("crawlers only");
  return f;
}

// Latest full UTC day + the day before.
export function pickDays(days) {
  const today = new Date().toISOString().slice(0, 10);
  const full = days.filter((d) => d.day < today);
  return { D: full[full.length - 1] || null, P: full[full.length - 2] || null };
}

export function badgeSvg(label, value, color = "#2b6cb0") {
  const w = (s) => Math.round(s.length * 6.6 + 12);
  const lw = w(label), vw = w(value);
  const e = (s) => s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${lw + vw}" height="20" role="img" aria-label="${e(label)}: ${e(value)}"><title>${e(label)}: ${e(value)}</title><rect width="${lw}" height="20" fill="#555"/><rect x="${lw}" width="${vw}" height="20" fill="${color}"/><g fill="#fff" font-family="Verdana,DejaVu Sans,sans-serif" font-size="11" text-anchor="middle"><text x="${lw / 2}" y="14">${e(label)}</text><text x="${lw + vw / 2}" y="14">${e(value)}</text></g></svg>`;
}

// "Real x402 index" (night 11): USD per day that looks like open-market commerce. Waterfall: total, minus AX1 contest,
// minus paid probes from crawler wallets (>= 20 recipients that day), minus sellers with < 20 non-crawler wallets,
// minus closed fleets (>= 95% returning and >= 95% exclusive), minus one-payment-per-wallet sellers. Needs v2 day data
// (per-pair USD); returns null for older days. Same rules as tools/census/realindex.py.
export const AX1 = "0x7284d41b5b852f2bd4c99bdf95043d84452d299c";
export function realIndex(D, P) {
  if (!D || D.v !== 2 || !P) return null;
  const by = {}; const deg = {};
  for (const [payer, set] of Object.entries(D.payers || {})) { deg[payer] = Object.keys(set).length; for (const [payee, usd] of Object.entries(set)) (by[payee] ||= []).push([payer, usd]); }
  const prev = invert(P);
  const w = { total: 0, ax1_contest: 0, crawler_probes: 0, small_sellers: 0, closed_fleets: 0, one_pay_per_wallet: 0, real: 0 };
  const top = []; const realW = new Set();
  for (const [a, [n, usd, pc]] of Object.entries(D.payees)) {
    w.total += usd;
    if (a === AX1) { w.ax1_contest += usd; continue; }
    const list = by[a] || []; const org = list.filter(([p]) => deg[p] < 20);
    const cu = list.reduce((s, [p, u]) => s + (deg[p] >= 20 ? u : 0), 0); w.crawler_probes += cu;
    const ou = usd - cu; const W = org.length;
    if (W < 20) { w.small_sellers += ou; continue; }
    const pv = new Set(prev[a] || []);
    const ret = org.filter(([p]) => pv.has(p)).length / W, excl = org.filter(([p]) => deg[p] === 1).length / W;
    if (ret >= 0.95 && excl >= 0.95) { w.closed_fleets += ou; continue; }
    if (W >= 50 && n / Math.max(1, pc) <= 1.05) { w.one_pay_per_wallet += ou; continue; }
    w.real += ou; org.forEach(([p]) => realW.add(p)); top.push([a, +ou.toFixed(2), W]);
  }
  top.sort((x, y) => y[1] - x[1]);
  const r = { day: D.day }; for (const k in w) r[k] = +w[k].toFixed(2);
  return { ...r, real_sellers: top.length, real_wallets: realW.size, real_share: +(w.real / Math.max(1e-9, w.total)).toFixed(4), top_real: top.slice(0, 10), source: "pulse" };
}
