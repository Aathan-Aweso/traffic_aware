// Checks web/algo.js against the Python solve() results in reference_trips.json.
// Run: node scripts/verify_js.js
const path = require("path");
const { makeNet, solve, key } = require(path.join(__dirname, "../web/algo.js"));
const data = require(path.join(__dirname, "../web/data.json"));
const ref = require(path.join(__dirname, "reference_trips.json"));

const nets = Object.fromEntries(Object.entries(data.scenarios).map(([k, sc]) => [k, makeNet(sc)]));
let bad = 0;
for (const t of ref) {
  const blocked = new Set(t.blocked.map(([a, b]) => key(a, b)));
  const r = solve(nets[t.scenario], t.src, t.dst, t.algo, blocked);
  const ok = t.result === null ? r === null
    : r && Math.abs(r.min - t.result.min) < 1e-6 && r.expanded === t.result.expanded
      && r.path.join() === t.result.path.join();
  if (!ok) { bad++; if (bad <= 5) console.log("MISMATCH", t.scenario, t.algo, t.src, t.dst, t.result, r && { path: r.path, expanded: r.expanded, min: r.min }); }
}
console.log(`${ref.length - bad}/${ref.length} trips match Python exactly`);
process.exit(bad ? 1 : 0);
