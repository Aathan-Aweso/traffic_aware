"""
Flask API and browser demo.

Run: python app.py  ->  http://127.0.0.1:5000   (on macOS, if 5000 is taken: PORT=5001 python app.py)

POST /api/route  {"start": "A", "goal": "F", "scenario": "peak", "algorithm": "astar"}
                 optional "closed_roads": [["B", "E"]]
GET  /api/graph  junctions, roads and scenarios for the map
"""
import os

from flask import Flask, jsonify, render_template, request

import traffic_astar as ta

app = Flask(__name__)


@app.get("/")
def index():
    return render_template("index.html")


@app.get("/api/graph")
def graph():
    nodes = ta.load_nodes()
    edges = ta.load_edges()
    return jsonify({
        "nodes": [{"id": n, "x": x, "y": y} for n, (x, y) in nodes.items()],
        "edges": [{"source": a, "target": b, "distance_km": d, "traffic_factor": t, "blocked": blk}
                  for a, b, d, t, blk in edges],
        "scenarios": ta.SCENARIOS,
        "roadblock": ta.ROADBLOCK,
        "reference_speed": ta.REFERENCE_SPEED,
    })


@app.post("/api/route")
def route():
    body = request.get_json(silent=True) or {}
    if "start" not in body or "goal" not in body:
        return jsonify({"error": "start and goal are required"}), 400
    try:
        result = ta.find_route(body["start"], body["goal"], body.get("scenario", "offpeak"),
                               body.get("algorithm", "astar"), body.get("closed_roads", []))
    except (ValueError, TypeError) as err:
        return jsonify({"error": str(err)}), 400
    return jsonify(result)


if __name__ == "__main__":
    app.run(debug=True, port=int(os.environ.get("PORT", 5000)))
