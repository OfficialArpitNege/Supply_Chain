import argparse
import json
import re
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import joblib
import numpy as np
import pandas as pd
import sklearn


@dataclass
class ModelBundle:
    demand_model: Any
    delay_model: Any
    delay_scaler: Any
    le_category: Any
    le_weather: Any
    le_traffic: Any
    le_vehicle: Any
    le_area: Any
    le_weather_ext: Any
    le_season: Any


def _pick_existing(base_dir: Path, candidates: List[str]) -> Path:
    for name in candidates:
        path = base_dir / name
        if path.exists():
            return path
    raise FileNotFoundError(f"None of these files were found in {base_dir}: {', '.join(candidates)}")


def _safe_joblib_load(path: Path) -> Any:
    try:
        return joblib.load(path)
    except Exception as exc:
        context = (
            f"Failed to load artifact: {path}\n"
            f"Python version: {__import__('sys').version.split()[0]}\n"
            f"numpy version: {np.__version__}\n"
            f"scikit-learn version: {sklearn.__version__}\n"
            "The model may have been trained with newer incompatible versions.\n"
            "Recommended fix:\n"
            "1) Install Python 3.11+\n"
            "2) Create a new venv with that interpreter\n"
            "3) Install ML_Model/requirements-artifacts-py311.txt\n"
            "4) Re-run: python test_models.py"
        )
        raise RuntimeError(context) from exc


def load_artifacts(base_dir: Path) -> ModelBundle:
    demand_model_path = _pick_existing(base_dir, ["demand_model.pkl"])
    delay_model_path = _pick_existing(base_dir, ["delay_model_fixed.pkl", "delay_model.pkl"])
    delay_scaler_path = _pick_existing(base_dir, ["delay_scaler.pkl", "scaler.pkl"])

    le_category_path = _pick_existing(base_dir, ["le_category.pkl"])
    le_weather_path = _pick_existing(base_dir, ["le_weather.pkl"])
    le_traffic_path = _pick_existing(base_dir, ["le_traffic.pkl"])
    le_vehicle_path = _pick_existing(base_dir, ["le_vehicle.pkl"])
    le_area_path = _pick_existing(base_dir, ["le_area.pkl"])
    le_weather_ext_path = _pick_existing(base_dir, ["le_weather_ext.pkl"])
    le_season_path = _pick_existing(base_dir, ["le_season.pkl"])

    return ModelBundle(
        demand_model=_safe_joblib_load(demand_model_path),
        delay_model=_safe_joblib_load(delay_model_path),
        delay_scaler=_safe_joblib_load(delay_scaler_path),
        le_category=_safe_joblib_load(le_category_path),
        le_weather=_safe_joblib_load(le_weather_path),
        le_traffic=_safe_joblib_load(le_traffic_path),
        le_vehicle=_safe_joblib_load(le_vehicle_path),
        le_area=_safe_joblib_load(le_area_path),
        le_weather_ext=_safe_joblib_load(le_weather_ext_path),
        le_season=_safe_joblib_load(le_season_path),
    )


def _safe_encode(encoder: Any, raw_value: Any, field_name: str, warnings: List[str]) -> int:
    value = str(raw_value).strip()
    classes = set(str(x) for x in encoder.classes_)

    if value in classes:
        return int(encoder.transform([value])[0])

    fallback = str(encoder.classes_[0])
    warnings.append(
        f"Unknown value '{value}' for {field_name}; using fallback '{fallback}' from encoder classes."
    )
    return int(encoder.transform([fallback])[0])


def _to_float(value: Any, field_name: str) -> float:
    try:
        return float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{field_name} must be numeric. Got: {value!r}") from exc


def _to_int(value: Any, field_name: str) -> int:
    try:
        return int(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{field_name} must be an integer. Got: {value!r}") from exc


def _parse_product_id(product_id: Any) -> int:
    text = str(product_id).strip()
    if text.isdigit():
        return int(text)

    match = re.search(r"(\d+)", text)
    if match:
        return int(match.group(1))

    raise ValueError(f"product_id must contain a numeric part. Got: {product_id!r}")


def preprocess_demand_input(bundle: ModelBundle, payload: Dict[str, Any]) -> Tuple[pd.DataFrame, List[str]]:
    warnings: List[str] = []

    required = ["order_date", "product_id", "category"]
    missing = [k for k in required if k not in payload or payload[k] in (None, "")]
    if missing:
        raise ValueError(f"Missing demand input fields: {', '.join(missing)}")

    order_date_raw = str(payload["order_date"]).strip()
    try:
        order_date = datetime.strptime(order_date_raw, "%Y-%m-%d")
    except ValueError as exc:
        raise ValueError("order_date must be in YYYY-MM-DD format") from exc

    product_id_numeric = _parse_product_id(payload["product_id"])
    category_encoded = _safe_encode(bundle.le_category, payload["category"], "category", warnings)

    frame = pd.DataFrame(
        [
            {
                "product_id": product_id_numeric,
                "category_encoded": category_encoded,
                "month": order_date.month,
                "day": order_date.day,
                "weekday": order_date.weekday(),
            }
        ]
    )

    return frame, warnings


def preprocess_delay_input(bundle: ModelBundle, payload: Dict[str, Any]) -> Tuple[pd.DataFrame, List[str]]:
    warnings: List[str] = []

    required = [
        "Agent_Age",
        "Agent_Rating",
        "Weather",
        "Traffic",
        "Vehicle",
        "Area",
        "distance",
        "hour_of_day",
        "weekday",
        "temperature_C",
        "traffic_congestion_index",
    ]
    missing = [k for k in required if k not in payload or payload[k] in (None, "")]
    if missing:
        raise ValueError(f"Missing delay input fields: {', '.join(missing)}")

    agent_age = _to_float(payload["Agent_Age"], "Agent_Age")
    agent_rating = _to_float(payload["Agent_Rating"], "Agent_Rating")
    distance = _to_float(payload["distance"], "distance")
    hour_of_day = _to_int(payload["hour_of_day"], "hour_of_day")
    weekday = _to_int(payload["weekday"], "weekday")
    temperature_c = _to_float(payload["temperature_C"], "temperature_C")
    congestion_index = _to_float(payload["traffic_congestion_index"], "traffic_congestion_index")

    if not (0 <= hour_of_day <= 23):
        raise ValueError("hour_of_day must be in range [0, 23]")
    if not (0 <= weekday <= 6):
        raise ValueError("weekday must be in range [0, 6]")

    precipitation_mm = _to_float(payload.get("precipitation_mm", 0.0), "precipitation_mm")
    peak_hour = _to_int(payload.get("peak_hour", 1 if hour_of_day in {8, 9, 17, 18, 19} else 0), "peak_hour")

    if peak_hour not in (0, 1):
        raise ValueError("peak_hour must be 0 or 1")

    season_value = payload.get("season", "summer")
    weather_ext_value = payload.get("weather_condition", payload.get("Weather"))

    weather_encoded = _safe_encode(bundle.le_weather, payload["Weather"], "Weather", warnings)
    traffic_encoded = _safe_encode(bundle.le_traffic, payload["Traffic"], "Traffic", warnings)
    vehicle_encoded = _safe_encode(bundle.le_vehicle, payload["Vehicle"], "Vehicle", warnings)
    area_encoded = _safe_encode(bundle.le_area, payload["Area"], "Area", warnings)
    weather_condition_encoded = _safe_encode(
        bundle.le_weather_ext, weather_ext_value, "weather_condition", warnings
    )
    season_encoded = _safe_encode(bundle.le_season, season_value, "season", warnings)

    numeric_frame = pd.DataFrame(
        [
            {
                "Agent_Age": agent_age,
                "Agent_Rating": agent_rating,
                "distance": distance,
                "hour_of_day": hour_of_day,
                "temperature_C": temperature_c,
                "traffic_congestion_index": congestion_index,
                "precipitation_mm": precipitation_mm,
            }
        ]
    )

    scaled_numeric = bundle.delay_scaler.transform(numeric_frame)

    scaled_vals = scaled_numeric[0].tolist()
    value_map = {
        "Agent_Age": scaled_vals[0],
        "Agent_Rating": scaled_vals[1],
        "distance": scaled_vals[2],
        "hour_of_day": scaled_vals[3],
        "temperature_C": scaled_vals[4],
        "traffic_congestion_index": scaled_vals[5],
        "precipitation_mm": scaled_vals[6],
        "Weather_encoded": weather_encoded,
        "Traffic_encoded": traffic_encoded,
        "Vehicle_encoded": vehicle_encoded,
        "Area_encoded": area_encoded,
        "weather_condition_encoded": weather_condition_encoded,
        "peak_hour": peak_hour,
        "weekday": weekday,
        "season_encoded": season_encoded,
    }

    # Respect the model's exact expected feature order and duplicate names, if available.
    expected = getattr(bundle.delay_model, "feature_names_in_", None)
    if expected is not None:
        ordered_columns = [str(col) for col in expected]
    else:
        ordered_columns = [
            "Agent_Age",
            "Agent_Rating",
            "distance",
            "hour_of_day",
            "temperature_C",
            "traffic_congestion_index",
            "precipitation_mm",
            "Weather_encoded",
            "Traffic_encoded",
            "Vehicle_encoded",
            "Area_encoded",
            "weather_condition_encoded",
            "peak_hour",
            "weekday",
            "season_encoded",
        ]

    row = [value_map[col] for col in ordered_columns]
    frame = pd.DataFrame([row], columns=ordered_columns)

    return frame, warnings


def predict_demand(bundle: ModelBundle, payload: Dict[str, Any]) -> Dict[str, Any]:
    x_demand, warnings = preprocess_demand_input(bundle, payload)
    prediction = float(bundle.demand_model.predict(x_demand)[0])

    return {
        "predicted_quantity": round(prediction, 2),
        "warnings": warnings,
    }


def predict_delay(bundle: ModelBundle, payload: Dict[str, Any]) -> Dict[str, Any]:
    x_delay, warnings = preprocess_delay_input(bundle, payload)

    pred_class = int(bundle.delay_model.predict(x_delay)[0])

    delay_probability = None
    if hasattr(bundle.delay_model, "predict_proba"):
        proba = bundle.delay_model.predict_proba(x_delay)[0]
        if len(proba) == 2:
            delay_probability = float(proba[1])
        else:
            delay_probability = float(np.max(proba))

    return {
        "delay_class": pred_class,
        "delay_label": "Yes" if pred_class == 1 else "No",
        "delay_probability": round(delay_probability, 4) if delay_probability is not None else None,
        "warnings": warnings,
    }


def build_scenarios() -> List[Dict[str, Dict[str, Any]]]:
    return [
        {
            "name": "Normal Condition",
            "demand": {
                "order_date": "2026-04-18",
                "product_id": "P101",
                "category": "Electronics",
            },
            "delay": {
                "Agent_Age": 29,
                "Agent_Rating": 4.6,
                "Weather": "Clear",
                "Traffic": "Low",
                "Vehicle": "Bike",
                "Area": "Urban",
                "distance": 4.5,
                "hour_of_day": 11,
                "weekday": 5,
                "temperature_C": 30,
                "traffic_congestion_index": 0.25,
                "precipitation_mm": 0.0,
                "peak_hour": 0,
                "season": "summer",
            },
        },
        {
            "name": "High Risk Condition",
            "demand": {
                "order_date": "2026-09-12",
                "product_id": "P845",
                "category": "Groceries",
            },
            "delay": {
                "Agent_Age": 42,
                "Agent_Rating": 3.7,
                "Weather": "Rain",
                "Traffic": "High",
                "Vehicle": "Motorcycle",
                "Area": "Metropolitan",
                "distance": 18.0,
                "hour_of_day": 18,
                "weekday": 5,
                "temperature_C": 26,
                "traffic_congestion_index": 0.9,
                "precipitation_mm": 7.5,
                "peak_hour": 1,
                "season": "monsoon",
            },
        },
        {
            "name": "Edge Condition",
            "demand": {
                "order_date": "2026-01-01",
                "product_id": "P999",
                "category": "Medicine",
            },
            "delay": {
                "Agent_Age": 19,
                "Agent_Rating": 2.8,
                "Weather": "Storm",
                "Traffic": "High",
                "Vehicle": "Scooter",
                "Area": "Rural",
                "distance": 38.0,
                "hour_of_day": 23,
                "weekday": 0,
                "temperature_C": 5,
                "traffic_congestion_index": 0.98,
                "precipitation_mm": 12.0,
                "peak_hour": 0,
                "season": "winter",
            },
        },
    ]


def validate_variability(results: List[Dict[str, Any]]) -> Dict[str, Any]:
    demand_values = [item["demand"]["predicted_quantity"] for item in results]
    delay_values = [item["delay"]["delay_class"] for item in results]
    delay_probs = [item["delay"]["delay_probability"] for item in results if item["delay"]["delay_probability"] is not None]

    demand_unique = len(set(demand_values))
    delay_unique = len(set(delay_values))

    demand_changes = demand_unique > 1
    delay_changes = delay_unique > 1 or len(set(delay_probs)) > 1

    probability_in_range = all(0.0 <= p <= 1.0 for p in delay_probs)
    demand_non_negative = all(value >= 0 for value in demand_values)
    probabilities_available = len(delay_probs) == len(results)

    return {
        "demand_not_constant": demand_changes,
        "delay_not_constant": delay_changes,
        "delay_probability_in_range": probability_in_range,
        "demand_non_negative": demand_non_negative,
        "delay_probabilities_available": probabilities_available,
        "demand_unique_predictions": demand_unique,
        "delay_unique_classes": delay_unique,
    }


def run_error_handling_checks(bundle: ModelBundle) -> bool:
    print("\nERROR HANDLING CHECKS:")
    all_passed = True

    missing_delay_payload = {
        "Agent_Age": 30,
        "Agent_Rating": 4.3,
        "Weather": "Clear",
        "Vehicle": "Bike",
        "Area": "Urban",
        "distance": 6.0,
        "hour_of_day": 10,
        "weekday": 2,
        "temperature_C": 31,
        "traffic_congestion_index": 0.3,
    }

    invalid_delay_payload = {
        "Agent_Age": 30,
        "Agent_Rating": 4.3,
        "Weather": "Clear",
        "Traffic": "Low",
        "Vehicle": "Bike",
        "Area": "Urban",
        "distance": 6.0,
        "hour_of_day": 35,
        "weekday": 2,
        "temperature_C": 31,
        "traffic_congestion_index": 0.3,
    }

    invalid_demand_payload = {
        "order_date": "2026/04/18",
        "product_id": "P101",
        "category": "Electronics",
    }

    checks = [
        ("Missing delay field", lambda: predict_delay(bundle, missing_delay_payload)),
        ("Invalid delay value", lambda: predict_delay(bundle, invalid_delay_payload)),
        ("Invalid demand date", lambda: predict_demand(bundle, invalid_demand_payload)),
    ]

    for name, func in checks:
        try:
            func()
            print(f"[FAIL] {name}: expected validation error but prediction succeeded.")
            all_passed = False
        except ValueError as exc:
            print(f"[PASS] {name}: {exc}")
        except Exception as exc:
            print(f"[FAIL] {name}: unexpected error type: {exc}")
            all_passed = False

    return all_passed


def collect_error_handling_checks(bundle: ModelBundle) -> Tuple[bool, List[Dict[str, str]]]:
    all_passed = True
    details: List[Dict[str, str]] = []

    missing_delay_payload = {
        "Agent_Age": 30,
        "Agent_Rating": 4.3,
        "Weather": "Clear",
        "Vehicle": "Bike",
        "Area": "Urban",
        "distance": 6.0,
        "hour_of_day": 10,
        "weekday": 2,
        "temperature_C": 31,
        "traffic_congestion_index": 0.3,
    }

    invalid_delay_payload = {
        "Agent_Age": 30,
        "Agent_Rating": 4.3,
        "Weather": "Clear",
        "Traffic": "Low",
        "Vehicle": "Bike",
        "Area": "Urban",
        "distance": 6.0,
        "hour_of_day": 35,
        "weekday": 2,
        "temperature_C": 31,
        "traffic_congestion_index": 0.3,
    }

    invalid_demand_payload = {
        "order_date": "2026/04/18",
        "product_id": "P101",
        "category": "Electronics",
    }

    checks = [
        ("Missing delay field", lambda: predict_delay(bundle, missing_delay_payload)),
        ("Invalid delay value", lambda: predict_delay(bundle, invalid_delay_payload)),
        ("Invalid demand date", lambda: predict_demand(bundle, invalid_demand_payload)),
    ]

    for name, func in checks:
        try:
            func()
            all_passed = False
            details.append({"name": name, "status": "FAIL", "message": "Expected validation error but prediction succeeded."})
        except ValueError as exc:
            details.append({"name": name, "status": "PASS", "message": str(exc)})
        except Exception as exc:
            all_passed = False
            details.append({"name": name, "status": "FAIL", "message": f"Unexpected error type: {exc}"})

    return all_passed, details


def run_single_case(
    base_dir: Path,
    demand_payload: Dict[str, Any],
    delay_payload: Dict[str, Any],
    output_format: str = "text",
) -> int:
    print(f"Loading artifacts from: {base_dir}")
    bundle = load_artifacts(base_dir)

    demand_out = predict_demand(bundle, demand_payload)
    delay_out = predict_delay(bundle, delay_payload)

    if output_format == "json":
        payload = {
            "mode": "single_case",
            "scenario": "Single Custom Case",
            "demand": demand_out,
            "delay": delay_out,
        }
        print(json.dumps(payload, indent=2))
    else:
        print_result_block("Single Custom Case", demand_out, delay_out)
    return 0


def print_result_block(name: str, demand_out: Dict[str, Any], delay_out: Dict[str, Any]) -> None:
    print("-" * 48)
    print(f"SCENARIO: {name}")
    print()
    print("DEMAND PREDICTION:")
    print(f"Predicted Quantity: {demand_out['predicted_quantity']} units")
    if demand_out["warnings"]:
        print(f"Warnings: {demand_out['warnings']}")
    print()
    print("DELAY PREDICTION:")
    print(f"Delay: {delay_out['delay_label']}")
    if delay_out["delay_probability"] is not None:
        print(f"Probability: {delay_out['delay_probability']:.4f}")
    else:
        print("Probability: Not available (model has no predict_proba)")
    if delay_out["warnings"]:
        print(f"Warnings: {delay_out['warnings']}")
    print("-" * 48)


def run_tests(base_dir: Path, output_format: str = "text") -> int:
    print(f"Loading artifacts from: {base_dir}")
    bundle = load_artifacts(base_dir)

    scenarios = build_scenarios()
    all_results: List[Dict[str, Any]] = []

    for scenario in scenarios:
        try:
            demand_out = predict_demand(bundle, scenario["demand"])
            delay_out = predict_delay(bundle, scenario["delay"])
            if output_format != "json":
                print_result_block(scenario["name"], demand_out, delay_out)
            all_results.append({"name": scenario["name"], "demand": demand_out, "delay": delay_out})
        except Exception as exc:
            if output_format == "json":
                print(
                    json.dumps(
                        {
                            "mode": "multi_case",
                            "status": "failed",
                            "failed_scenario": scenario["name"],
                            "error": str(exc),
                        },
                        indent=2,
                    )
                )
            else:
                print("-" * 48)
                print(f"SCENARIO FAILED: {scenario['name']}")
                print(f"Error: {exc}")
                print("-" * 48)
            return 1

    checks = validate_variability(all_results)
    error_checks_passed, error_check_details = collect_error_handling_checks(bundle)

    if output_format == "json":
        payload = {
            "mode": "multi_case",
            "status": "passed" if error_checks_passed else "warning",
            "scenarios": all_results,
            "validation_checks": checks,
            "error_handling_checks": {
                "passed": error_checks_passed,
                "details": error_check_details,
            },
        }
        print(json.dumps(payload, indent=2))
    else:
        run_error_handling_checks(bundle)
        print("VALIDATION CHECKS:")
        print(json.dumps(checks, indent=2))

        if not checks["demand_not_constant"]:
            print("Warning: Demand predictions appear constant across test scenarios.")
        if not checks["delay_not_constant"]:
            print("Warning: Delay predictions appear constant across test scenarios.")
        if not checks["delay_probability_in_range"]:
            print("Warning: Delay probabilities are outside [0,1].")
        if not checks["demand_non_negative"]:
            print("Warning: Demand predictions include negative values.")
        if not checks["delay_probabilities_available"]:
            print("Warning: Delay probabilities are not available for all scenarios.")
        if not error_checks_passed:
            print("Warning: One or more error handling checks failed.")

        print("\nTesting complete.")
    return 0 if error_checks_passed else 1


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Test demand and delay models with realistic scenarios.")
    parser.add_argument(
        "--artifacts-dir",
        type=str,
        default=str(Path(__file__).resolve().parent),
        help="Directory containing model and preprocessor artifact files.",
    )
    parser.add_argument(
        "--single-case",
        action="store_true",
        help="Run one custom test case instead of built-in scenarios.",
    )
    parser.add_argument(
        "--demand-json",
        type=str,
        default=None,
        help=(
            "JSON string for demand input. Example: "
            "'{\"order_date\":\"2026-04-18\",\"product_id\":\"P101\",\"category\":\"Electronics\"}'"
        ),
    )
    parser.add_argument(
        "--delay-json",
        type=str,
        default=None,
        help=(
            "JSON string for delay input. Example: "
            "'{\"Agent_Age\":30,\"Agent_Rating\":4.5,\"Weather\":\"Clear\",\"Traffic\":\"Low\",\"Vehicle\":\"Bike\",\"Area\":\"Urban\",\"distance\":5,\"hour_of_day\":10,\"weekday\":2,\"temperature_C\":30,\"traffic_congestion_index\":0.2}'"
        ),
    )
    parser.add_argument(
        "--case-file",
        type=str,
        default=None,
        help=(
            "Path to JSON file containing {'demand': {...}, 'delay': {...}} for --single-case mode."
        ),
    )
    parser.add_argument(
        "--output-format",
        choices=["text", "json"],
        default="text",
        help="Output mode. Use 'json' for FastAPI/backend integration.",
    )
    return parser.parse_args()


def _parse_single_case_inputs(args: argparse.Namespace) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    if args.case_file:
        case_path = Path(args.case_file).resolve()
        if not case_path.exists():
            raise FileNotFoundError(f"case file not found: {case_path}")

        data = json.loads(case_path.read_text(encoding="utf-8"))
        if not isinstance(data, dict) or "demand" not in data or "delay" not in data:
            raise ValueError("case file must contain keys: 'demand' and 'delay'")

        if not isinstance(data["demand"], dict) or not isinstance(data["delay"], dict):
            raise ValueError("'demand' and 'delay' values in case file must be JSON objects")

        return data["demand"], data["delay"]

    if not args.demand_json or not args.delay_json:
        raise ValueError("--single-case requires both --demand-json and --delay-json, or --case-file")

    demand_payload = json.loads(args.demand_json)
    delay_payload = json.loads(args.delay_json)

    if not isinstance(demand_payload, dict) or not isinstance(delay_payload, dict):
        raise ValueError("--demand-json and --delay-json must each parse to a JSON object")

    return demand_payload, delay_payload


def main() -> None:
    args = parse_args()
    artifacts_dir = Path(args.artifacts_dir).resolve()

    try:
        if args.single_case:
            demand_payload, delay_payload = _parse_single_case_inputs(args)
            exit_code = run_single_case(
                artifacts_dir,
                demand_payload,
                delay_payload,
                output_format=args.output_format,
            )
        else:
            exit_code = run_tests(artifacts_dir, output_format=args.output_format)
    except FileNotFoundError as exc:
        print(f"Artifact loading error: {exc}")
        raise SystemExit(1)
    except json.JSONDecodeError as exc:
        print(f"Invalid JSON input: {exc}")
        raise SystemExit(1)
    except Exception as exc:
        print(f"Unexpected error: {exc}")
        raise SystemExit(1)

    raise SystemExit(exit_code)


if __name__ == "__main__":
    main()
