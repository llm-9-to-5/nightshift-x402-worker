// AWS Marketplace Agentic Commerce (x402 "exact" on network "aws:base", paid in USD on the buyer's AWS bill).
// Enabled only when the worker has AWSMP_PRODUCT_ID (prod-...) and AWSMP_QUOTE_KEY_PEM (secret) set.
// Key source on the listing: JWKS URL = <AWSMP_SERVICE_URL>/.well-known/jwks.json (served below).
import { x402Facilitator } from "@x402/core/facilitator";
import {
  AgenticCommerceVerifier,
  ExactAgenticCommerceFacilitatorScheme,
  InProcessFacilitatorClient,
  LocalQuoteSigner,
  registerExactAgenticCommerceServer,
  jwksDocument,
} from "@aws/fiat-extension-for-x402";

export const AWSMP_NETWORK = "aws:base";

export function awsmpEnabled(env) {
  return !!(env?.AWSMP_PRODUCT_ID && env?.AWSMP_QUOTE_KEY_PEM && env?.AWSMP_SERVICE_URL);
}

let cached = null; // signer/verifier are stateless and safe to reuse across requests
function parts(env) {
  if (cached && cached.pem === env.AWSMP_QUOTE_KEY_PEM) return cached;
  const signer = LocalQuoteSigner.fromPem(env.AWSMP_QUOTE_KEY_PEM, { kid: env.AWSMP_KID || "nightshift-quote-1", serviceUrl: env.AWSMP_SERVICE_URL });
  const verifier = new AgenticCommerceVerifier({ sellerKeyResolver: { type: "jwks", jwksUrl: env.AWSMP_JWKS_BASE || env.AWSMP_SERVICE_URL } });
  cached = { pem: env.AWSMP_QUOTE_KEY_PEM, signer, verifier };
  return cached;
}

export function jwks(env) {
  return jwksDocument(parts(env).signer.publicJwk);
}

// KV-backed stores. KV is eventually consistent, so this is best-effort replay protection
// (it blocks sequential replays; two simultaneous requests in different regions could both pass).
function kvStore(kv, prefix) {
  return {
    async has(id) { return !!(await kv.get(prefix + id)); },
    async add(id, expiresAt) { await kv.put(prefix + id, "1", { expirationTtl: Math.max(60, Math.ceil(expiresAt - Date.now() / 1000) + 5) }); },
  };
}

export function facilitatorClient(env) {
  const { verifier } = parts(env);
  const fac = new x402Facilitator().register(AWSMP_NETWORK, new ExactAgenticCommerceFacilitatorScheme({ verifier }));
  return new InProcessFacilitatorClient(fac);
}

const claimsOf = (jwt) => JSON.parse(atob(jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));

export function addToServer(server, env) {
  const { signer } = parts(env);
  const dpopNonceStore = env.STATS ? kvStore(env.STATS, "dpop:") : undefined;
  registerExactAgenticCommerceServer(server, { signer, ...(dpopNonceStore ? { dpopNonceStore } : {}) });
  if (env.STATS) {
    const store = kvStore(env.STATS, "awspay:");
    server.onAfterVerify(async ({ paymentPayload, requirements, result }) => {
      if (requirements.network !== AWSMP_NETWORK || !result.isValid) return undefined;
      const token = claimsOf(paymentPayload.payload.paymentToken);
      const quote = claimsOf(token.quote_token);
      const id = String(token.payment_id);
      if (await store.has(id)) return { abort: true, reason: "payment_replayed", message: "Payment already used" };
      await store.add(id, Math.max(Number(token.exp), Number(quote.exp)) + 60);
      return undefined;
    });
  }
  return server;
}

export function option(env, price, description) {
  return { scheme: "exact", network: AWSMP_NETWORK, payTo: env.AWSMP_PRODUCT_ID, price, extra: { description } };
}
