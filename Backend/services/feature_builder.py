import math
from datetime import datetime
from typing import Any, Dict, List


def haversine_distance_km(start_lat: float, start_lon: float, end_lat: float, end_lon: float) -> float:
    earth_radius_km = 6371.0

    lat1 = math.radians(start_lat)
    lon1 = math.radians(start_lon)
    lat2 = math.radians(end_lat)
    lon2 = math.radians(end_lon)

    delta_lat = lat2 - lat1
    delta_lon = lon2 - lon1

    a = (
        math.sin(delta_lat / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin(delta_lon / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    return earth_radius_km * c


def estimate_travel_minutes(distance_km: float, traffic: str, vehicle: str) -> float:
    base_speed_kmh = {
        "Low": 52.0,
        "Medium": 38.0,
        "High": 24.0,
    }.get(traffic, 38.0)

    vehicle_factor = {
        "Bike": 0.8,
        "Scooter": 0.95,
        "Car": 1.0,
        "Van": 0.9,
        "Truck": 0.82,
    }.get(vehicle, 1.0)

    adjusted_speed = max(base_speed_kmh * vehicle_factor, 8.0)
    return (distance_km / adjusted_speed) * 60.0


def calculate_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    earth_radius_km = 6371.0

    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)

    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlon / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    return earth_radius_km * c


def build_delay_features(data: Dict[str, Any]) -> List[Any]:
    features = [
        data.get("Agent_Age", 30),
        data.get("Agent_Rating", 4.5),
        data.get("distance", 5.0),
        data.get("hour_of_day", 12),
        data.get("weekday", 2),
        data.get("temperature_C", 30),
        data.get("weather", "Clear"),
        data.get("traffic", "Medium"),
        data.get("vehicle", "Bike"),
        data.get("area", "Urban"),
    ]

    return features


def build_demand_features(data: Dict[str, Any]) -> List[Any]:
    features = [
        data.get("product_id", 0),
        data.get("category", "General"),
        data.get("month", 1),
        data.get("day", 1),
        data.get("weekday", 0),
    ]

    return features


def prepare_demand_input(data: Dict[str, Any]) -> List[Any]:
    payload = dict(data)

    if payload.get("order_date") not in (None, ""):
        raw = str(payload["order_date"]).strip().split("T", 1)[0]
        dt = datetime.strptime(raw, "%Y-%m-%d")
        payload["month"] = dt.month
        payload["day"] = dt.day
        payload["weekday"] = dt.weekday()

    return build_demand_features(payload)


def prepare_delay_input(data: Dict[str, Any]) -> List[Any]:
    payload = dict(data)

    coordinate_keys = ["start_lat", "start_lon", "end_lat", "end_lon"]
    has_complete_coordinates = all(
        payload.get(k) not in (None, "")
        for k in coordinate_keys
    )

    if has_complete_coordinates:
        payload["distance"] = calculate_distance(
            float(payload["start_lat"]),
            float(payload["start_lon"]),
            float(payload["end_lat"]),
            float(payload["end_lon"]),
        )

    return build_delay_features(payload)
