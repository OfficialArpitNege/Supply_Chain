import csv
import json
import math
import statistics
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from fastapi.testclient import TestClient
from Backend.main import app


client = TestClient(app)


def safe_float(value, default=0.0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def safe_int(value, default=0):
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return default


def mean_or_zero(values):
    if not values:
        return 0.0
    return float(sum(values) / len(values))


def rmse(errors):
    if not errors:
        return 0.0
    return math.sqrt(sum(e * e for e in errors) / len(errors))


def classify_traffic(index_0_to_100):
    if index_0_to_100 >= 70:
        return "High"
    if index_0_to_100 >= 40:
        return "Medium"
    return "Low"


def group_prediction_parity(rows, key_name):
    groups = defaultdict(list)
    for row in rows:
        groups[row.get(key_name, "UNKNOWN")].append(row)

    by_group = {}
    for name, items in groups.items():
        delays = [safe_int(item.get("delay"), 0) for item in items]
        confs = [safe_float(item.get("confidence"), 0.0) for item in items]
        by_group[name] = {
            "count": len(items),
            "delay_rate": round(mean_or_zero(delays), 4),
            "mean_confidence": round(mean_or_zero(confs), 4),
        }

    valid = [v for v in by_group.values() if v["count"] >= 30]
    if valid:
        disparity = {
            "delay_rate_gap": round(max(v["delay_rate"] for v in valid) - min(v["delay_rate"] for v in valid), 4),
            "confidence_gap": round(max(v["mean_confidence"] for v in valid) - min(v["mean_confidence"] for v in valid), 4),
        }
    else:
        disparity = {
            "delay_rate_gap": None,
            "confidence_gap": None,
        }

    return {
        "by_group": by_group,
        "disparity": disparity,
    }


def compute_classification_metrics(y_true, y_pred):
    tp = sum(1 for yt, yp in zip(y_true, y_pred) if yt == 1 and yp == 1)
    tn = sum(1 for yt, yp in zip(y_true, y_pred) if yt == 0 and yp == 0)
    fp = sum(1 for yt, yp in zip(y_true, y_pred) if yt == 0 and yp == 1)
    fn = sum(1 for yt, yp in zip(y_true, y_pred) if yt == 1 and yp == 0)

    total = max(len(y_true), 1)
    accuracy = (tp + tn) / total
    precision = tp / max(tp + fp, 1)
    recall = tp / max(tp + fn, 1)
    f1 = 0.0 if precision + recall == 0 else (2 * precision * recall) / (precision + recall)

    return {
        "accuracy": round(accuracy, 4),
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "f1": round(f1, 4),
        "confusion": {
            "tp": tp,
            "tn": tn,
            "fp": fp,
            "fn": fn,
        },
    }


def evaluate_delay_from_logistics(logistics_path, max_rows=1200):
    outputs = []
    with open(logistics_path, "r", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        for idx, row in enumerate(reader):
            if idx >= max_rows:
                break

            payload = {
                "Agent_Age": safe_int(row.get("Agent_Age"), 30),
                "Agent_Rating": safe_float(row.get("Agent_Rating"), 4.5),
                "weather": str(row.get("Weather", "Clear")).strip(),
                "traffic": str(row.get("Traffic", "Medium")).strip(),
                "vehicle": str(row.get("Vehicle", "Bike")).strip(),
                "area": str(row.get("Area", "Urban")).strip(),
                "distance": safe_float(row.get("distance"), 5.0),
                "hour_of_day": safe_int(row.get("hour_of_day"), 12),
                "weekday": safe_int(row.get("weekday"), 0),
                "temperature_C": 30.0,
                "traffic_congestion_index": 0.5,
                "precipitation_mm": 0.0,
                "timestamp": datetime.utcnow().isoformat(),
            }

            response = client.post("/predict-delay", json=payload)
            if response.status_code != 200:
                continue

            prediction = response.json()
            outputs.append(
                {
                    "delay": safe_int(prediction.get("delay"), 0),
                    "confidence": safe_float(prediction.get("confidence"), 0.0),
                    "weather": payload["weather"],
                    "traffic": payload["traffic"],
                    "area": payload["area"],
                }
            )

    return {
        "samples_scored": len(outputs),
        "overall_delay_rate": round(mean_or_zero([r["delay"] for r in outputs]), 4),
        "overall_confidence": round(mean_or_zero([r["confidence"] for r in outputs]), 4),
        "traffic_parity": group_prediction_parity(outputs, "traffic"),
        "weather_parity": group_prediction_parity(outputs, "weather"),
        "area_parity": group_prediction_parity(outputs, "area"),
    }


def evaluate_delay_with_labels(external_path, max_rows=1200):
    y_true = []
    y_pred = []
    probs = []

    with open(external_path, "r", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        for idx, row in enumerate(reader):
            if idx >= max_rows:
                break

            traffic_index = safe_float(row.get("traffic_congestion_index"), 50.0)
            traffic_label = classify_traffic(traffic_index)
            payload = {
                "Agent_Age": 30,
                "Agent_Rating": 4.4,
                "weather": str(row.get("weather_condition", "Clear")).strip(),
                "traffic": traffic_label,
                "vehicle": "Bike",
                "area": "Urban",
                "distance": 8.0,
                "hour_of_day": 12,
                "weekday": safe_int(row.get("weekday"), 0),
                "temperature_C": safe_float(row.get("temperature_C"), 25.0),
                "traffic_congestion_index": min(max(traffic_index / 100.0, 0.0), 1.0),
                "precipitation_mm": safe_float(row.get("precipitation_mm"), 0.0),
                "weather_condition": str(row.get("weather_condition", "Clear")).strip(),
                "season": str(row.get("season", "Summer")).strip(),
                "peak_hour": safe_int(row.get("peak_hour"), 0),
                "timestamp": datetime.utcnow().isoformat(),
            }

            response = client.post("/predict-delay", json=payload)
            if response.status_code != 200:
                continue

            out = response.json()
            pred_label = safe_int(out.get("delay"), 0)
            conf = min(max(safe_float(out.get("confidence"), 0.0), 0.0), 1.0)
            prob_delayed = conf if pred_label == 1 else (1.0 - conf)

            y_true.append(safe_int(row.get("delayed"), 0))
            y_pred.append(pred_label)
            probs.append(prob_delayed)

    metrics = compute_classification_metrics(y_true, y_pred)
    brier = mean_or_zero([(p - yt) ** 2 for p, yt in zip(probs, y_true)])
    metrics["brier_score"] = round(brier, 4)
    metrics["samples_scored"] = len(y_true)
    return metrics


def evaluate_demand(demand_path, max_rows=2500):
    errors = []
    abs_errors = []
    results = []

    with open(demand_path, "r", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        for idx, row in enumerate(reader):
            if idx >= max_rows:
                break

            order_date_raw = str(row.get("order_date", "")).strip()
            order_date = order_date_raw[:10]
            category = str(row.get("category", "Grocery & Staples")).strip()
            product_id = safe_int(row.get("product_id"), 0)
            actual = safe_float(row.get("quantity"), 0.0)

            payload = {
                "product_id": product_id,
                "category": category,
                "order_date": order_date,
            }

            response = client.post("/predict-demand", json=payload)
            if response.status_code != 200:
                continue

            pred = safe_float(response.json().get("predicted_demand"), 0.0)
            err = pred - actual
            errors.append(err)
            abs_errors.append(abs(err))

            month = None
            try:
                month = datetime.strptime(order_date, "%Y-%m-%d").month
            except ValueError:
                month = 0

            results.append(
                {
                    "category": category,
                    "month": month,
                    "pred": pred,
                    "actual": actual,
                    "error": err,
                }
            )

    by_category = defaultdict(list)
    by_month = defaultdict(list)
    for item in results:
        by_category[item["category"]].append(item["error"])
        by_month[item["month"]].append(item["error"])

    category_metrics = {}
    for key, vals in by_category.items():
        category_metrics[key] = {
            "count": len(vals),
            "bias_mean_error": round(mean_or_zero(vals), 4),
            "mae": round(mean_or_zero([abs(v) for v in vals]), 4),
        }

    month_metrics = {}
    for key, vals in by_month.items():
        month_metrics[str(key)] = {
            "count": len(vals),
            "bias_mean_error": round(mean_or_zero(vals), 4),
            "mae": round(mean_or_zero([abs(v) for v in vals]), 4),
        }

    valid_category_mae = [v["mae"] for v in category_metrics.values() if v["count"] >= 30]
    disparity_mae_gap = round(max(valid_category_mae) - min(valid_category_mae), 4) if valid_category_mae else None

    return {
        "samples_scored": len(results),
        "overall_mae": round(mean_or_zero(abs_errors), 4),
        "overall_rmse": round(rmse(errors), 4),
        "overall_bias_mean_error": round(mean_or_zero(errors), 4),
        "category_error": category_metrics,
        "month_error": month_metrics,
        "category_mae_gap": disparity_mae_gap,
    }


def main():
    root = Path(__file__).resolve().parent
    logistics_path = root / "Datasets" / "logistics_data.csv"
    demand_path = root / "Datasets" / "demand_data.csv"
    external_path = root / "Datasets" / "external_factors_data.csv"

    report = {
        "delay_prediction_parity": evaluate_delay_from_logistics(logistics_path),
        "delay_labeled_eval": evaluate_delay_with_labels(external_path),
        "demand_error_audit": evaluate_demand(demand_path),
    }

    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
