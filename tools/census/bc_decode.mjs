import fs from "fs";
import * as X from "/home/agent/projects/agent-worker/node_modules/@x402/extensions/dist/esm/index.mjs";
const d = JSON.parse(fs.readFileSync(process.argv[2]));
const out = d.sample.map((r) => { let p = null; if (r.tail) { try { p = X.parseBuilderCodeSuffixFromCalldata("0x" + r.tail.replace(/^0x/, "")); } catch (e) { p = { err: String(e.message) }; } } return { ...r, parsed: p }; });
fs.writeFileSync(process.argv[3], JSON.stringify(out));
console.log(JSON.stringify(out.filter((o) => o.parsed).slice(0, 3).map((o) => o.parsed)));
