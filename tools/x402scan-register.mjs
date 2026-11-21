// Register every route of your origin on x402scan.com (reads your /openapi.json).
// Usage: SIWX_PRIVATE_KEY=0x... node tools/x402scan-register.mjs https://www.x402scan.com/api/x402/registry/register-origin '{"origin":"https://your.api"}'
import fs from "fs";
import { createSIWxPayload, encodeSIWxHeader } from "@x402/extensions/sign-in-with-x";
import { privateKeyToAccount } from "viem/accounts";
// Any EVM key works: it only signs a Sign-In-With-X message (no funds needed).
const privateKey = process.env.SIWX_PRIVATE_KEY || JSON.parse(fs.readFileSync(process.env.HOME + "/.secrets/test_payer.json")).privateKey;
const signer = privateKeyToAccount(privateKey);
const [url, body] = process.argv.slice(2);
const init = { method: "POST", headers: { "content-type": "application/json" }, body };
let r = await fetch(url, init);
if (r.status === 402) {
  const ch = await r.json();
  const ext = ch.extensions["sign-in-with-x"];
  const info = { ...ext.info, ...ext.supportedChains[0] };
  const p = await createSIWxPayload(info, signer, r.url || url);
  r = await fetch(url, { ...init, headers: { ...init.headers, "SIGN-IN-WITH-X": encodeSIWxHeader(p) } });
}
console.log(r.status, (await r.text()).slice(0, 3000));
