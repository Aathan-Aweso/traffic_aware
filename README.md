# Traffic-Aware Route Optimization (A*)

Compares **A\***, **Dijkstra**, **BFS** and **Greedy best-first** search on a 12 × 12 junction road network whose
edge costs (travel time, fuel, CO₂) are learned from vehicle telemetry
(`sustainable_vehicle_routing.csv`: GPS, speed, traffic density, road and weather conditions).

- `Traffic_route_optimization.ipynb`: the analysis, algorithms, benchmark and charts (`*.png`, `benchmark_results.csv`, `summary.txt`)
- `web/`: static interactive frontend (deployed on Vercel)
- `scripts/`: dataset generation, network export and a check that the JS port matches Python

## Web app

Pick a traffic scenario, click two junctions, and watch each algorithm search. Switch to **Block roads** to close
roads and see A* re-route. A benchmark table (300 random trips per scenario, computed by the notebook) sits underneath.

The page is fully static: the notebook's `Network` is exported to `web/data.json`, and `web/algo.js` is a line-for-line
port of `solve()` that runs in the browser.

### Rebuild the data

```bash
pip install pandas numpy matplotlib
python scripts/make_synthetic_dataset.py   # only if you don't have the real CSV
python scripts/export_network.py           # -> web/data.json (+ scripts/reference_trips.json)
node scripts/verify_js.js                  # JS results must match Python exactly
```

> The deployed demo uses a **synthetic** dataset (`scripts/make_synthetic_dataset.py`) with the same columns as the
> original. Drop in the real `sustainable_vehicle_routing.csv` and re-run the export to use it.

### Run locally / deploy

```bash
cd web && python3 -m http.server 8000      # http://localhost:8000
npx vercel --prod                          # from the repo root; vercel.json serves web/
```

Or import the GitHub repo in the Vercel dashboard. No build settings are needed; `vercel.json` handles them.
