import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from fastapi.testclient import TestClient

from Backend.main import app

client = TestClient(app)

common = {
    "Agent_Age": 30,
    "weekday": 2,
    "temperature_C": 25,
    "traffic_congestion_index": 0.3,
    "weather_condition": "Clear",
    "season": "Summer",
    "Area": "Urban",
    "Vehicle": "Bike",
}

scenarios = [
    {
        "name": "Ideal Case",
        "payload": {
            **common,
            "Traffic": "Low",
            "Weather": "Clear",
            "distance": 5,
            "Delivery_Time": 20,
            "Agent_Rating": 4.8,
            "peak_hour": 0,
            "precipitation_mm": 0,
            "Agent_Age": 28,
        },
    },
    {
        "name": "High Risk Case",
        "payload": {
            **common,
            "Traffic": "High",
            "Weather": "Rainy",
            "distance": 20,
            "Delivery_Time": 60,
            "Agent_Rating": 3.2,
            "peak_hour": 1,
            "precipitation_mm": 12,
            "Agent_Age": 35,
            "weekday": 5,
            "temperature_C": 18,
            "weather_condition": "Storm",
            "season": "Winter",
        },
    },
    {
        "name": "Medium Risk Case",
        "payload": {
            **common,
            "Traffic": "Medium",
            "Weather": "Cloudy",
            "distance": 12,
            "Delivery_Time": 40,
            "Agent_Rating": 4.0,
            "peak_hour": 0,
            "precipitation_mm": 2,
            "Agent_Age": 30,
            "weekday": 3,
            "temperature_C": 22,
            "weather_condition": "Cloudy",
            "season": "Winter",
            "Vehicle": "Car",
            "Area": "Semi-Urban",
        },
    },
    {
        "name": "Rain + Peak Hour",
        "payload": {
            **common,
            "Traffic": "High",
            "Weather": "Storm",
            "distance": 15,
            "Delivery_Time": 50,
            "Agent_Rating": 3.8,
            "peak_hour": 1,
            "precipitation_mm": 15,
            "Agent_Age": 32,
            "weekday": 6,
            "temperature_C": 19,
            "weather_condition": "Storm",
            "season": "Winter",
        },
    },
    {
        "name": "Night Off-Peak Fast",
        "payload": {
            **common,
            "Traffic": "Low",
            "Weather": "Clear",
            "distance": 8,
            "Delivery_Time": 25,
            "Agent_Rating": 4.5,
            "peak_hour": 0,
            "precipitation_mm": 0,
            "Agent_Age": 29,
            "hour_of_day": 23,
            "weekday": 1,
        },
    },
    {
        "name": "Edge Case Long Distance",
        "payload": {
            **common,
            "Traffic": "Low",
            "Weather": "Clear",
            "distance": 25,
            "Delivery_Time": 30,
            "Agent_Rating": 4.9,
            "peak_hour": 0,
            "precipitation_mm": 0,
            "Agent_Age": 31,
            "weekday": 2,
        },
    },
]

results = []
for scenario in scenarios:
    r = client.post("/predict-delay", json=scenario["payload"])
    body = r.json()
    results.append(
        {
            "name": scenario["name"],
            "status": r.status_code,
            "delay": body.get("delay"),
            "confidence": body.get("confidence"),
        }
    )

# Sensitivity check: only Traffic changes
base = {
    **common,
    "Weather": "Clear",
    "distance": 10,
    "Delivery_Time": 35,
    "Agent_Rating": 4.2,
    "peak_hour": 0,
    "precipitation_mm": 0,
    "Agent_Age": 30,
}

low_traffic = dict(base)
low_traffic["Traffic"] = "Low"
high_traffic = dict(base)
high_traffic["Traffic"] = "High"

low_resp = client.post("/predict-delay", json=low_traffic).json()
high_resp = client.post("/predict-delay", json=high_traffic).json()

pred_set = sorted(list({item["delay"] for item in results if item["delay"] is not None}))

report = {
    "scenario_results": results,
    "class_diversity": pred_set,
    "checks": {
        "all_status_200": all(item["status"] == 200 for item in results),
        "has_both_classes": set(pred_set) == {0, 1},
        "has_confidence_range": (max(item["confidence"] for item in results) - min(item["confidence"] for item in results)) > 0.1,
        "medium_case_confidence_moderate": any(item["name"] == "Medium Risk Case" and 0.4 <= float(item["confidence"]) <= 0.7 for item in results),
        "traffic_sensitivity": low_resp.get("delay") != high_resp.get("delay") or low_resp.get("confidence") != high_resp.get("confidence"),
    },
    "sensitivity": {
        "low_traffic": low_resp,
        "high_traffic": high_resp,
    },
}

print(json.dumps(report, indent=2))
