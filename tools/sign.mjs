// MEASURE_SIGNING_KEY="<pkcs8 PEM>" node sign.mjs evidence/latest
// Signs every record in DIR (ecosystem.json, sellers/*.json) for the x402 sales-integrity profile (x402#4127):
//   payload   = the record WITHOUT its "verification" block, with publisher.key_id set to KID
//   bytes     = RFC 8785 JCS of payload (sorted keys, no whitespace, ECMAScript number formatting)
//   record.verification = { verify_endpoint, certifier_jwks, payload_sha256: sha256(bytes) }
//   <file>.sig.json     = { kid, alg: "EdDSA", payload_sha256: "sha256:<hex>", signature: "ed25519:<base64>" } (detached)
// Verify: GET https://nightshift-agent.solaris-organization.workers.dev/verify/evidence/<payTo|ecosystem>
import fs from "fs"; import crypto from "crypto"; import path from "path";
export const KID = "nightshift-measure-1";
const ORIGIN = "https://nightshift-agent.solaris-organization.workers.dev";
export function jcs(v) {
  if (v === null || typeof v !== "object") { if (typeof v === "number" && !Number.isFinite(v)) throw new Error("non-finite"); return JSON.stringify(v); }
  if (Array.isArray(v)) return "[" + v.map(jcs).join(",") + "]";
  return "{" + Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => JSON.stringify(k) + ":" + jcs(v[k])).join(",") + "}";
}
const dir = process.argv[2];
const key = crypto.createPrivateKey(process.env.MEASURE_SIGNING_KEY);
const files = [path.join(dir, "ecosystem.json"), ...fs.readdirSync(path.join(dir, "sellers")).filter((f) => f.endsWith(".json") && !f.endsWith(".sig.json")).map((f) => path.join(dir, "sellers", f))].filter((f) => fs.existsSync(f));
let n = 0;
for (const f of files) {
  const rec = JSON.parse(fs.readFileSync(f, "utf8")); delete rec.verification;
  rec.publisher = { ...rec.publisher, key_id: KID };
  const bytes = Buffer.from(jcs(rec), "utf8");
  const h = crypto.createHash("sha256").update(bytes).digest("hex");
  const id = f.endsWith("ecosystem.json") ? "ecosystem" : path.basename(f, ".json");
  rec.verification = { verify_endpoint: `${ORIGIN}/verify/evidence/${id}`, certifier_jwks: `${ORIGIN}/certifier/jwks.json`, payload_sha256: h };
  fs.writeFileSync(f, JSON.stringify(rec, null, 1));
  const sig = crypto.sign(null, bytes, key).toString("base64");
  fs.writeFileSync(f.replace(/\.json$/, ".sig.json"), JSON.stringify({ kid: KID, alg: "EdDSA", canonicalization: "RFC 8785 JCS of the record without its verification block", payload_sha256: "sha256:" + h, signature: "ed25519:" + sig }));
  n++;
}
console.log("signed", n, "records with", KID);
