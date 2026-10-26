"""
Export the road networks + benchmark for the web frontend.

Executes the notebook's own code (settings, data, Network, solve, benchmark) so the
frontend uses exactly the same edge costs. Writes web/data.json and
scripts/reference_trips.json (used by verify_js.js to check the JS port).

Run: python scripts/export_network.py [csv_path]
"""
import json, random, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
csv = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "sustainable_vehicle_routing.csv"
sys.argv = [sys.argv[0], "--no-show"]                    # notebook switches matplotlib to Agg

nb = json.loads((ROOT / "Traffic_route_optimization.ipynb").read_text())
ns = {"__name__": "nb"}
for cell in nb["cells"]:
    src = "".join(cell["source"])
    if cell["cell_type"] == "code" and "def main(" not in src and "main()" not in src:
        exec(src, ns)

df = ns["load_data"](csv)
bounds = ns["add_cells"](df)
Network, solve, GRID = ns["Network"], ns["solve"], ns["GRID"]
nets = {"All traffic": Network(df, bounds)}
for lvl in ("Low", "Medium", "High"):
    nets[f"{lvl} traffic"] = Network(df[df.traffic_density == lvl], bounds)

r = lambda x, n=4: round(float(x), n)
out = {"grid": GRID, "bounds": [r(b, 6) for b in bounds], "algos": ns["ALGOS"],
       "colors": ns["COL"], "scenarios": {}}
for name, net in nets.items():
    cell = net.cellinfo
    out["scenarios"][name] = {
        "vmax": net.vmax,
        "pos": [[x, y] for x, y in (net.pos[i] for i in range(GRID * GRID))],
        # adjacency in the notebook's dict order so tie-breaking matches exactly
        "adj": [[[v, e["km"], e["min"], e["co2"], e["fuel"], e["f"]] for v, e in net.adj[u].items()]
                for u in range(GRID * GRID)],
        "cells": {k: [[r(x) for x in row] for row in cell[k]] for k in ("speed", "pen", "co2", "fuel")},
    }
    out["scenarios"][name]["demo"] = list(ns["pick_demo_pair"](net))

bm = ns["benchmark"](nets)
table = bm.groupby(["scenario", "algorithm"]).agg(
    minutes=("minutes", "mean"), km=("km", "mean"), co2_g=("co2_g", "mean"), fuel_l=("fuel_l", "mean"),
    nodes=("nodes_expanded", "mean"), runtime_ms=("runtime_ms", "mean"),
    optimal_pct=("optimal", lambda s: 100 * s.mean())).round(3).reset_index()
out["benchmark"] = {"trials": ns["TRIALS"], "rows": table.to_dict("records")}
(ROOT / "web" / "data.json").write_text(json.dumps(out, separators=(",", ":")))

# reference trips for verifying the JS port (blocked roads included)
rng, ref = random.Random(1), []
for name, net in nets.items():
    for _ in range(60):
        s, d = rng.sample(range(GRID * GRID), 2)
        blocked = set()
        if rng.random() < .5:
            p = solve(net, s, d, "A*")["path"]
            for a, b in zip(p, p[1:]):
                if rng.random() < .3:
                    blocked.add((min(a, b), max(a, b)))
        for a in ns["ALGOS"]:
            res = solve(net, s, d, a, frozenset(blocked))
            ref.append({"scenario": name, "src": s, "dst": d, "algo": a, "blocked": sorted(blocked),
                        "result": None if res is None else {k: res[k] for k in ("path", "expanded", "min")}})
(ROOT / "scripts" / "reference_trips.json").write_text(json.dumps(ref))
print("wrote web/data.json and scripts/reference_trips.json")
print(table[table.scenario == "All traffic"].to_string(index=False))
