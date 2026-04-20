from datetime import datetime
import os
from typing import Dict

import requests

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


def _fetch_route_path(start_lat: float, start_lon: float, end_lat: float, end_lon: float) -> Dict[str, object]:
    api_key = os.getenv("OPENROUTESERVICE_API_KEY")
    if not api_key:
        return {
            "route_path": [
                [round(start_lat, 6), round(start_lon, 6)],
                [round(end_lat, 6), round(end_lon, 6)],
            ],
            "route_distance_km": None,
            "route_duration_min": None,
        }

    url = "https://api.openrouteservice.org/v2/directions/driving-car/geojson"
    headers = {
        "Authorization": api_key,
        "Content-Type": "application/json",
    }
    payload = {
        "coordinates": [
            [start_lon, start_lat],
            [end_lon, end_lat],
        ],
    }

    try:
        response = requests.post(url, json=payload, headers=headers, timeout=20)
        response.raise_for_status()
        data = response.json()
        features = data.get("features", [])
        if not features:
            raise ValueError("OpenRouteService returned no route features")

        route_feature = features[0]
        route_summary = route_feature.get("properties", {}).get("summary", {})
        coordinates = route_feature.get("geometry", {}).get("coordinates", [])

        route_path = [
            [float(coord[1]), float(coord[0])]
            for coord in coordinates
            if isinstance(coord, list) and len(coord) >= 2
        ]

        if len(route_path) < 2:
            route_path = [
                [round(start_lat, 6), round(start_lon, 6)],
                [round(end_lat, 6), round(end_lon, 6)],
            ]

        return {
            "route_path": route_path,
            "route_distance_km": float(route_summary.get("distance", 0.0)) / 1000.0,
            "route_duration_min": float(route_summary.get("duration", 0.0)) / 60.0,
        }
    except Exception:
        return {
            "route_path": [
                [round(start_lat, 6), round(start_lon, 6)],
                [round(end_lat, 6), round(end_lon, 6)],
            ],
            "route_distance_km": None,
            "route_duration_min": None,
        }


def analyze_route_fallback(payload: Dict[str, object]) -> Dict[str, object]:
    weather = normalize_weather(str(payload.get("weather", "")))
    traffic = normalize_traffic(str(payload.get("traffic", "")))
    vehicle = normalize_vehicle(str(payload.get("vehicle", "")))
    parse_iso_timestamp(str(payload.get("timestamp", "")))

    start_lat = float(payload["start_lat"])
    start_lon = float(payload["start_lon"])
    end_lat = float(payload["end_lat"])
    end_lon = float(payload["end_lon"])

    route_data = _fetch_route_path(start_lat, start_lon, end_lat, end_lon)
    route_path = route_data["route_path"]

    distance_km = route_data["route_distance_km"]
    if distance_km is None:
        distance_km = haversine_distance_km(start_lat, start_lon, end_lat, end_lon)

    free_flow_speed_map = {
        "Bike": 40.0,
        "Scooter": 44.0,
        "Car": 52.0,
        "Van": 46.0,
        "Truck": 36.0,
    }
    free_flow_speed = free_flow_speed_map.get(vehicle, 42.0)
    base_time_min = (distance_km / max(free_flow_speed, 8.0)) * 60.0

    traffic_time_min = estimate_travel_minutes(distance_km, traffic, vehicle)

    traffic_speed_map = {
        "Low": 46.0,
        "Medium": 32.0,
        "High": 18.0,
    }
    traffic_speed = traffic_speed_map.get(traffic, 32.0)

    weather_temp_adjust = {
        "Clear": 31.0,
        "Fog": 24.0,
        "Rain": 22.0,
        "Storm": 20.0,
        "Thunderstorm": 19.0,
    }
    temperature = weather_temp_adjust.get(weather, 27.0)

    traffic_time_by_speed = (distance_km / max(traffic_speed, 8.0)) * 60.0
    traffic_time_min = max(traffic_time_min, traffic_time_by_speed)
    final_time_min = (base_time_min * 0.35) + (traffic_time_min * 0.65)

    if traffic == "High":
        congestion_level = "high"
    elif traffic == "Medium":
        congestion_level = "medium"
    else:
        congestion_level = "low"

    risk = _risk_from_conditions(traffic, weather)

    return {
        "start_location": {
            "lat": round(start_lat, 6),
            "lon": round(start_lon, 6),
        },
        "destination": {
            "lat": round(end_lat, 6),
            "lon": round(end_lon, 6),
        },
        "distance_km": round(distance_km, 2),
        "estimated_time_min": round(base_time_min, 2),
        "traffic_time_min": round(traffic_time_min, 2),
        "final_time_min": round(final_time_min, 2),
        "traffic_speed": round(traffic_speed, 2),
        "congestion_level": congestion_level,
        "temperature": round(temperature, 2),
        "traffic": traffic,
        "weather": weather,
        "risk": risk,
        "route_path": route_path,
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
    weather = normalize_weather(str(payload.get("weather", payload.get("Weather", ""))))
    traffic = normalize_traffic(str(payload.get("traffic", payload.get("Traffic", ""))))
    vehicle = normalize_vehicle(str(payload.get("vehicle", payload.get("Vehicle", ""))))
    area_value = payload.get("area", payload.get("Area", "Urban"))
    area = normalize_text(str(area_value)).title()
    distance = float(payload["distance"])
    hour_value = payload.get("hour_of_day", 12)
    weekday_value = payload.get("weekday", 0)
    hour_of_day = 12 if hour_value in (None, "") else int(hour_value)
    weekday = 0 if weekday_value in (None, "") else int(weekday_value)

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
