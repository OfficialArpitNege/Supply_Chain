from datetime import datetime
from typing import Dict

from Backend.services.feature_builder import estimate_travel_minutes, haversine_distance_km
from Backend.services.preprocessing import (
    normalize_text,
    normalize_traffic,
    normalize_vehicle,
    normalize_weather,
    parse_iso_timestamp,
    parse_order_date,
)
from Backend.utils.helpers import clamp


def _risk_from_conditions(traffic: str, weather: str) -> str:
    adverse_weather = {"Rain", "Storm", "Thunderstorm"}

    if traffic == "High" and weather in adverse_weather:
        return "HIGH"
    if traffic == "High" or weather in adverse_weather:
        return "MEDIUM"
    return "LOW"


def analyze_route_fallback(payload: Dict[str, object]) -> Dict[str, object]:
    weather = normalize_weather(str(payload.get("weather", "")))
    traffic = normalize_traffic(str(payload.get("traffic", "")))
    vehicle = normalize_vehicle(str(payload.get("vehicle", "")))
    parse_iso_timestamp(str(payload.get("timestamp", "")))

    start_lat = float(payload["start_lat"])
    start_lon = float(payload["start_lon"])
    end_lat = float(payload["end_lat"])
    end_lon = float(payload["end_lon"])

    distance_km = haversine_distance_km(start_lat, start_lon, end_lat, end_lon)
    estimated_time_min = estimate_travel_minutes(distance_km, traffic, vehicle)
    risk = _risk_from_conditions(traffic, weather)

    return {
        "distance_km": round(distance_km, 2),
        "estimated_time_min": round(estimated_time_min, 2),
        "traffic": traffic,
        "weather": weather,
        "risk": risk,
    }


def predict_demand_fallback(payload: Dict[str, object]) -> Dict[str, float]:
    product_id = int(payload["product_id"])
    category = normalize_text(str(payload.get("category", ""))).lower()
    order_date = parse_order_date(str(payload.get("order_date", "")))

    base_by_category = {
        "grocery": 115.0,
        "electronics": 70.0,
        "fashion": 85.0,
        "pharma": 92.0,
    }
    base = base_by_category.get(category, 78.0)

    weekday_factor = 1.10 if order_date.weekday() >= 5 else 1.0
    month_factor = 1.12 if order_date.month in (10, 11, 12) else 1.0
    product_variance = 1.0 + ((product_id % 9) * 0.015)

    predicted = base * weekday_factor * month_factor * product_variance

    return {"predicted_demand": round(max(predicted, 1.0), 2)}


def predict_delay_fallback(payload: Dict[str, object]) -> Dict[str, float]:
    agent_age = int(payload["Agent_Age"])
    agent_rating = float(payload["Agent_Rating"])
    weather = normalize_weather(str(payload.get("weather", "")))
    traffic = normalize_traffic(str(payload.get("traffic", "")))
    vehicle = normalize_vehicle(str(payload.get("vehicle", "")))
    area = normalize_text(str(payload.get("area", ""))).title()
    distance = float(payload["distance"])
    hour_of_day = int(payload["hour_of_day"])
    weekday = int(payload["weekday"])

    score = 0.18

    if agent_age < 21 or agent_age > 50:
        score += 0.07

    if agent_rating < 3.0:
        score += 0.22
    elif agent_rating < 4.0:
        score += 0.12

    if weather in {"Rain", "Storm", "Thunderstorm"}:
        score += 0.24

    if traffic == "High":
        score += 0.28
    elif traffic == "Medium":
        score += 0.13

    if vehicle in {"Bike", "Scooter"}:
        score += 0.10

    if area in {"Metro", "Urban"}:
        score += 0.09

    score += min(max(distance, 0.0) / 120.0, 0.20)

    if hour_of_day in (8, 9, 10, 17, 18, 19, 20):
        score += 0.10

    if weekday in (5, 6):
        score += 0.05

    confidence = clamp(score, 0.05, 0.99)
    delay = 1 if confidence >= 0.50 else 0

    return {
        "delay": delay,
        "confidence": round(confidence, 3),
    }
