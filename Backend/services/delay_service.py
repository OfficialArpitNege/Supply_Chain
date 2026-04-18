from typing import Any, Dict, Optional

from joblib import load

# future
# delay_model = load("models/delay_model.pkl")


def _normalize_text(value: Optional[str]) -> str:
    if value is None:
        return ""
    return str(value).strip().lower()


def _to_float(value: Any, fallback: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return fallback


def _to_int(value: Any, fallback: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return fallback


def _normalize_congestion(value: str) -> str:
    numeric = _to_float(value, fallback=-1.0)
    if numeric >= 0:
        if numeric >= 0.7:
            return "high"
        if numeric >= 0.4:
            return "medium"
        return "low"

    clean = _normalize_text(value)
    if clean in {"high", "medium", "low"}:
        return clean
    return "low"


def predict_delay(input_data: Dict[str, Any]) -> Dict[str, Any]:
    weather_condition = _normalize_text(input_data.get("weather_condition"))
    temperature = _to_float(input_data.get("temperature"))
    traffic_congestion = _normalize_congestion(str(input_data.get("traffic_congestion", "")))
    precipitation = _to_float(input_data.get("precipitation"))
    peak_hour = 1 if _to_int(input_data.get("peak_hour")) == 1 else 0
    weekday = _normalize_text(input_data.get("weekday"))
    season = _normalize_text(input_data.get("season"))

    score = 0.2

    if weather_condition in {"rain", "storm", "thunderstorm", "snow"}:
        score += 0.35
    elif weather_condition in {"mist", "fog", "haze"}:
        score += 0.1

    if temperature >= 40 or temperature <= 5:
        score += 0.08

    if precipitation > 0:
        score += 0.12

    if traffic_congestion == "high":
        score += 0.3
    elif traffic_congestion == "medium":
        score += 0.15

    if peak_hour == 1:
        score += 0.12

    if weekday in {"monday", "friday"}:
        score += 0.05

    if season in {"monsoon", "winter"}:
        score += 0.06

    probability = max(0.05, min(score, 0.95))

    if probability >= 0.75:
        delay_risk = "HIGH"
    elif probability >= 0.5:
        delay_risk = "MEDIUM"
    else:
        delay_risk = "LOW"

    return {
        "delay_risk": delay_risk,
        "probability": round(probability, 2),
        "normalized_inputs": {
            "weather_condition": weather_condition or "unknown",
            "temperature": round(temperature, 2),
            "traffic_congestion": traffic_congestion,
            "precipitation": round(precipitation, 2),
            "peak_hour": peak_hour,
            "weekday": weekday or "unknown",
            "season": season or "unknown",
        },
    }
