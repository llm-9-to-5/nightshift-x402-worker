import TICKERS from "./tickers.js"; // { TICKER: [cik, title] } snapshot of sec.gov/files/company_tickers.json

const UA = "NightshiftAgent/0.3 (AI-run API; https://nightshift-agent.solaris-organization.workers.dev)";
const get = async (url, ttl = 3600) => {
  const r = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" }, cf: { cacheTtl: ttl, cacheEverything: true } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`SEC ${r.status}`);
  return r.json();
};
const pad = (cik) => String(cik).padStart(10, "0");

// [label, taxonomy, candidate concepts (first with data wins), unit, kind]
const CONCEPTS = [
  ["revenue", "us-gaap", ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "SalesRevenueNet", "RevenueFromContractWithCustomerIncludingAssessedTax"], "USD", "flow"],
  ["gross_profit", "us-gaap", ["GrossProfit"], "USD", "flow"],
  ["operating_income", "us-gaap", ["OperatingIncomeLoss"], "USD", "flow"],
  ["net_income", "us-gaap", ["NetIncomeLoss", "ProfitLoss"], "USD", "flow"],
  ["eps_diluted", "us-gaap", ["EarningsPerShareDiluted", "EarningsPerShareBasicAndDiluted"], "USD/shares", "flow"],
  ["operating_cash_flow", "us-gaap", ["NetCashProvidedByUsedInOperatingActivities"], "USD", "flow"],
  ["capex", "us-gaap", ["PaymentsToAcquirePropertyPlantAndEquipment"], "USD", "flow"],
  ["total_assets", "us-gaap", ["Assets"], "USD", "instant"],
  ["total_liabilities", "us-gaap", ["Liabilities"], "USD", "instant"],
  ["stockholders_equity", "us-gaap", ["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"], "USD", "instant"],
  ["cash", "us-gaap", ["CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"], "USD", "instant"],
  ["long_term_debt", "us-gaap", ["LongTermDebtNoncurrent", "LongTermDebt"], "USD", "instant"],
  ["shares_outstanding", "dei", ["EntityCommonStockSharesOutstanding"], "shares", "instant"],
];

async function concept(cik, tax, names, unit, kind, years) {
  for (const n of names) {
    const j = await get(`https://data.sec.gov/api/xbrl/companyconcept/CIK${pad(cik)}/${tax}/${n}.json`, 21600).catch(() => null);
    const rows = j?.units?.[unit];
    if (!rows?.length) continue;
    const annual = [], quarterly = [];
    let latestInstant = null;
    for (const r of rows) {
      if (kind === "flow") {
        if (r.frame && /^CY\d{4}$/.test(r.frame)) annual.push(r);
        else if (r.frame && /^CY\d{4}Q\d$/.test(r.frame)) quarterly.push(r);
      } else {
        if (!latestInstant || r.end > latestInstant.end || (r.end === latestInstant.end && r.filed > latestInstant.filed)) latestInstant = r;
        if (r.form === "10-K" && r.fp === "FY") annual.push(r);
      }
    }
    // fresh data may not carry a frame yet: fall back to newest 10-Q/10-K row
    const newest = rows.reduce((a, b) => (!a || b.end > a.end || (b.end === a.end && b.filed > a.filed) ? b : a), null);
    const fmt = (r) => r && ({ value: r.val, period_start: r.start ?? null, period_end: r.end, frame: r.frame ?? null, form: r.form, filed: r.filed });
    const byEnd = (a, b) => (a.end < b.end ? 1 : -1);
    annual.sort(byEnd); quarterly.sort(byEnd);
    const dedup = (arr) => { const s = new Set(); return arr.filter((r) => (s.has(r.end) ? false : (s.add(r.end), true))); };
    return {
      concept: `${tax}:${n}`, unit,
      latest: fmt(kind === "instant" ? latestInstant : newest),
      annual: dedup(annual).slice(0, years).map(fmt),
      ...(kind === "flow" ? { quarterly: dedup(quarterly).slice(0, 4).map(fmt) } : {}),
    };
  }
  return null;
}

export async function resolveCompany(q) {
  q = String(q || "").trim();
  if (!q) return null;
  if (/^\d{1,10}$/.test(q)) return { cik: Number(q), ticker: null };
  const t = q.toUpperCase().replace(/\./g, "-");
  if (TICKERS[t]) return { cik: TICKERS[t][0], ticker: t };
  try { // refresh map for newer listings
    const live = await get("https://www.sec.gov/files/company_tickers.json", 86400);
    for (const v of Object.values(live || {})) if (v.ticker.toUpperCase() === t) return { cik: v.cik_str, ticker: t };
  } catch {}
  return null;
}

export async function secCompany({ ticker, cik, years = 5, filings = 10 }) {
  const id = await resolveCompany(ticker || cik);
  if (!id) return { error: "Unknown ticker/CIK. Pass ?ticker=AAPL or ?cik=320193 (US SEC registrants only).", code: 404 };
  const Y = Math.max(1, Math.min(10, Number(years) || 5)), F = Math.max(0, Math.min(40, Number(filings) || 10));
  const [sub, ...facts] = await Promise.all([
    get(`https://data.sec.gov/submissions/CIK${pad(id.cik)}.json`, 3600),
    ...CONCEPTS.map(([, tax, names, unit, kind]) => concept(id.cik, tax, names, unit, kind, Y)),
  ]);
  if (!sub) return { error: "CIK not found at SEC", code: 404 };
  const rec = sub.filings?.recent || {};
  const list = [];
  for (let i = 0; i < (rec.form?.length || 0) && list.length < F; i++) {
    const form = rec.form[i];
    if (!/^(10-K|10-Q|8-K|20-F|40-F|6-K|S-1|DEF 14A|10-K\/A|10-Q\/A)$/.test(form)) continue;
    const acc = rec.accessionNumber[i];
    list.push({ form, filed: rec.filingDate[i], report_date: rec.reportDate[i] || null, items: rec.items?.[i] || null, description: rec.primaryDocDescription?.[i] || null,
      url: `https://www.sec.gov/Archives/edgar/data/${id.cik}/${acc.replace(/-/g, "")}/${rec.primaryDocument[i]}`, accession: acc });
  }
  const financials = {};
  CONCEPTS.forEach(([label], i) => { financials[label] = facts[i]; });
  const lv = (k) => financials[k]?.annual?.[0]?.value ?? null;
  const ratio = (a, b) => (a != null && b ? Math.round((a / b) * 10000) / 10000 : null);
  return {
    company: {
      name: sub.name, cik: id.cik, tickers: sub.tickers, exchanges: sub.exchanges, sic: sub.sic, industry: sub.sicDescription,
      fiscal_year_end: sub.fiscalYearEnd, state_of_incorporation: sub.stateOfIncorporation || null, entity_type: sub.entityType, category: sub.category || null,
      website: sub.website || null, phone: sub.phone || null, former_names: (sub.formerNames || []).map((f) => f.name).slice(0, 5),
    },
    financials,
    ratios_latest_annual: {
      gross_margin: ratio(lv("gross_profit"), lv("revenue")), operating_margin: ratio(lv("operating_income"), lv("revenue")), net_margin: ratio(lv("net_income"), lv("revenue")),
      liabilities_to_assets: ratio(financials.total_liabilities?.annual?.[0]?.value, financials.total_assets?.annual?.[0]?.value),
      free_cash_flow: lv("operating_cash_flow") != null && lv("capex") != null ? lv("operating_cash_flow") - lv("capex") : null,
    },
    recent_filings: list,
    notes: "Annual = calendar-aligned SEC XBRL frames (CYyyyy); latest = newest reported value. Values in USD unless unit says otherwise. Not investment advice.",
    source: "SEC EDGAR (data.sec.gov), public domain.",
  };
}
