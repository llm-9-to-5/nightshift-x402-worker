import CITIES from "./cities.js";
import ZIPS from "./zips.js"; // US ZIP -> [place, state, lat, lon] (GeoNames postal codes, CC BY 4.0)
// CITIES rows: [name, "alt1|alt2"|0 (normalized alt names, big cities only), countryCode, admin1Name, admin1Code, lat, lon, population, timezone], sorted by population desc.

const UA = "NightshiftAgent/0.2 (AI-run weather API; https://nightshift-agent.solaris-organization.workers.dev)";
const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

const COUNTRY_ALIASES = { usa: "US", "united states": "US", us: "US", america: "US", uk: "GB", "united kingdom": "GB", england: "GB", scotland: "GB", wales: "GB", britain: "GB", "great britain": "GB", germany: "DE", deutschland: "DE", france: "FR", spain: "ES", italy: "IT", canada: "CA", australia: "AU", japan: "JP", china: "CN", india: "IN", brazil: "BR", mexico: "MX", russia: "RU", netherlands: "NL", "south korea": "KR", korea: "KR", ireland: "IE", "new zealand": "NZ", "south africa": "ZA", uae: "AE", "united arab emirates": "AE", switzerland: "CH", sweden: "SE", norway: "NO", denmark: "DK", finland: "FI", poland: "PL", portugal: "PT", turkey: "TR", argentina: "AR", singapore: "SG", israel: "IL", egypt: "EG", nigeria: "NG", kenya: "KE", indonesia: "ID", philippines: "PH", vietnam: "VN", thailand: "TH", ukraine: "UA", austria: "AT", belgium: "BE", greece: "GR", czechia: "CZ", "czech republic": "CZ", kazakhstan: "KZ" };

function toRad(d) { return (d * Math.PI) / 180; }
function distKm(a, b, c, d) {
  const x = Math.sin(toRad(c - a) / 2) ** 2 + Math.cos(toRad(a)) * Math.cos(toRad(c)) * Math.sin(toRad(d - b) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(x));
}
const place = (r, extra = {}) => ({ name: r[0], country: r[2], region: r[3] || null, lat: r[5], lon: r[6], population: r[7], timezone: r[8], ...extra });

export function geocode(q) {
  const parts = q.split(",").map((s) => norm(s)).filter(Boolean);
  if (!parts.length) return null;
  const name = parts[0];
  const qual = parts.slice(1);
  const fits = (r) => qual.every((t) => {
    const cc = r[2].toLowerCase();
    return t === cc || COUNTRY_ALIASES[t] === r[2] || norm(r[3]) === t || r[4].toLowerCase() === t;
  });
  let best = null;
  for (const r of CITIES) {
    if (norm(r[0]) === name || (r[1] && r[1].split("|").includes(name))) {
      if (fits(r)) { best = r; break; } // sorted by population
    }
  }
  if (!best) {
    for (const r of CITIES) if (norm(r[0]).startsWith(name) && fits(r)) { best = r; break; }
  }
  return best ? place(best, { matched: "city" }) : null;
}

export function nearest(lat, lon) {
  let best = null, bd = Infinity;
  for (const r of CITIES) {
    if (Math.abs(r[5] - lat) > 3) continue;
    const d = distKm(lat, lon, r[5], r[6]);
    if (d < bd) { bd = d; best = r; }
  }
  return best ? { ...place(best), distance_km: Math.round(bd * 10) / 10 } : null;
}

function tzFromLon(lon) { const h = Math.round(lon / 15); return h === 0 ? "UTC" : `Etc/GMT${h > 0 ? "-" : "+"}${Math.abs(h)}`; }
const COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
const compass = (deg) => (deg == null ? null : COMPASS[Math.round(deg / 22.5) % 16]);
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
const cToF = (c) => (c == null ? null : r1(c * 9 / 5 + 32));
function feelsLike(t, rh, w) {
  if (t == null) return null;
  const kph = (w ?? 0) * 3.6;
  if (t <= 10 && kph > 4.8) return r1(13.12 + 0.6215 * t - 11.37 * kph ** 0.16 + 0.3965 * t * kph ** 0.16);
  if (t >= 27 && rh != null) {
    const f = t * 9 / 5 + 32;
    const hi = -42.379 + 2.04901523 * f + 10.14333127 * rh - 0.22475541 * f * rh - 0.00683783 * f * f - 0.05481717 * rh * rh + 0.00122874 * f * f * rh + 0.00085282 * f * rh * rh - 0.00000199 * f * f * rh * rh;
    return r1((hi - 32) * 5 / 9);
  }
  return r1(t);
}
function condition(sym) {
  if (!sym) return null;
  const s = sym.replace(/_(day|night|polartwilight)$/, "");
  return s.replace(/andthunder/, " and thunder").replace(/^light/, "light ").replace(/^heavy/, "heavy ").replace(/rainshowers/, "rain showers").replace(/snowshowers/, "snow showers").replace(/sleetshowers/, "sleet showers").replace(/partlycloudy/, "partly cloudy").replace(/clearsky/, "clear sky").replace(/^fair$/, "fair").replace(/\s+/g, " ").trim();
}

async function usAlerts(lat, lon) {
  try {
    const r = await fetch(`https://api.weather.gov/alerts/active?point=${lat},${lon}`, { headers: { "user-agent": UA, accept: "application/geo+json" }, cf: { cacheTtl: 300 } });
    if (!r.ok) return [];
    const j = await r.json();
    return (j.features || []).slice(0, 10).map((f) => ({ event: f.properties.event, severity: f.properties.severity, urgency: f.properties.urgency, headline: f.properties.headline, onset: f.properties.onset, expires: f.properties.expires, area: f.properties.areaDesc, instruction: f.properties.instruction?.slice(0, 600) || null }));
  } catch { return []; }
}

export async function weather({ q, lat, lon, zip, days = 7, hours = 24 }) {
  let loc;
  const z = String(zip || q || "").trim().match(/^(\d{5})(?:-\d{4})?(?:\s*,?\s*(?:us|usa))?$/i);
  if (z && (lat == null || lat === "")) {
    const e = ZIPS[z[1]];
    if (!e) return { error: `Unknown US ZIP code ${z[1]}`, code: 404 };
    const n = nearest(e[2], e[3]);
    loc = { name: e[0], country: "US", region: e[1], zip: z[1], lat: e[2], lon: e[3], timezone: n?.timezone || tzFromLon(e[3]), matched: "us_zip" };
  } else
  if (loc) {} else if (lat != null && lon != null && lat !== "" && lon !== "") {
    const la = Number(lat), lo = Number(lon);
    if (!Number.isFinite(la) || !Number.isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) return { error: "lat must be -90..90 and lon -180..180", code: 400 };
    const n = nearest(la, lo);
    loc = { name: n && n.distance_km < 50 ? n.name : null, country: n?.country ?? null, region: n && n.distance_km < 50 ? n.region : null, lat: la, lon: lo, timezone: n && n.distance_km < 500 ? n.timezone : tzFromLon(lo), nearest_city: n ? { name: n.name, country: n.country, distance_km: n.distance_km } : null, matched: "coordinates" };
  } else if (q) {
    loc = geocode(q);
    if (!loc) return { error: `Could not find a city matching "${q}". Try "City, Country" (e.g. "Springfield, IL, US") or pass lat & lon.`, code: 404 };
  } else return { error: "Provide ?q=City[,Region][,Country] or ?lat=&lon=", code: 400 };

  const la4 = Math.round(loc.lat * 10000) / 10000, lo4 = Math.round(loc.lon * 10000) / 10000;
  const isUS = loc.country === "US" || (loc.nearest_city?.country === "US");
  const [fr, alerts] = await Promise.all([
    fetch(`https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${la4}&lon=${lo4}`, { headers: { "user-agent": UA }, cf: { cacheTtl: 900, cacheEverything: true } }),
    isUS ? usAlerts(la4, lo4) : Promise.resolve(null),
  ]);
  if (!fr.ok) return { error: `Upstream forecast unavailable (${fr.status}). You were not charged if this returns non-2xx.`, code: 502 };
  const fj = await fr.json();
  const ts = fj.properties?.timeseries || [];
  const now = Date.now();
  let i0 = ts.findIndex((t) => Date.parse(t.time) + 3600e3 > now);
  if (i0 < 0) i0 = 0;
  const pt = (t) => {
    const d = t.data.instant.details;
    const n1 = t.data.next_1_hours, n6 = t.data.next_6_hours;
    const sym = (n1 || n6 || t.data.next_12_hours)?.summary?.symbol_code;
    return {
      time: t.time, temp_c: r1(d.air_temperature), temp_f: cToF(d.air_temperature), feels_like_c: feelsLike(d.air_temperature, d.relative_humidity, d.wind_speed),
      humidity_pct: r1(d.relative_humidity), wind_ms: r1(d.wind_speed), wind_kph: r1(d.wind_speed * 3.6), wind_mph: r1(d.wind_speed * 2.23694), wind_dir_deg: r1(d.wind_from_direction), wind_dir: compass(d.wind_from_direction),
      pressure_hpa: r1(d.air_pressure_at_sea_level), cloud_pct: r1(d.cloud_area_fraction), condition: condition(sym), symbol: sym || null,
      precip_mm: n1 ? r1(n1.details?.precipitation_amount) : null,
    };
  };
  const cur = ts[i0] ? pt(ts[i0]) : null;
  if (cur) { cur.feels_like_f = cToF(cur.feels_like_c); cur.precip_next_6h_mm = r1(ts[i0].data.next_6_hours?.details?.precipitation_amount); }
  const H = Math.max(0, Math.min(48, Number(hours) || 0));
  const hourly = ts.slice(i0, i0 + H).filter((t) => t.data.next_1_hours).map(pt);

  // Daily aggregation in local time
  let fmt;
  try { fmt = new Intl.DateTimeFormat("en-CA", { timeZone: loc.timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false }); }
  catch { loc.timezone = "UTC"; fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false }); }
  const byDay = new Map();
  for (const t of ts) {
    const parts = Object.fromEntries(fmt.formatToParts(new Date(t.time)).map((p) => [p.type, p.value]));
    const date = `${parts.year}-${parts.month}-${parts.day}`, hr = Number(parts.hour) % 24;
    let d = byDay.get(date);
    if (!d) byDay.set(date, (d = { date, min_c: Infinity, max_c: -Infinity, precip_mm: 0, symbols: {}, wind_max_ms: 0, n: 0 }));
    const det = t.data.instant.details;
    d.min_c = Math.min(d.min_c, det.air_temperature); d.max_c = Math.max(d.max_c, det.air_temperature);
    d.wind_max_ms = Math.max(d.wind_max_ms, det.wind_speed ?? 0); d.n++;
    // precip: use 1h if present else 6h buckets at 00/06/12/18 local-ish (avoid double counting)
    if (t.data.next_1_hours) d.precip_mm += t.data.next_1_hours.details?.precipitation_amount ?? 0;
    else if (t.data.next_6_hours) d.precip_mm += t.data.next_6_hours.details?.precipitation_amount ?? 0;
    const s = (t.data.next_6_hours || t.data.next_1_hours)?.summary?.symbol_code;
    if (s && hr >= 6 && hr <= 18) { const k = s.replace(/_(day|night|polartwilight)$/, ""); d.symbols[k] = (d.symbols[k] || 0) + 1; }
  }
  const D = Math.max(1, Math.min(9, Number(days) || 7));
  const daily = [...byDay.values()].filter((d) => d.n >= 3).slice(0, D).map((d) => {
    const top = Object.entries(d.symbols).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    return { date: d.date, min_c: r1(d.min_c), max_c: r1(d.max_c), min_f: cToF(d.min_c), max_f: cToF(d.max_c), precip_mm: r1(d.precip_mm), wind_max_ms: r1(d.wind_max_ms), condition: condition(top), symbol: top };
  });

  return {
    location: loc,
    current: cur,
    hourly,
    daily,
    alerts: isUS ? alerts : undefined,
    alerts_note: isUS ? "US National Weather Service active alerts for this point" : "Official alerts included for US locations only",
    updated_at: fj.properties?.meta?.updated_at ?? null,
    source: "Forecast data: MET Norway (api.met.no), CC BY 4.0. Alerts: US NWS (public domain). Geocoding: GeoNames, CC BY 4.0.",
  };
}
