"""Test cases from section 5.2 of the report. Run: python -m unittest -v"""
import math
import unittest

from traffic_astar import find_route


class RouteTests(unittest.TestCase):
    def test_valid_route(self):
        r = find_route("A", "F")
        self.assertTrue(r["found"])
        self.assertEqual(r["path"][0], "A")
        self.assertEqual(r["path"][-1], "F")

    def test_astar_matches_dijkstra(self):
        for scenario in ("night", "offpeak", "peak", "roadblock"):
            a = find_route("A", "F", scenario, "astar")
            d = find_route("A", "F", scenario, "dijkstra")
            self.assertTrue(math.isclose(a["travel_time_min"], d["travel_time_min"]))
            self.assertLessEqual(a["nodes_expanded"], d["nodes_expanded"])

    def test_astar_matches_dijkstra_all_pairs(self):
        junctions = "ABCDEFGHIJKL"
        for scenario in ("night", "peak", "roadblock"):
            for s in junctions:
                for g in junctions:
                    a = find_route(s, g, scenario, "astar")["travel_time_min"]
                    d = find_route(s, g, scenario, "dijkstra")["travel_time_min"]
                    self.assertTrue(math.isclose(a, d), f"{scenario} {s}->{g}")

    def test_traffic_sensitivity(self):
        night = find_route("A", "F", "night")["travel_time_min"]
        offpeak = find_route("A", "F", "offpeak")["travel_time_min"]
        peak = find_route("A", "F", "peak")["travel_time_min"]
        self.assertLess(night, offpeak)
        self.assertLess(offpeak, peak)

    def test_blocked_road_is_avoided(self):
        normal = find_route("A", "F", "offpeak")["path"]
        self.assertIn("B-E", "-".join(normal))
        rerouted = find_route("A", "F", "roadblock")["path"]
        roads = {frozenset(pair) for pair in zip(rerouted, rerouted[1:])}
        self.assertNotIn(frozenset(("B", "E")), roads)

    def test_invalid_node(self):
        with self.assertRaises(ValueError):
            find_route("A", "Z")

    def test_disconnected_destination(self):
        cut_off_f = [("E", "F"), ("H", "F"), ("I", "F"), ("K", "F")]
        r = find_route("A", "F", "night", "astar", cut_off_f)
        self.assertFalse(r["found"])
        self.assertEqual(r["path"], [])


class ApiTests(unittest.TestCase):
    def setUp(self):
        from app import app
        self.client = app.test_client()

    def test_route(self):
        res = self.client.post("/api/route", json={"start": "A", "goal": "F", "scenario": "peak", "algorithm": "astar"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.get_json()["path"], ["A", "B", "E", "F"])

    def test_invalid_node_returns_400(self):
        res = self.client.post("/api/route", json={"start": "A", "goal": "Z"})
        self.assertEqual(res.status_code, 400)

    def test_missing_fields_return_400(self):
        self.assertEqual(self.client.post("/api/route", json={"start": "A"}).status_code, 400)
        self.assertEqual(self.client.post("/api/route", data="not json").status_code, 400)

    def test_pages(self):
        self.assertEqual(self.client.get("/").status_code, 200)
        self.assertEqual(len(self.client.get("/api/graph").get_json()["nodes"]), 12)


if __name__ == "__main__":
    unittest.main()
