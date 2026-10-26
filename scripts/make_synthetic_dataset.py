"""
Generate a synthetic sustainable_vehicle_routing.csv with the columns the notebook expects.

The area (~65 x 65 km) has a congested city centre, two secondary hotspots and a fast
ring road, so the learned road network has real structure for the search algorithms.

Run: python scripts/make_synthetic_dataset.py [rows]   -> writes sustainable_vehicle_routing.csv
"""
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROWS = int(sys.argv[1]) if len(sys.argv) > 1 else 6000
LAT0, LAT1, LON0, LON1 = 12.70, 13.30, 77.30, 77.90
CENTRE = (13.00, 77.60)
HOTSPOTS = [(CENTRE, 0.10, 1.0), ((12.83, 77.45), 0.06, 0.7), ((13.17, 77.78), 0.05, 0.6)]
RING_R, RING_W = 0.20, 0.025          # ring road radius / width in degrees

rng = np.random.default_rng(7)
lat = rng.uniform(LAT0, LAT1, ROWS)
lon = rng.uniform(LON0, LON1, ROWS)

# congestion level in [0, 1]: gaussian hotspots
cong = np.zeros(ROWS)
for (clat, clon), sd, amp in HOTSPOTS:
    cong += amp * np.exp(-((lat - clat) ** 2 + (lon - clon) ** 2) / (2 * sd ** 2))
r = np.hypot(lat - CENTRE[0], lon - CENTRE[1])
on_ring = np.abs(r - RING_R) < RING_W
cong = np.clip(cong + rng.normal(0, 0.12, ROWS) - 0.25 * on_ring, 0, 1)

traffic = np.where(cong > 0.55, "High", np.where(cong > 0.25, "Medium", "Low"))
# sprinkle randomness so every level appears everywhere
flip = rng.random(ROWS) < 0.15
traffic[flip] = rng.choice(["Low", "Medium", "High"], flip.sum())

weather = rng.choice(["Clear", "Rainy", "Foggy", "Stormy"], ROWS, p=[0.55, 0.25, 0.12, 0.08])
road = np.where(weather == "Rainy", rng.choice(["Dry", "Wet"], ROWS, p=[0.3, 0.7]),
                np.where(weather == "Stormy", rng.choice(["Wet", "Icy"], ROWS, p=[0.6, 0.4]),
                         rng.choice(["Dry", "Wet", "Icy"], ROWS, p=[0.85, 0.12, 0.03])))

base = pd.Series(traffic).map({"Low": 62, "Medium": 42, "High": 24}).to_numpy(float)
base += 28 * on_ring
base *= pd.Series(weather).map({"Clear": 1, "Rainy": .9, "Foggy": .85, "Stormy": .75}).to_numpy()
base *= pd.Series(road).map({"Dry": 1, "Wet": .93, "Icy": .75}).to_numpy()
speed = np.clip(base + rng.normal(0, 6, ROWS), 8, 110)

# fuel (L/km) is U-shaped in speed, worse in stop-and-go traffic; CO2 ~ 2310 g per litre petrol
stop_go = pd.Series(traffic).map({"Low": 1.0, "Medium": 1.12, "High": 1.35}).to_numpy()
fuel = (0.055 + 0.9 / speed + 0.000006 * (speed - 60) ** 2) * stop_go + rng.normal(0, 0.006, ROWS)
fuel[rng.random(ROWS) < 0.01] *= -1                       # a few sensor glitches (cleaned by notebook)
co2 = np.abs(fuel) * 2310 + rng.normal(0, 8, ROWS)

seg_km = rng.uniform(3, 15, ROWS)
travel = seg_km / speed * 60 + rng.normal(0, 1.0, ROWS)
travel = np.clip(travel, 1, None)
optimal = (travel / seg_km < np.median(travel / seg_km)) & (rng.random(ROWS) < 0.8)

df = pd.DataFrame({
    "timestamp": pd.date_range("2024-01-01", periods=ROWS, freq="7min"),
    "vehicle_id": rng.integers(1, 120, ROWS).astype(str),
    "latitude": lat.round(6), "longitude": lon.round(6),
    "speed": speed.round(2), "traffic_density": traffic, "road_condition": road,
    "weather_condition": weather, "fuel_consumption": fuel.round(4), "co2_emission": co2.round(2),
    "travel_time": travel.round(2), "is_optimal_route": optimal.astype(int),
})
df["vehicle_id"] = "V" + df.vehicle_id.str.zfill(3)
out = Path.cwd() / "sustainable_vehicle_routing.csv"
df.to_csv(out, index=False)
print(f"wrote {len(df)} rows -> {out}")
print(df.traffic_density.value_counts().to_string())
