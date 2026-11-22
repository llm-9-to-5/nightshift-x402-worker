// node tools/census/to_hist.mjs pulse_YYYY-MM-DD.json ... -> hist_YYYY-MM-DD.json {day, summary, payees}
// Compact history record for KV key pulse:hist:<day> (no payer maps, so it is cheap to load).
import fs from "fs";
import { summarize } from "../../src/pulse.js";
import { CENSUS } from "../../src/census.js";
for (const fn of process.argv.slice(2)) {
  const D = JSON.parse(fs.readFileSync(fn, "utf8"));
  const summary = summarize(D, CENSUS);
  const payees = Object.fromEntries(Object.entries(D.payees).map(([a, [n, u, pc]]) => [a, [n, +u.toFixed(4), pc]]));
  const out = fn.replace(/pulse_/, "hist_");
  fs.writeFileSync(out, JSON.stringify({ day: D.day, source: D.source || "pulse", summary, payees }));
  console.log(out, summary.payments, summary.usd, summary.payers, fs.statSync(out).size);
}
