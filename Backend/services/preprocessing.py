from datetime import date, datetime
from typing import Any, Dict


weather_map = {
    "haze": "Fog",
    "mist": "Fog",
    "smoke": "Fog",
    "clear sky": "Clear",
    "sunny": "Clear",
    "rainy": "Rain",
    "drizzle": "Rain",
}


traffic_map = {
    "low": "Low",
    "medium": "Medium",
    "moderate": "Medium",
    "high": "High",
    "heavy": "High",
}


vehicle_map = {
    "bike": "Bike",
    "bicycle": "Bike",
    "car": "Car",
    "truck": "Truck",
}


VALID_TRAFFIC_LEVELS = {"low", "medium", "high"}


VEHICLE_ALIASES = {
    "bike": "Bike",
    "bicycle": "Bike",
    "scooter": "Scooter",
    "motorbike": "Scooter",
    "car": "Car",
    "van": "Van",
    "truck": "Truck",
}


def normalize_text(value: str) -> str:
    cleaned = (value or "").strip()
    if not cleaned:
        raise ValueError("Input value cannot be empty.")
    return cleaned


def handle_missing(data: Dict[str, Any]) -> Dict[str, Any]:
    defaults = {
        "weather": "Clear",
        "traffic": "Medium",
        "vehicle": "Bike",
        "area": "Urban",
    }

    output = dict(data)
    for key, value in defaults.items():
        if key not in output or output[key] is None or str(output[key]).strip() == "":
            output[key] = value

    return output


def normalize_input(data: Dict[str, Any]) -> Dict[str, Any]:
    output = dict(data)

    output["weather"] = str(output.get("weather", "")).strip().lower()
    output["traffic"] = str(output.get("traffic", "")).strip().lower()
    output["vehicle"] = str(output.get("vehicle", "")).strip().lower()

    output["weather"] = weather_map.get(output["weather"], "Clear")
    output["traffic"] = traffic_map.get(output["traffic"], "Medium")
    output["vehicle"] = vehicle_map.get(output["vehicle"], "Bike")
    output["area"] = str(output.get("area", "Urban")).strip().title() or "Urban"

    return output


def extract_time_features(data: Dict[str, Any]) -> Dict[str, Any]:
    output = dict(data)
    if "timestamp" in output and output["timestamp"] not in (None, ""):
        ts = str(output["timestamp"]).strip().replace("Z", "+00:00")
        dt = datetime.fromisoformat(ts)
        output["hour_of_day"] = dt.hour
        output["weekday"] = dt.weekday()

    return output


def preprocess(data: Dict[str, Any]) -> Dict[str, Any]:
    output = handle_missing(data)
    output = normalize_input(output)
    output = extract_time_features(output)
    return output


def normalize_weather(weather: str) -> str:
    value = normalize_text(weather).lower()
    return weather_map.get(value, "Clear")


def normalize_traffic(traffic: str) -> str:
    cleaned = normalize_text(traffic).lower()
    mapped = traffic_map.get(cleaned, "Medium")
    if mapped.lower() not in VALID_TRAFFIC_LEVELS:
        raise ValueError("Traffic must be one of: low, medium, high.")
    return mapped


def normalize_vehicle(vehicle: str) -> str:
    cleaned = normalize_text(vehicle).lower()
    if cleaned in vehicle_map:
        return vehicle_map[cleaned]
    return VEHICLE_ALIASES.get(cleaned, "Bike")


def parse_iso_timestamp(value: str) -> datetime:
    cleaned = normalize_text(value)
    normalized = cleaned.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(normalized)
    except ValueError as exc:
        raise ValueError("timestamp must be a valid ISO-8601 datetime string.") from exc


def parse_order_date(value: str) -> date:
    cleaned = normalize_text(value)
    normalized = cleaned.split("T", 1)[0]
    try:
        return date.fromisoformat(normalized)
    except ValueError as exc:
        raise ValueError("order_date must be a valid date string (YYYY-MM-DD).") from exc
