// Lightweight HTML -> markdown + metadata extraction (no deps, Workers-safe)
const ent = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };
export function decode(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z0-9]+);/gi, (m, e) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ent[e.toLowerCase()] ?? m;
  });
}
function attr(tag, name) {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return m ? decode(m[2] ?? m[3] ?? m[4] ?? "") : null;
}
export function meta(html, baseUrl) {
  const out = { title: null, description: null, canonical: null, lang: null, og: {}, twitter: {}, favicon: null };
  const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (t) out.title = decode(t[1].trim()).replace(/\s+/g, " ");
  const l = html.match(/<html[^>]*\blang\s*=\s*["']?([\w-]+)/i);
  if (l) out.lang = l[1];
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    const key = (attr(tag, "property") || attr(tag, "name") || "").toLowerCase();
    const val = attr(tag, "content");
    if (!key || val == null) continue;
    if (key === "description") out.description = val;
    else if (key.startsWith("og:")) out.og[key.slice(3)] = val;
    else if (key.startsWith("twitter:")) out.twitter[key.slice(8)] = val;
  }
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const rel = (attr(m[0], "rel") || "").toLowerCase();
    const href = attr(m[0], "href");
    if (!href) continue;
    if (rel === "canonical") out.canonical = abs(href, baseUrl);
    if (rel.includes("icon") && !out.favicon) out.favicon = abs(href, baseUrl);
  }
  if (!out.favicon) out.favicon = abs("/favicon.ico", baseUrl);
  return out;
}
function abs(href, base) { try { return new URL(href, base).href; } catch { return href; } }

export function toMarkdown(html, baseUrl) {
  let h = html;
  // pick main content if present
  const main = h.match(/<(main|article)\b[^>]*>([\s\S]*?)<\/\1>/i);
  const body = h.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  h = main ? main[2] : body ? body[1] : h;
  h = h.replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|noscript|svg|iframe|template|form|nav|footer|header|aside)\b[\s\S]*?<\/\1>/gi, "");
  const links = [];
  h = h.replace(/<pre\b[^>]*>([\s\S]*?)<\/pre>/gi, (_, c) => "\n\n```\n" + decode(c.replace(/<[^>]+>/g, "")).trim() + "\n```\n\n");
  h = h.replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, (_, c) => "`" + c.replace(/<[^>]+>/g, "") + "`");
  h = h.replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_, n, c) => "\n\n" + "#".repeat(+n) + " " + c.replace(/<[^>]+>/g, "").trim() + "\n\n");
  h = h.replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (m, a, c) => {
    const href = attr("<a " + a + ">", "href");
    const text = c.replace(/<[^>]+>/g, "").trim();
    if (!href || href.startsWith("javascript:") || !text) return text;
    const u = abs(href, baseUrl);
    links.push({ text: decode(text).replace(/\s+/g, " "), href: u });
    return `[${text}](${u})`;
  });
  h = h.replace(/<img\b[^>]*>/gi, (tag) => { const s = attr(tag, "src"); const a = attr(tag, "alt") || ""; return s ? `![${a}](${abs(s, baseUrl)})` : ""; });
  h = h.replace(/<li\b[^>]*>/gi, "\n- ").replace(/<\/li>/gi, "")
    .replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi, "**$2**")
    .replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1>/gi, "*$2*")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<blockquote\b[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, c) => "\n\n> " + c.replace(/<[^>]+>/g, "").trim().replace(/\n/g, "\n> ") + "\n\n")
    .replace(/<\/(p|div|section|ul|ol|table|tr|h\d)>/gi, "\n\n")
    .replace(/<t[dh]\b[^>]*>/gi, " | ")
    .replace(/<[^>]+>/g, "");
  h = decode(h).replace(/[ \t]+/g, " ").replace(/\n[ \t]+/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return { markdown: h, links };
}
