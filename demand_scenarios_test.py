import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from fastapi.testclient import TestClient
from Backend.main import app

client = TestClient(app)

scenarios = [
    {
        "name": "Low Demand Scenario (Baseline)",
        "payload": {
            "product_id": 101,
            "category": "Grocery & Staples",
            "order_date": "2026-04-22",
            "Traffic": "Low",
            "Weather": "Clear",
            "distance": 5,
            "peak_hour": 0,
            "weekday": 2,
            "temperature_C": 25,
        },
    },
    {
        "name": "High Demand Scenario (Peak Time)",
        "payload": {
            "product_id": 101,
            "category": "Grocery & Staples",
            "order_date": "2026-04-24",
            "Traffic": "High",
            "Weather": "Clear",
            "distance": 10,
            "peak_hour": 1,
            "weekday": 5,
            "temperature_C": 30,
        },
    },
    {
        "name": "Rainy Day Surge",
        "payload": {
            "product_id": 101,
            "category": "Grocery & Staples",
            "order_date": "2026-04-25",
            "Traffic": "High",
            "Weather": "Rainy",
            "distance": 8,
            "peak_hour": 1,
            "weekday": 6,
            "temperature_C": 22,
            "precipitation_mm": 10,
        },
    },
    {
        "name": "Medium Demand Scenario",
        "payload": {
            "product_id": 101,
            "category": "Grocery & Staples",
            "order_date": "2026-04-23",
            "Traffic": "Medium",
            "Weather": "Cloudy",
            "distance": 12,
            "peak_hour": 0,
            "weekday": 3,
            "temperature_C": 24,
        },
    },
    {
        "name": "Low Activity (Off Hours)",
        "payload": {
            "product_id": 101,
            "category": "Grocery & Staples",
            "order_date": "2026-04-20",
            "Traffic": "Low",
            "Weather": "Clear",
            "distance": 15,
            "peak_hour": 0,
            "weekday": 1,
            "temperature_C": 20,
        },
    },
    {
        "name": "Extreme Condition (Stress Test)",
        "payload": {
            "product_id": 101,
            "category": "Grocery & Staples",
            "order_date": "2026-04-26",
            "Traffic": "High",
            "Weather": "Storm",
            "distance": 20,
            "peak_hour": 1,
            "weekday": 6,
            "temperature_C": 18,
            "precipitation_mm": 20,
        },
    },
]

results = []
for scenario in scenarios:
    r = client.post("/predict-demand", json=scenario["payload"])
    body = r.json()
    results.append(
        {
            "name": scenario["name"],
            "status": r.status_code,
            "predicted_demand": body.get("predicted_demand"),
        }
    )

# Sensitivity: change only distance, keep demand features same
base = {
    "product_id": 101,
    "category": "Grocery & Staples",
    "order_date": "2026-04-22",
    "Traffic": "Low",
    "Weather": "Clear",
    "distance": 5,
    "peak_hour": 0,
    "weekday": 2,
    "temperature_C": 25,
}
far = dict(base)
far["distance"] = 20

base_resp = client.post("/predict-demand", json=base).json().get("predicted_demand")
far_resp = client.post("/predict-demand", json=far).json().get("predicted_demand")

# Weather-only sensitivity check
clear_payload = dict(base)
rain_payload = dict(base)
rain_payload["Weather"] = "Rainy"
clear_resp = client.post("/predict-demand", json=clear_payload).json().get("predicted_demand")
rain_resp = client.post("/predict-demand", json=rain_payload).json().get("predicted_demand")

report = {
    "scenario_results": results,
    "checks": {
        "all_status_200": all(item["status"] == 200 for item in results),
        "outputs_vary": len(set(item["predicted_demand"] for item in results)) > 1,
        "range_1_to_3": all(1.0 <= float(item["predicted_demand"]) <= 3.0 for item in results),
        "distance_sensitivity": base_resp != far_resp,
        "weather_sensitivity": clear_resp != rain_resp,
    },
    "sensitivity_values": {
        "distance_5": base_resp,
        "distance_20": far_resp,
        "weather_clear": clear_resp,
        "weather_rainy": rain_resp,
    },
}

print(json.dumps(report, indent=2))
