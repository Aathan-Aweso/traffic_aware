# Traffic-Aware Route Planning using A* Search

AI mini project. Finds the minimum travel-time route between two road junctions with **A\***, using
**Dijkstra** as the optimality baseline. Includes a reproducible synthetic dataset, a command-line evaluation, a Flask
API and a browser interface. The full write-up is in `doc/Traffic_Aware_AStar_Project_Report.docx`.

## Model

- Road network: weighted, undirected graph. `data/nodes.csv` holds junction ids with x/y coordinates in km;
  `data/edges.csv` holds road endpoints, `distance_km`, `traffic_factor` and a `blocked` flag.
- Edge cost: `cost(e) = d / 60 × 60 × t = d × t` minutes (60 km/h reference speed), where
  `t = traffic_factor × scenario multiplier ≥ 1`. Blocked roads are never inserted into the graph.
- Heuristic: straight-line distance to the goal at 60 km/h. This is admissible and consistent as long as every road is
  at least as long as the straight line between its junctions and `t ≥ 1`. The supplied data satisfies both.

| Scenario  | Multiplier | Notes                       |
|-----------|-----------:|-----------------------------|
| night     | 1.0        |                             |
| offpeak   | 1.25       |                             |
| peak      | 2.0        |                             |
| roadblock | 1.25       | B–E closed to test rerouting |

## Run

```bash
pip install -r requirements.txt
python traffic_astar.py        # A* vs Dijkstra table for every scenario + optimality assertion
python -m unittest -v          # report section 5.2 test cases + API tests
python app.py                  # http://127.0.0.1:5000
```

On macOS, port 5000 is often taken by AirPlay Receiver. If it is, use `PORT=5001 python app.py`.

In the browser, pick the start, destination, scenario and algorithm (or compare both), then click **Find Route**. You
can also:

- click junctions on the map to choose the start and destination
- click roads to close or reopen them
- replay the search step by step to see the order junctions were expanded
- show h(n) on every junction
- switch road labels between km and minutes
- compare every scenario for the chosen trip in one table

## API

```http
POST /api/route
{"start": "A", "goal": "F", "scenario": "peak", "algorithm": "astar"}
```

`algorithm` is `astar` or `dijkstra`. The optional `"closed_roads": [["B", "E"]]` closes extra roads. The response
includes `found`, `path`, `travel_time_min`, `nodes_expanded`, `expanded` (in expansion order) and `runtime_ms`. An unknown junction,
scenario or algorithm returns **400** with an `error` message. A destination cut off by blocked roads returns
`found: false`. `GET /api/graph` returns the junctions, roads and scenarios.

## Results (demo trip A → F)

| Scenario                  | Route     | Time (min) | A* expanded | Dijkstra expanded |
|---------------------------|-----------|-----------:|------------:|------------------:|
| Night                     | A-B-E-F   | 16.90      | 4           | 11                |
| Off-peak                  | A-B-E-F   | 21.12      | 6           | 11                |
| Peak                      | A-B-E-F   | 33.80      | 8           | 11                |
| Road-block (B–E closed)   | A-C-G-I-F | 24.62      | 10          | 12                |

A* and Dijkstra costs agree for all 132 start/goal pairs in every scenario. A* expands fewer nodes, but the gap
narrows at peak: the heuristic assumes free-flow 60 km/h, so it becomes less informative as the multiplier grows.

## Deploy (Vercel)

`api/index.py` exposes the Flask app as a Python serverless function and `vercel.json` routes every path to it.
Import the repo in Vercel and pick this branch, or run `npx vercel --prod`.

## Structure

```
traffic_astar.py        load data -> build graph -> heuristic -> A* -> Dijkstra -> evaluation
app.py                  Flask API + browser demo
templates/index.html    browser interface
data/nodes.csv          junctions (x/y km)
data/edges.csv          roads (distance, traffic factor, blocked flag)
test_traffic_astar.py   test cases from the report
api/index.py            Vercel entry point
doc/                    project report
Traffic_route_optimization.ipynb, *.png, benchmark_results.csv, summary.txt   earlier dataset-driven analysis
```
