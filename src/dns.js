import DISPOSABLE_RAW from "./disposable.js";
const DISPOSABLE = new Set(DISPOSABLE_RAW.split("\n"));
const TYPES = { A: 1, NS: 2, CNAME: 5, SOA: 6, MX: 15, TXT: 16, AAAA: 28, CAA: 257 };
const NAMES = Object.fromEntries(Object.entries(TYPES).map(([k, v]) => [v, k]));
const ROLE = new Set(["admin", "administrator", "info", "support", "sales", "contact", "help", "billing", "postmaster", "hostmaster", "abuse", "noreply", "no-reply", "webmaster", "office", "team", "hello", "marketing", "jobs", "careers", "hr", "security", "privacy", "legal", "accounts", "enquiries", "inquiries", "service", "mail", "root"]);
const FREE = new Set(["gmail.com", "googlemail.com", "yahoo.com", "outlook.com", "hotmail.com", "live.com", "msn.com", "icloud.com", "me.com", "aol.com", "proton.me", "protonmail.com", "gmx.com", "gmx.de", "web.de", "yandex.ru", "yandex.com", "mail.ru", "zoho.com", "qq.com", "163.com", "126.com", "fastmail.com", "tutanota.com", "hey.com", "mail.com", "inbox.com", "yahoo.co.uk", "hotmail.co.uk", "libero.it", "orange.fr", "free.fr", "t-online.de"]);

export function validDomain(d) {
  return typeof d === "string" && d.length <= 253 && /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,62}$/i.test(d);
}

export async function resolve(name, type) {
  const r = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`, { headers: { accept: "application/dns-json" } });
  if (!r.ok) throw new Error(`DoH ${r.status}`);
  const j = await r.json();
  const want = TYPES[type];
  return { status: j.Status, records: (j.Answer || []).filter((a) => a.type === want).map((a) => ({ type: NAMES[a.type] || a.type, ttl: a.TTL, data: type === "TXT" ? a.data.replace(/^"|"$/g, "").replace(/" "/g, "") : a.data })), cname: (j.Answer || []).filter((a) => a.type === 5 && want !== 5).map((a) => a.data) };
}
const RCODE = { 0: "NOERROR", 1: "FORMERR", 2: "SERVFAIL", 3: "NXDOMAIN", 5: "REFUSED" };

export async function dnsLookup(domain, types) {
  domain = (domain || "").trim().toLowerCase().replace(/\.$/, "");
  if (!validDomain(domain)) return { error: "Provide ?domain= with a valid domain name (e.g. example.com)", code: 400 };
  const list = (types ? types.toUpperCase().split(",") : ["A", "AAAA", "MX", "NS", "TXT", "CNAME", "CAA", "SOA"]).filter((t) => TYPES[t]);
  if (!list.length) return { error: `type must be one or more of ${Object.keys(TYPES).join(",")}`, code: 400 };
  const res = await Promise.all(list.map((t) => resolve(domain, t).catch((e) => ({ error: String(e.message || e) }))));
  const records = {};
  let status = null;
  list.forEach((t, i) => { records[t] = res[i].records ?? []; if (res[i].status != null && status !== 0) status = res[i].status; });
  const [spf, dmarc] = await Promise.all([
    records.TXT ? Promise.resolve(records.TXT) : resolve(domain, "TXT").then((x) => x.records).catch(() => []),
    resolve(`_dmarc.${domain}`, "TXT").then((x) => x.records).catch(() => []),
  ]);
  return {
    domain, rcode: RCODE[status] ?? status, exists: status === 0,
    records,
    email: { spf: spf.map((r) => r.data).find((s) => /^v=spf1/i.test(s)) ?? null, dmarc: dmarc.map((r) => r.data).find((s) => /^v=DMARC1/i.test(s)) ?? null },
    resolver: "Cloudflare 1.1.1.1 (DNS-over-HTTPS)",
  };
}

function parseTags(s) { return Object.fromEntries(s.split(";").map((p) => p.trim().split("=")).filter((p) => p.length === 2).map(([k, v]) => [k.trim().toLowerCase(), v.trim()])); }

export async function emailCheck(email) {
  email = (email || "").trim();
  const m = /^([^\s@]{1,64})@([^\s@]{1,253})$/.exec(email);
  const syntaxOk = !!m && /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(m[1]) && !m[1].startsWith(".") && !m[1].endsWith(".") && !m[1].includes("..");
  if (!m) return { email, valid_syntax: false, verdict: "invalid", reasons: ["not an email address"] };
  const local = m[1], domain = m[2].toLowerCase().replace(/\.$/, "");
  if (!syntaxOk || !validDomain(domain)) return { email, valid_syntax: false, verdict: "invalid", reasons: ["invalid syntax"] };
  const [mx, txt, dm, a] = await Promise.all([
    resolve(domain, "MX").catch(() => null), resolve(domain, "TXT").catch(() => null), resolve(`_dmarc.${domain}`, "TXT").catch(() => null), resolve(domain, "A").catch(() => null),
  ]);
  const mxHosts = (mx?.records || []).map((r) => { const [p, h] = r.data.split(" "); return { priority: Number(p), host: (h || "").replace(/\.$/, "") }; }).sort((x, y) => x.priority - y.priority);
  const nullMx = mxHosts.length === 1 && (mxHosts[0].host === "" || mxHosts[0].host === ".");
  const spf = (txt?.records || []).map((r) => r.data).find((s) => /^v=spf1/i.test(s)) ?? null;
  const dmarcRec = (dm?.records || []).map((r) => r.data).find((s) => /^v=DMARC1/i.test(s)) ?? null;
  const dmarcPolicy = dmarcRec ? (parseTags(dmarcRec).p || null) : null;
  const domainExists = mx?.status === 0 || a?.status === 0;
  const acceptsMail = !nullMx && (mxHosts.length > 0 || (a?.records?.length ?? 0) > 0);
  const base = domain.split(".").slice(-2).join(".");
  const disposable = DISPOSABLE.has(domain) || DISPOSABLE.has(base);
  const role = ROLE.has(local.toLowerCase().split("+")[0]);
  const free = FREE.has(domain);
  const reasons = [];
  if (!domainExists) reasons.push("domain does not exist (NXDOMAIN)");
  else if (nullMx) reasons.push("domain publishes a null MX (does not accept mail)");
  else if (!mxHosts.length) reasons.push(acceptsMail ? "no MX record; mail would fall back to A record" : "no MX or A record");
  if (disposable) reasons.push("disposable / temporary email provider");
  if (role) reasons.push("role-based address (shared mailbox)");
  if (!spf) reasons.push("domain has no SPF record");
  if (!dmarcRec) reasons.push("domain has no DMARC record");
  let verdict = "deliverable_likely";
  if (!domainExists || !acceptsMail) verdict = "undeliverable";
  else if (disposable) verdict = "risky_disposable";
  else if (!mxHosts.length) verdict = "risky_no_mx";
  else if (role) verdict = "ok_role_address";
  return {
    email, local, domain, valid_syntax: true, verdict, reasons,
    domain_exists: domainExists, accepts_mail: acceptsMail, mx: mxHosts.slice(0, 10), null_mx: nullMx,
    spf, dmarc: dmarcRec, dmarc_policy: dmarcPolicy, disposable, role_address: role, free_provider: free,
    note: "DNS-level check only: no SMTP probe is made, so mailbox existence is not confirmed.",
  };
}
