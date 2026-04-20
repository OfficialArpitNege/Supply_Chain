import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from fastapi.testclient import TestClient

from Backend.main import app

client = TestClient(app)

scenarios = [
    {
        "name": "SCENARIO 1 (LOW DEMAND + NO DELAY)",
        "delay_payload": {
            "Agent_Age": 28,
            "Agent_Rating": 4.8,
            "distance": 5,
            "Delivery_Time": 20,
            "Weather": "Clear",
            "Traffic": "Low",
            "Vehicle": "Bike",
            "Area": "Urban",
            "weekday": 2,
            "temperature_C": 25,
            "traffic_congestion_index": 0.2,
            "precipitation_mm": 0,
            "weather_condition": "Clear",
            "season": "Summer",
            "peak_hour": 0,
        },
        "demand_payload": {
            "product_id": 101,
            "category": "Grocery & Staples",
            "order_date": "2026-04-22",
        },
    },
    {
        "name": "SCENARIO 2 (HIGH DEMAND + HIGH DELAY RISK)",
        "delay_payload": {
            "Agent_Age": 35,
            "Agent_Rating": 3.5,
            "distance": 20,
            "Delivery_Time": 60,
            "Weather": "Rainy",
            "Traffic": "High",
            "Vehicle": "Bike",
            "Area": "Urban",
            "weekday": 5,
            "temperature_C": 18,
            "traffic_congestion_index": 0.9,
            "precipitation_mm": 10,
            "weather_condition": "Storm",
            "season": "Monsoon",
            "peak_hour": 1,
        },
        "demand_payload": {
            "product_id": 101,
            "category": "Pharmacy",
            "order_date": "2026-04-25",
        },
    },
    {
        "name": "SCENARIO 3 (MEDIUM CASE)",
        "delay_payload": {
            "Agent_Age": 30,
            "Agent_Rating": 4.2,
            "distance": 12,
            "Delivery_Time": 40,
            "Weather": "Cloudy",
            "Traffic": "Medium",
            "Vehicle": "Car",
            "Area": "Semi-Urban",
            "weekday": 3,
            "temperature_C": 22,
            "traffic_congestion_index": 0.5,
            "precipitation_mm": 2,
            "weather_condition": "Cloudy",
            "season": "Winter",
            "peak_hour": 0,
        },
        "demand_payload": {
            "product_id": 102,
            "category": "Snacks & Munchies",
            "order_date": "2026-04-23",
        },
    },
    {
        "name": "SCENARIO 4 (RAIN SURGE DEMAND)",
        "delay_payload": {
            "Agent_Age": 32,
            "Agent_Rating": 4.0,
            "distance": 8,
            "Delivery_Time": 45,
            "Weather": "Rainy",
            "Traffic": "High",
            "Vehicle": "Bike",
            "Area": "Urban",
            "weekday": 6,
            "temperature_C": 22,
            "traffic_congestion_index": 0.8,
            "precipitation_mm": 12,
            "weather_condition": "Rain",
            "season": "Monsoon",
            "peak_hour": 1,
        },
        "demand_payload": {
            "product_id": 103,
            "category": "Grocery & Staples",
            "order_date": "2026-04-26",
        },
    },
    {
        "name": "SCENARIO 5 (EDGE CASE)",
        "delay_payload": {
            "Agent_Age": 26,
            "Agent_Rating": 4.9,
            "distance": 25,
            "Delivery_Time": 30,
            "Weather": "Clear",
            "Traffic": "Low",
            "Vehicle": "Bike",
            "Area": "Urban",
            "weekday": 1,
            "temperature_C": 20,
            "traffic_congestion_index": 0.3,
            "precipitation_mm": 0,
            "weather_condition": "Clear",
            "season": "Winter",
            "peak_hour": 0,
        },
        "demand_payload": {
            "product_id": 104,
            "category": "Pharmacy",
            "order_date": "2026-04-21",
        },
    },
]

results = []
delay_predictions = []
demand_values = []
delay_times = []
demand_times = []

for sc in scenarios:
    t0 = time.perf_counter()
    delay_resp = client.post('/predict-delay', json=sc['delay_payload'])
    delay_ms = (time.perf_counter() - t0) * 1000

    t0 = time.perf_counter()
    demand_resp = client.post('/predict-demand', json=sc['demand_payload'])
    demand_ms = (time.perf_counter() - t0) * 1000

    delay_json = delay_resp.json()
    demand_json = demand_resp.json()

    delay_pred = delay_json.get('delay')
    delay_conf = delay_json.get('confidence')
    demand_val = demand_json.get('predicted_demand')

    delay_predictions.append(delay_pred)
    demand_values.append(demand_val)
    delay_times.append(delay_ms)
    demand_times.append(demand_ms)

    results.append({
        'name': sc['name'],
        'delay_status': delay_resp.status_code,
        'delay': delay_pred,
        'delay_confidence': delay_conf,
        'delay_ms': round(delay_ms, 2),
        'demand_status': demand_resp.status_code,
        'demand': demand_val,
        'demand_ms': round(demand_ms, 2),
    })

# Sensitivity test: change one feature only for delay
base_delay = {
    "Agent_Age": 30,
    "Agent_Rating": 4.2,
    "distance": 12,
    "Delivery_Time": 40,
    "Weather": "Clear",
    "Traffic": "Low",
    "Vehicle": "Bike",
    "Area": "Urban",
    "weekday": 3,
    "temperature_C": 22,
    "traffic_congestion_index": 0.5,
    "precipitation_mm": 2,
    "weather_condition": "Clear",
    "season": "Winter",
    "peak_hour": 0,
}
changed_delay = dict(base_delay)
changed_delay['Traffic'] = 'High'

base_delay_out = client.post('/predict-delay', json=base_delay).json()
changed_delay_out = client.post('/predict-delay', json=changed_delay).json()

# Sensitivity for demand: since endpoint accepts product/category/date only,
# vary only order_date while keeping other demand fields same.
base_demand = {
    'product_id': 101,
    'category': 'Grocery & Staples',
    'order_date': '2026-04-22',
}
changed_demand = dict(base_demand)
changed_demand['order_date'] = '2026-04-26'

base_demand_out = client.post('/predict-demand', json=base_demand).json()
changed_demand_out = client.post('/predict-demand', json=changed_demand).json()

invalid_resp = client.post('/predict-delay', json={'Traffic': 'UNKNOWN'})

report = {
    'scenario_results': results,
    'checks': {
        'delay_all_status_200': all(r['delay_status'] == 200 for r in results),
        'demand_all_status_200': all(r['demand_status'] == 200 for r in results),
        'delay_has_both_classes': set(delay_predictions) == {0, 1},
        'delay_not_constant': len(set(delay_predictions)) > 1,
        'demand_not_constant': len(set(demand_values)) > 1,
        'delay_confidence_varies': (max(float(x) for x in [r['delay_confidence'] for r in results]) - min(float(x) for x in [r['delay_confidence'] for r in results])) > 0.1,
        'delay_latency_under_1s': max(delay_times) < 1000,
        'demand_latency_under_1s': max(demand_times) < 1000,
        'delay_sensitivity_traffic': base_delay_out != changed_delay_out,
        'demand_sensitivity_order_date': base_demand_out != changed_demand_out,
        'invalid_input_no_crash': invalid_resp.status_code in (200, 400, 422),
    },
    'sensitivity': {
        'delay_low_traffic': base_delay_out,
        'delay_high_traffic': changed_delay_out,
        'demand_base': base_demand_out,
        'demand_changed': changed_demand_out,
    },
    'invalid_input': {
        'status': invalid_resp.status_code,
        'body': invalid_resp.json(),
    },
}

print(json.dumps(report, indent=2))
