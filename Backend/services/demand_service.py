from datetime import datetime
from typing import Any, Dict, Optional

from joblib import load

# future
# demand_model = load("models/demand_model.pkl")


def _normalize_text(value: Optional[str]) -> str:
    if value is None:
        return ""
    return str(value).strip().lower()


def _extract_day_of_week(date_str: str) -> str:
    parsed_date = datetime.strptime(date_str, "%Y-%m-%d")
    return parsed_date.strftime("%A").lower()


def predict_demand(input_data: Dict[str, Any]) -> Dict[str, Any]:
    product_id = str(input_data.get("product_id", "")).strip().upper()
    date_str = _normalize_text(input_data.get("date"))
    day_of_week = _normalize_text(input_data.get("day_of_week"))
    season = _normalize_text(input_data.get("season"))

    if date_str:
        try:
            day_of_week = _extract_day_of_week(date_str)
        except ValueError as exc:
            raise ValueError("date must be in YYYY-MM-DD format") from exc

    if not day_of_week:
        raise ValueError("Either date or day_of_week is required")

    weekend_days = {"saturday", "sunday"}
    high_seasons = {"winter", "festive", "holiday"}
    medium_seasons = {"monsoon", "summer"}

    score = 0.45

    if day_of_week in weekend_days:
        score += 0.15
    else:
        score += 0.05

    if season in high_seasons:
        score += 0.2
    elif season in medium_seasons:
        score += 0.1

    if product_id.startswith("P1"):
        score += 0.1
    elif product_id.startswith("P9"):
        score -= 0.05

    score = max(0.05, min(score, 0.95))

    if score >= 0.75:
        demand = "HIGH"
    elif score >= 0.55:
        demand = "MEDIUM"
    else:
        demand = "LOW"

    return {
        "product_id": product_id,
        "predicted_demand": demand,
        "confidence": round(score, 2),
        "derived_day_of_week": day_of_week,
    }
