import { meta } from "./extract.js";
import { resolve, validDomain } from "./dns.js";
import TICKERS from "./tickers.js";

const UA = "Mozilla/5.0 (compatible; NightshiftAgentBot/0.3; +https://nightshift-agent.solaris-organization.workers.dev)";

const MX_PROVIDERS = [
  [/google\.com$|googlemail\.com$/, "Google Workspace"], [/outlook\.com$|protection\.outlook\.com$/, "Microsoft 365"], [/pphosted\.com$/, "Proofpoint"],
  [/mimecast\.com$/, "Mimecast"], [/zoho\.(com|eu|in)$/, "Zoho Mail"], [/protonmail\.ch$|proton\.me$/, "Proton Mail"], [/messagingengine\.com$/, "Fastmail"],
  [/secureserver\.net$/, "GoDaddy"], [/amazonaws\.com$|amazonses\.com$/, "Amazon SES/WorkMail"], [/barracudanetworks\.com$/, "Barracuda"], [/icloud\.com$/, "iCloud Mail"],
  [/yandex\.(net|ru)$/, "Yandex"], [/mailgun\.org$/, "Mailgun"], [/hostinger\.com$/, "Hostinger"], [/ovh\.net$/, "OVH"], [/emailsrvr\.com$/, "Rackspace"], [/improvmx\.com$/, "ImprovMX"], [/cloudflare\.net$/, "Cloudflare Email Routing"],
];
const SPF_SERVICES = [
  [/_spf\.google\.com/, "Google Workspace"], [/spf\.protection\.outlook\.com/, "Microsoft 365"], [/sendgrid\.net/, "SendGrid"], [/mailgun\.org/, "Mailgun"], [/amazonses\.com/, "Amazon SES"],
  [/servers\.mcsv\.net|mailchimp/, "Mailchimp"], [/mktomail\.com/, "Marketo"], [/hubspotemail\.net|hubspot/, "HubSpot"], [/_spf\.salesforce\.com|exacttarget/, "Salesforce"],
  [/zendesk\.com/, "Zendesk"], [/freshdesk\.com/, "Freshdesk"], [/helpscoutemail\.com/, "Help Scout"], [/intercom/, "Intercom"], [/postmarkapp\.com|mtasv\.net/, "Postmark"],
  [/sparkpostmail\.com/, "SparkPost"], [/mandrillapp\.com/, "Mandrill"], [/zoho\.com/, "Zoho"], [/atlassian\.net/, "Atlassian"], [/greenhouse/, "Greenhouse"], [/qualtrics/, "Qualtrics"],
  [/shopify\.com/, "Shopify"], [/klaviyo/, "Klaviyo"], [/customer\.io/, "Customer.io"], [/brevo|sendinblue/, "Brevo"], [/stripe\.com/, "Stripe"], [/docusign/, "DocuSign"], [/notion/, "Notion"],
];
const TXT_VERIFICATIONS = [
  [/^google-site-verification=/, "Google Search Console"], [/^MS=ms\d+/, "Microsoft 365"], [/^facebook-domain-verification=/, "Meta (Facebook) Business"], [/^apple-domain-verification=/, "Apple"],
  [/^atlassian-domain-verification=/, "Atlassian"], [/^stripe-verification=/, "Stripe"], [/^docusign=/, "DocuSign"], [/^adobe-idp-site-verification=|^adobe-sign-verification=/, "Adobe"],
  [/^hubspot-developer-verification=|^hubspot-site-verification/, "HubSpot"], [/^slack-domain-verification=/, "Slack"], [/^zoom-domain-verification=|^ZOOM_verify_/, "Zoom"], [/^dropbox-domain-verification=/, "Dropbox"],
  [/^openai-domain-verification=/, "OpenAI"], [/^anthropic-domain-verification/, "Anthropic"], [/^canva-site-verification=/, "Canva"], [/^miro-verification=/, "Miro"], [/^notion-domain-verification/, "Notion"],
  [/^cisco-ci-domain-verification=/, "Cisco Webex"], [/^onetrust-domain-verification=/, "OneTrust"], [/^globalsign-domain-verification=|^_globalsign/, "GlobalSign"], [/^sophos-domain-verification=/, "Sophos"],
  [/^amazonses:/, "Amazon SES"], [/^mailru-verification/, "Mail.ru"], [/^yandex-verification/, "Yandex"], [/^figma-domain-verification/, "Figma"], [/^postman-domain-verification/, "Postman"],
  [/^twilio-domain-verification/, "Twilio"], [/^asana-domain-verification|^asv=/, "Asana"], [/^webexdomainverification/, "Cisco Webex"], [/^knowbe4-site-verification/, "KnowBe4"], [/^citrix-verification-code/, "Citrix"],
  [/^wiz-domain-verification/, "Wiz"], [/^vercel-domain-verification|^vc-domain-verify/, "Vercel"], [/^github-verification|^_github-challenge/, "GitHub"], [/^segment-site-verification/, "Segment"], [/^zapier-domain-verification/, "Zapier"],
];
const TECH = [
  ["Cloudflare", (h, H) => H.has("cf-ray")], ["Vercel", (h, H) => H.has("x-vercel-id")], ["Netlify", (h, H) => H.has("x-nf-request-id")], ["AWS CloudFront", (h, H) => /cloudfront/i.test(H.get("via") || "") || H.has("x-amz-cf-id")],
  ["Fastly", (h, H) => H.has("x-fastly-request-id") || /fastly/i.test(H.get("x-served-by") || "")], ["Akamai", (h, H) => /akamai/i.test(H.get("server") || "") || H.has("x-akamai-transformed")],
  ["nginx", (h, H) => /nginx/i.test(H.get("server") || "")], ["Apache", (h, H) => /apache/i.test(H.get("server") || "")], ["Google Cloud", (h, H) => /gws|gfe|Google Frontend/i.test(H.get("server") || "")],
  ["Next.js", (h, H) => /__NEXT_DATA__|\/_next\/static/.test(h) || /next\.js/i.test(H.get("x-powered-by") || "")], ["Nuxt", (h) => /__NUXT__|\/_nuxt\//.test(h)], ["Gatsby", (h) => /___gatsby/.test(h)],
  ["React", (h) => /data-reactroot|react-dom|__NEXT_DATA__/.test(h)], ["Vue.js", (h) => /data-v-[0-9a-f]{8}|vue(\.min)?\.js/.test(h)], ["Angular", (h) => /ng-version=/.test(h)], ["Svelte", (h) => /svelte-[a-z0-9]{6}|__sveltekit/.test(h)],
  ["WordPress", (h) => /wp-content\/|wp-includes\//.test(h)], ["Shopify", (h, H) => /cdn\.shopify\.com|Shopify\.theme/.test(h) || H.has("x-shopid")], ["Webflow", (h) => /webflow\.(js|com)|data-wf-page/.test(h)],
  ["Squarespace", (h) => /squarespace\.com|static1\.squarespace/.test(h)], ["Wix", (h) => /wixstatic\.com|_wixCIDX/.test(h)], ["Framer", (h) => /framerusercontent\.com|framer\.com\/m\//.test(h)], ["Ghost", (h) => /ghost-(sdk|portal)|content="Ghost/.test(h)],
  ["HubSpot", (h) => /js\.hs-scripts\.com|hs-analytics|hsforms/.test(h)], ["Google Analytics", (h) => /googletagmanager\.com\/gtag|google-analytics\.com|gtag\(/.test(h)], ["Google Tag Manager", (h) => /googletagmanager\.com\/gtm\.js|GTM-[A-Z0-9]+/.test(h)],
  ["Segment", (h) => /cdn\.segment\.com|analytics\.load\(/.test(h)], ["Intercom", (h) => /widget\.intercom\.io|intercomSettings/.test(h)], ["Drift", (h) => /js\.driftt\.com/.test(h)], ["Zendesk Widget", (h) => /static\.zdassets\.com/.test(h)],
  ["Hotjar", (h) => /static\.hotjar\.com/.test(h)], ["Mixpanel", (h) => /cdn\.mxpnl\.com|mixpanel/.test(h)], ["Amplitude", (h) => /cdn\.amplitude\.com/.test(h)], ["PostHog", (h) => /posthog/.test(h)],
  ["Stripe.js", (h) => /js\.stripe\.com/.test(h)], ["reCAPTCHA", (h) => /recaptcha/.test(h)], ["Cloudflare Turnstile", (h) => /challenges\.cloudflare\.com\/turnstile/.test(h)], ["Facebook Pixel", (h) => /connect\.facebook\.net\/.*fbevents/.test(h)],
  ["LinkedIn Insight", (h) => /snap\.licdn\.com/.test(h)], ["Crisp", (h) => /client\.crisp\.chat/.test(h)], ["Klaviyo", (h) => /klaviyo\.com/.test(h)], ["OneTrust", (h) => /cdn\.cookielaw\.org|onetrust/.test(h)], ["Cookiebot", (h) => /consent\.cookiebot\.com/.test(h)],
  ["jQuery", (h) => /jquery(\.min)?\.js|jquery-\d/.test(h)], ["Bootstrap", (h) => /bootstrap(\.min)?\.(css|js)/.test(h)], ["Tailwind CSS", (h) => /class="[^"]*\b(?:px|py|mx|my)-\d+\b[^"]*\b(?:text|bg)-(?:gray|slate|zinc|neutral)-\d{2,3}\b/.test(h)],
];
const SOCIAL = [
  ["twitter", /https?:\/\/(?:www\.)?(?:twitter|x)\.com\/(?!share|intent|home|search)([A-Za-z0-9_]{1,15})(?=["'?/#\s<]|$)/], ["linkedin", /https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/(company|in|school)\/([A-Za-z0-9_\-%.]+)/],
  ["github", /https?:\/\/(?:www\.)?github\.com\/([A-Za-z0-9-]{1,39})(?=["'?/#\s<]|$)/], ["facebook", /https?:\/\/(?:www\.)?facebook\.com\/(?!sharer|share|dialog|plugins|tr\b)([A-Za-z0-9.\-]+)/],
  ["instagram", /https?:\/\/(?:www\.)?instagram\.com\/([A-Za-z0-9_.]+)/], ["youtube", /https?:\/\/(?:www\.)?youtube\.com\/(?:@|c\/|channel\/|user\/)([A-Za-z0-9_\-]+)/], ["tiktok", /https?:\/\/(?:www\.)?tiktok\.com\/@([A-Za-z0-9_.]+)/],
  ["bluesky", /https?:\/\/bsky\.app\/profile\/([A-Za-z0-9.\-:]+)/], ["discord", /https?:\/\/(?:www\.)?discord\.(?:gg|com\/invite)\/([A-Za-z0-9]+)/], ["crunchbase", /https?:\/\/(?:www\.)?crunchbase\.com\/organization\/([a-z0-9\-]+)/],
];

// only role/shared mailboxes are reported, never personal addresses
const ROLE_RE = /^(info|hello|contact|support|help|sales|press|media|pr|partners|partnerships|security|privacy|legal|careers|jobs|billing|team|office|enquiries|inquiries|marketing|investors|ir|abuse|feedback|service|customerservice|care|admin|webmaster)$/i;
const uniq = (a) => [...new Set(a)];
function rootDomain(d) { return d.replace(/^www\./, ""); }

export async function domainIntel(input) {
  let d = String(input || "").trim().toLowerCase();
  if (/^https?:\/\//.test(d)) { try { d = new URL(d).hostname; } catch {} }
  d = d.split("/")[0].replace(/\.$/, "");
  if (d.includes("@")) d = d.split("@").pop();
  if (!validDomain(d)) return { error: "Provide ?domain= (e.g. stripe.com, or a URL or email)", code: 400 };
  const root = rootDomain(d);
  const [mx, txt, dmarc, a, page] = await Promise.all([
    resolve(root, "MX").catch(() => null), resolve(root, "TXT").catch(() => null), resolve(`_dmarc.${root}`, "TXT").catch(() => null), resolve(root, "A").catch(() => null),
    fetchHome(root),
  ]);
  const exists = mx?.status === 0 || a?.status === 0;
  const mxHosts = (mx?.records || []).map((r) => (r.data.split(" ")[1] || "").replace(/\.$/, "").toLowerCase()).filter(Boolean);
  const emailProvider = uniq(mxHosts.flatMap((h) => MX_PROVIDERS.filter(([re]) => re.test(h)).map(([, n]) => n)));
  const txts = (txt?.records || []).map((r) => r.data);
  const spf = txts.find((t) => /^v=spf1/i.test(t)) || null;
  const spfServices = spf ? uniq(SPF_SERVICES.filter(([re]) => re.test(spf)).map(([, n]) => n)) : [];
  const verified = uniq(txts.flatMap((t) => TXT_VERIFICATIONS.filter(([re]) => re.test(t)).map(([, n]) => n)));
  const dm = (dmarc?.records || []).map((r) => r.data).find((t) => /^v=DMARC1/i.test(t)) || null;

  let site = null, tech = [], social = {}, emails = [];
  if (page?.html != null) {
    const m = meta(page.html, page.url);
    const H = page.headers;
    tech = TECH.filter(([, fn]) => { try { return fn(page.html, H); } catch { return false; } }).map(([n]) => n);
    for (const [k, re] of SOCIAL) {
      const g = new RegExp(re.source, "g"); const found = [];
      let x; while ((x = g.exec(page.html)) && found.length < 3) found.push(x[0].replace(/["'<\s].*$/, ""));
      if (found.length) { const brand = root.split(".")[0]; social[k] = found.find((f) => f.toLowerCase().includes(brand)) || found[0]; }
    }
    emails = uniq((page.html.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || []).filter((e) => e.toLowerCase().endsWith(root) && !/\.(png|jpg|svg|webp)$/i.test(e) && ROLE_RE.test(e.split("@")[0]))).slice(0, 5);
    site = { url: page.url, status: page.status, title: m.title ?? null, description: m.description ?? null, site_name: m.og?.site_name ?? m.og?.["og:site_name"] ?? null, language: (page.html.match(/<html[^>]*\blang=["']?([a-zA-Z-]+)/) || [])[1] || null, favicon: m.favicon ?? null, image: m.og?.image ?? m.og?.["og:image"] ?? null };
  }
  // public company match (exact ticker-map title vs site name is too fuzzy; only report a hint via site name)
  return {
    domain: root, exists,
    website: site,
    website_error: page?.error || null,
    social,
    role_emails_on_homepage: emails,
    email: { provider: emailProvider, mx: mxHosts.slice(0, 5), spf, dmarc: dm, dmarc_policy: dm ? (dm.match(/\bp=(\w+)/i) || [])[1] || null : null, sending_services_from_spf: spfServices },
    saas_detected_from_dns: verified,
    tech_stack: tech,
    notes: "Inferred from public DNS records and the public homepage only. SaaS from DNS verification records means the domain was verified with that vendor at some point, not necessarily current use.",
  };
}

async function fetchHome(root) {
  for (const host of [root, `www.${root}`]) {
    try {
      const r = await fetch(`https://${host}/`, { redirect: "follow", headers: { "user-agent": UA, accept: "text/html,*/*;q=0.8" }, cf: { cacheTtl: 3600 } });
      let html = await r.text();
      if (html.length > 1_500_000) html = html.slice(0, 1_500_000);
      return { url: r.url, status: r.status, headers: r.headers, html };
    } catch (e) { var err = String(e.message || e); }
  }
  return { error: err || "fetch failed" };
}
