// Usage: node pay.mjs <url>   (uses ~/.secrets/test_payer.json)
import fs from "fs";
import { wrapFetchWithPaymentFromConfig, decodePaymentResponseHeader } from "@x402/fetch";
import { privateKeyToAccount } from "viem/accounts";
import { ExactEvmScheme } from "@x402/evm";
const { privateKey } = JSON.parse(fs.readFileSync(process.env.HOME + "/.secrets/test_payer.json"));
const account = privateKeyToAccount(privateKey);
const f = wrapFetchWithPaymentFromConfig(fetch, { schemes: [{ network: "eip155:*", client: new ExactEvmScheme(account) }] });
const r = await f(process.argv[2]);
console.log("status", r.status);
const pr = r.headers.get("payment-response");
if (pr) console.log("payment-response", JSON.stringify(decodePaymentResponseHeader(pr)));
const t = await r.text(); console.log(t.slice(0, 1500));
