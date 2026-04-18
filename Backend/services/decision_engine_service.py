from typing import Any, Dict, List, Optional


RISK_TO_SCORE = {
    "LOW": 1,
    "MEDIUM": 2,
    "HIGH": 3,
}


def _normalize_text(value: Optional[str]) -> str:
    if value is None:
        return ""
    return str(value).strip().lower()


def _to_float(value: Any, field_name: str) -> float:
    try:
        return float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{field_name} must be a number") from exc


def _to_int(value: Any, field_name: str) -> int:
    try:
        return int(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{field_name} must be an integer") from exc


def normalize_weather_risk(weather_condition: str) -> str:
    weather = _normalize_text(weather_condition)

    if weather in {"clear", "sunny"}:
        return "LOW"
    if weather in {"haze", "clouds", "cloudy", "mist", "fog"}:
        return "MEDIUM"
    if weather in {"rain", "storm", "thunderstorm", "snow", "drizzle"}:
        return "HIGH"
    return "MEDIUM"


def _traffic_risk_from_speed(traffic_speed: float) -> str:
    if traffic_speed > 40:
        return "LOW"
    if traffic_speed >= 20:
        return "MEDIUM"
    return "HIGH"


def _congestion_override(congestion_level: str) -> Optional[str]:
    clean = _normalize_text(congestion_level)
    mapping = {
        "low": "LOW",
        "medium": "MEDIUM",
        "high": "HIGH",
    }
    return mapping.get(clean)


def normalize_traffic_risk(traffic_speed: float, congestion_level: str) -> str:
    speed_risk = _traffic_risk_from_speed(traffic_speed)
    override = _congestion_override(congestion_level)
    return override or speed_risk


def normalize_delay_risk(delay_probability: float) -> str:
    if delay_probability < 0.0 or delay_probability > 1.0:
        raise ValueError("delay_probability must be between 0 and 1")

    if delay_probability <= 0.3:
        return "LOW"
    if delay_probability <= 0.7:
        return "MEDIUM"
    return "HIGH"


def normalize_demand_risk(predicted_demand: str) -> str:
    demand = _normalize_text(predicted_demand).upper()
    if demand not in RISK_TO_SCORE:
        raise ValueError("predicted_demand must be one of LOW, MEDIUM, HIGH")
    return demand


def calculate_final_time(distance_km: float, estimated_time_min: float, traffic_speed: float) -> float:
    if distance_km < 0:
        raise ValueError("distance_km must be >= 0")
    if estimated_time_min < 0:
        raise ValueError("estimated_time_min must be >= 0")
    if traffic_speed <= 0:
        raise ValueError("traffic_speed must be > 0")

    traffic_time = distance_km / (traffic_speed / 60.0)
    final_time = (estimated_time_min * 0.4) + (traffic_time * 0.6)
    return round(final_time, 2)


def _weighted_score(traffic: str, delay: str, weather: str, demand: str) -> float:
    final_score = (
        (RISK_TO_SCORE[traffic] * 0.30)
        + (RISK_TO_SCORE[delay] * 0.30)
        + (RISK_TO_SCORE[weather] * 0.20)
        + (RISK_TO_SCORE[demand] * 0.20)
    )
    return round(final_score, 2)


def _risk_from_score(final_score: float) -> str:
    if final_score <= 1.5:
        return "LOW"
    if final_score <= 2.3:
        return "MEDIUM"
    return "HIGH"


def _build_insights(
    weather_risk: str,
    traffic_risk: str,
    demand_risk: str,
    delay_risk: str,
    final_time: float,
    estimated_time_min: float,
) -> List[str]:
    insights: List[str] = []

    if traffic_risk == "HIGH":
        insights.append("Heavy traffic is increasing delivery time")
    elif traffic_risk == "MEDIUM":
        insights.append("Traffic conditions are moderate and may slow delivery")

    if weather_risk == "HIGH":
        insights.append("Bad weather conditions detected")
    elif weather_risk == "MEDIUM":
        insights.append("Weather visibility may affect route stability")

    if demand_risk == "HIGH":
        insights.append("High demand may cause dispatch pressure")

    if delay_risk == "HIGH":
        insights.append("Model predicts high delay probability")

    if final_time > estimated_time_min * 1.15:
        insights.append("Adjusted travel time is significantly above baseline")

    if not insights:
        insights.append("Operational conditions are stable for this shipment")

    return insights[:2]


def _recommendation(risk: str) -> str:
    if risk == "LOW":
        return "Proceed with normal delivery"
    if risk == "MEDIUM":
        return "Monitor route and consider alternative path"
    return "High delay risk - reroute or delay delivery"


def evaluate_logistics_decision(input_data: Dict[str, Any]) -> Dict[str, Any]:
    weather_condition = str(input_data.get("weather_condition", ""))
    temperature = _to_float(input_data.get("temperature", 0), "temperature")
    distance_km = _to_float(input_data.get("distance_km", 0), "distance_km")
    estimated_time_min = _to_float(input_data.get("estimated_time_min", 0), "estimated_time_min")
    traffic_speed = _to_float(input_data.get("traffic_speed", 0), "traffic_speed")
    congestion_level = str(input_data.get("congestion_level", ""))
    predicted_demand = str(input_data.get("predicted_demand", ""))
    delay_probability = _to_float(input_data.get("delay_probability", 0), "delay_probability")

    peak_hour = _to_int(input_data.get("peak_hour", 0), "peak_hour")
    if peak_hour not in {0, 1}:
        raise ValueError("peak_hour must be 0 or 1")

    weekday = _to_int(input_data.get("weekday", 0), "weekday")
    if weekday < 0 or weekday > 6:
        raise ValueError("weekday must be between 0 and 6")

    _ = _normalize_text(input_data.get("season"))

    weather_risk = normalize_weather_risk(weather_condition)
    traffic_risk = normalize_traffic_risk(traffic_speed, congestion_level)
    delay_risk = normalize_delay_risk(delay_probability)
    demand_risk = normalize_demand_risk(predicted_demand)

    final_time = calculate_final_time(distance_km, estimated_time_min, traffic_speed)
    final_score = _weighted_score(traffic_risk, delay_risk, weather_risk, demand_risk)
    final_risk = _risk_from_score(final_score)

    insights = _build_insights(
        weather_risk=weather_risk,
        traffic_risk=traffic_risk,
        demand_risk=demand_risk,
        delay_risk=delay_risk,
        final_time=final_time,
        estimated_time_min=estimated_time_min,
    )

    return {
        "risk": final_risk,
        "score": final_score,
        "final_time_min": final_time,
        "factors": {
            "weather": weather_risk,
            "traffic": traffic_risk,
            "demand": demand_risk,
            "delay_prediction": delay_risk,
        },
        "insights": insights,
        "recommendation": _recommendation(final_risk),
        "context": {
            "temperature": round(temperature, 2),
            "peak_hour": peak_hour,
            "weekday": weekday,
        },
    }
