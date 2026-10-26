"""
Traffic-aware route planning using A* search.

Edge cost  = distance (km) x traffic factor   -> minutes at a 60 km/h reference speed
Heuristic  = straight-line distance to the goal (km) -> minutes at 60 km/h (never overestimates)

Run: python traffic_astar.py
"""
import csv
import heapq
import math
import os
import time

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
REFERENCE_SPEED = 60  # km/h

# scenario -> traffic multiplier applied to every road
SCENARIOS = {"night": 1.0, "offpeak": 1.25, "peak": 2.0, "roadblock": 1.25}
ROADBLOCK = ("B", "E")  # road closed in the "roadblock" scenario


# ---------------------------------------------------------------- 1. load data
def load_nodes():
    """Return {junction: (x, y)} with coordinates in km."""
    nodes = {}
    with open(os.path.join(DATA_DIR, "nodes.csv")) as f:
        for row in csv.DictReader(f):
            nodes[row["id"]] = (float(row["x"]), float(row["y"]))
    return nodes


def load_edges():
    """Return a list of roads: (a, b, distance_km, traffic_factor, blocked)."""
    edges = []
    with open(os.path.join(DATA_DIR, "edges.csv")) as f:
        for row in csv.DictReader(f):
            edges.append((row["source"], row["target"], float(row["distance_km"]),
                          float(row["traffic_factor"]), row["blocked"] == "1"))
    return edges


# ---------------------------------------------------------------- 2. build graph
def build_graph(nodes, edges, scenario, closed_roads=()):
    """Return {junction: [(neighbour, minutes), ...]}. Blocked roads are left out."""
    closed = {frozenset(road) for road in closed_roads}
    if scenario == "roadblock":
        closed.add(frozenset(ROADBLOCK))

    graph = {node: [] for node in nodes}
    for a, b, distance, traffic, blocked in edges:
        if blocked or frozenset((a, b)) in closed:
            continue
        minutes = distance / REFERENCE_SPEED * 60 * traffic * SCENARIOS[scenario]
        graph[a].append((b, minutes))
        graph[b].append((a, minutes))
    return graph


# ---------------------------------------------------------------- 3. heuristic
def heuristic(nodes, node, goal):
    """Straight-line travel time (minutes) from node to goal at the reference speed."""
    return math.dist(nodes[node], nodes[goal]) / REFERENCE_SPEED * 60


# ---------------------------------------------------------------- 4. A* search
def astar(graph, nodes, start, goal):
    frontier = [(heuristic(nodes, start, goal), start)]   # (f = g + h, junction)
    g = {start: 0}                                         # best known cost from start
    parent = {start: None}
    expanded = []

    while frontier:
        _, current = heapq.heappop(frontier)
        if current in expanded:
            continue
        expanded.append(current)
        if current == goal:
            return make_path(parent, goal), g[goal], expanded

        for neighbour, minutes in graph[current]:
            new_g = g[current] + minutes
            if neighbour not in g or new_g < g[neighbour]:
                g[neighbour] = new_g
                parent[neighbour] = current
                f = new_g + heuristic(nodes, neighbour, goal)
                heapq.heappush(frontier, (f, neighbour))

    return None, None, expanded   # goal not reachable


# ---------------------------------------------------------------- 5. Dijkstra (baseline)
def dijkstra(graph, start, goal):
    frontier = [(0, start)]                                # (g, junction)
    g = {start: 0}
    parent = {start: None}
    expanded = []

    while frontier:
        _, current = heapq.heappop(frontier)
        if current in expanded:
            continue
        expanded.append(current)
        if current == goal:
            return make_path(parent, goal), g[goal], expanded

        for neighbour, minutes in graph[current]:
            new_g = g[current] + minutes
            if neighbour not in g or new_g < g[neighbour]:
                g[neighbour] = new_g
                parent[neighbour] = current
                heapq.heappush(frontier, (new_g, neighbour))

    return None, None, expanded


def make_path(parent, goal):
    path = [goal]
    while parent[path[-1]] is not None:
        path.append(parent[path[-1]])
    return path[::-1]


# ---------------------------------------------------------------- 6. one route request
def find_route(start, goal, scenario="offpeak", algorithm="astar", closed_roads=()):
    nodes, edges = load_nodes(), load_edges()
    if start not in nodes or goal not in nodes:
        raise ValueError("unknown junction: start and goal must be in nodes.csv")
    if scenario not in SCENARIOS:
        raise ValueError("unknown scenario: use " + ", ".join(SCENARIOS))
    if algorithm not in ("astar", "dijkstra"):
        raise ValueError("unknown algorithm: use astar or dijkstra")

    graph = build_graph(nodes, edges, scenario, closed_roads)
    t0 = time.perf_counter()
    if algorithm == "astar":
        path, cost, expanded = astar(graph, nodes, start, goal)
    else:
        path, cost, expanded = dijkstra(graph, start, goal)
    runtime_ms = (time.perf_counter() - t0) * 1000

    return {"start": start, "goal": goal, "scenario": scenario, "algorithm": algorithm,
            "found": path is not None, "path": path or [], "travel_time_min": cost,
            "nodes_expanded": len(expanded), "expanded": expanded, "runtime_ms": runtime_ms}


# ---------------------------------------------------------------- 7. evaluation
def main():
    start, goal = "A", "F"
    print(f"Route {start} -> {goal}\n")
    print(f"{'Scenario':<10} {'Algorithm':<9} {'Route':<12} {'Time (min)':>10} {'Expanded':>9} {'Runtime (ms)':>13}")
    for scenario in SCENARIOS:
        a = find_route(start, goal, scenario, "astar")
        d = find_route(start, goal, scenario, "dijkstra")
        for r in (a, d):
            print(f"{scenario:<10} {r['algorithm']:<9} {'-'.join(r['path']):<12} "
                  f"{r['travel_time_min']:>10.2f} {r['nodes_expanded']:>9} {r['runtime_ms']:>13.4f}")
        assert math.isclose(a["travel_time_min"], d["travel_time_min"]), "A* and Dijkstra disagree"
    print("\nA* travel time matches Dijkstra in every scenario.")


if __name__ == "__main__":
    main()
