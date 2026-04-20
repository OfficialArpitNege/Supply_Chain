import os
from pathlib import Path
from typing import Any, Dict, Optional

import requests
from dotenv import load_dotenv


load_dotenv(Path(__file__).resolve().parents[1] / ".env")


def _require_api_key(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def _safe_get(url: str) -> Dict[str, Any]:
    response = requests.get(url, timeout=20)
    response.raise_for_status()
    return response.json()


def _safe_post(url: str, body: Dict[str, Any], headers: Dict[str, str]) -> Dict[str, Any]:
    response = requests.post(url, json=body, headers=headers, timeout=20)
    response.raise_for_status()
    return response.json()


def _congestion_from_speed(current_speed: float, free_flow_speed: float) -> str:
    if free_flow_speed <= 0:
        return "low"

    ratio = current_speed / free_flow_speed
    if ratio < 0.5:
        return "high"
    if ratio < 0.8:
        return "medium"
    return "low"


def _calculate_risk(weather_main: str, congestion_level: str) -> str:
    is_bad_weather = weather_main in {"Rain", "Storm", "Thunderstorm"}

    if is_bad_weather and congestion_level == "high":
        return "HIGH"
    if is_bad_weather or congestion_level == "medium":
        return "MEDIUM"
    return "LOW"


def analyze_route_live(start_lat: float, start_lon: float, end_lat: float, end_lon: float) -> Dict[str, Any]:
    weather_key = _require_api_key("OPENWEATHER_API_KEY")
    ors_key = _require_api_key("OPENROUTESERVICE_API_KEY")
    tomtom_key = _require_api_key("TOMTOM_API_KEY")

    weather_url = (
        "https://api.openweathermap.org/data/2.5/weather"
        f"?lat={end_lat}&lon={end_lon}&appid={weather_key}&units=metric"
    )
    weather_data = _safe_get(weather_url)

    ors_url = "https://api.openrouteservice.org/v2/directions/driving-car/geojson"
    ors_headers = {
        "Authorization": ors_key,
        "Content-Type": "application/json",
    }
    ors_body = {
        "coordinates": [
            [start_lon, start_lat],
            [end_lon, end_lat],
        ],
    }
    route_data = _safe_post(ors_url, ors_body, ors_headers)

    features = route_data.get("features", [])
    if not features:
        raise RuntimeError("No route found from OpenRouteService.")

    route_feature = features[0]
    route_summary = route_feature.get("properties", {}).get("summary", {})
    route_coordinates = route_feature.get("geometry", {}).get("coordinates", [])

    if route_coordinates:
        midpoint_idx = len(route_coordinates) // 2
        midpoint_lon = float(route_coordinates[midpoint_idx][0])
        midpoint_lat = float(route_coordinates[midpoint_idx][1])
    else:
        midpoint_lat = end_lat
        midpoint_lon = end_lon

    tomtom_url = (
        "https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json"
        f"?point={midpoint_lat},{midpoint_lon}&key={tomtom_key}"
    )
    traffic_data = _safe_get(tomtom_url)

    weather_items = weather_data.get("weather", [])
    if isinstance(weather_items, list) and weather_items:
        weather_main = str(weather_items[0].get("main", "Unknown"))
    else:
        weather_main = "Unknown"

    temperature = float(weather_data.get("main", {}).get("temp", 0.0))

    distance_m = float(route_summary.get("distance", 0.0))
    duration_s = float(route_summary.get("duration", 0.0))
    distance_km = distance_m / 1000.0
    estimated_time_min = duration_s / 60.0

    flow_data = traffic_data.get("flowSegmentData", {})
    current_speed = float(flow_data.get("currentSpeed", 0.0) or 0.0)
    free_flow_speed = float(flow_data.get("freeFlowSpeed", 0.0) or 0.0)
    congestion_level = _congestion_from_speed(current_speed, free_flow_speed)

    if current_speed > 0:
      traffic_time_min = distance_km / (current_speed / 60.0)
      final_time_min = (estimated_time_min * 0.4) + (traffic_time_min * 0.6)
    else:
      traffic_time_min = estimated_time_min
      final_time_min = estimated_time_min

    risk = _calculate_risk(weather_main, congestion_level)

    route_path = [
        [float(coord[1]), float(coord[0])]
        for coord in route_coordinates
        if isinstance(coord, list) and len(coord) >= 2
    ]

    if len(route_path) < 2:
        route_path = [
            [round(start_lat, 6), round(start_lon, 6)],
            [round(end_lat, 6), round(end_lon, 6)],
        ]

    return {
        "start_location": {
            "lat": round(start_lat, 6),
            "lon": round(start_lon, 6),
        },
        "destination": {
            "lat": round(end_lat, 6),
            "lon": round(end_lon, 6),
        },
        "weather": weather_main,
        "temperature": round(temperature, 2),
        "distance_km": round(distance_km, 2),
        "estimated_time_min": round(estimated_time_min, 2),
        "traffic_time_min": round(traffic_time_min, 2),
        "final_time_min": round(final_time_min, 2),
        "traffic_speed": round(current_speed, 2),
        "congestion_level": congestion_level,
        "traffic": congestion_level.title(),
        "risk": risk,
        "route_path": route_path,
    }
