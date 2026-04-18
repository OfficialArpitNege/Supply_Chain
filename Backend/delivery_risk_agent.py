import argparse
import json
import os
from dataclasses import dataclass
from typing import Any, Dict, Optional, Tuple
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from dotenv import load_dotenv

load_dotenv()


@dataclass
class WeatherResult:
    summary: str
    bad_weather: bool


@dataclass
class RouteResult:
    distance_km: float
    estimated_time_min: float


@dataclass
class TrafficResult:
    level: str
    congestion: bool
    delay_min: float


def _http_get_json(url: str, headers: Optional[Dict[str, str]] = None, timeout: int = 20) -> Dict[str, Any]:
    request = Request(url, headers=headers or {})
    try:
        with urlopen(request, timeout=timeout) as response:
            payload = response.read().decode("utf-8")
            return json.loads(payload)
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"HTTP {exc.code} from {url}: {detail}") from exc
    except URLError as exc:
        raise RuntimeError(f"Network error while calling {url}: {exc.reason}") from exc


def _http_post_json(url: str, data: Dict[str, Any], headers: Dict[str, str], timeout: int = 20) -> Dict[str, Any]:
    body = json.dumps(data).encode("utf-8")
    request = Request(url, data=body, headers=headers, method="POST")
    try:
        with urlopen(request, timeout=timeout) as response:
            payload = response.read().decode("utf-8")
            return json.loads(payload)
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"HTTP {exc.code} from {url}: {detail}") from exc
    except URLError as exc:
        raise RuntimeError(f"Network error while calling {url}: {exc.reason}") from exc


def fetch_weather(lat: float, lon: float, api_key: str) -> WeatherResult:
    params = urlencode({"lat": lat, "lon": lon, "appid": api_key, "units": "metric"})
    url = f"https://api.openweathermap.org/data/2.5/weather?{params}"
    data = _http_get_json(url)

    weather_items = data.get("weather", [])
    main_conditions = [item.get("main", "") for item in weather_items if isinstance(item, dict)]
    description = ", ".join([item.get("description", "") for item in weather_items if isinstance(item, dict)]).strip(", ")

    wind_speed = float(data.get("wind", {}).get("speed", 0.0)) if isinstance(data.get("wind"), dict) else 0.0
    condition_set = {cond.lower() for cond in main_conditions}

    rain_or_storm = any(cond in {"rain", "thunderstorm", "drizzle"} for cond in condition_set)
    extreme_weather = any(cond in {"snow", "squall", "tornado", "ash", "dust", "sand", "smoke"} for cond in condition_set)
    high_wind = wind_speed >= 12.0

    bad_weather = rain_or_storm or extreme_weather or high_wind

    summary_parts = []
    if description:
        summary_parts.append(description)
    if high_wind:
        summary_parts.append(f"high wind ({wind_speed:.1f} m/s)")
    summary = "; ".join(summary_parts) if summary_parts else "clear"

    return WeatherResult(summary=summary, bad_weather=bad_weather)


def fetch_route(start_lat: float, start_lon: float, end_lat: float, end_lon: float, api_key: str) -> RouteResult:
    url = "https://api.openrouteservice.org/v2/directions/driving-car"
    headers = {
        "Authorization": api_key,
        "Content-Type": "application/json",
    }
    payload = {
        "coordinates": [
            [start_lon, start_lat],
            [end_lon, end_lat],
        ]
    }

    data = _http_post_json(url, payload, headers=headers)

    routes = data.get("routes", [])
    if not routes:
        raise RuntimeError("OpenRouteService returned no routes.")

    summary = routes[0].get("summary", {})
    distance_m = float(summary.get("distance", 0.0))
    duration_s = float(summary.get("duration", 0.0))

    return RouteResult(distance_km=distance_m / 1000.0, estimated_time_min=duration_s / 60.0)


def fetch_traffic(lat: float, lon: float, api_key: str, estimated_time_min: float) -> TrafficResult:
    params = urlencode({"point": f"{lat},{lon}", "unit": "KMPH", "key": api_key})
    url = f"https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json?{params}"
    data = _http_get_json(url)

    flow = data.get("flowSegmentData", {}) if isinstance(data, dict) else {}
    current_speed = float(flow.get("currentSpeed", 0.0) or 0.0)
    free_flow_speed = float(flow.get("freeFlowSpeed", 0.0) or 0.0)

    ratio = (current_speed / free_flow_speed) if free_flow_speed > 0 else 1.0

    if ratio < 0.5:
        level = "high"
    elif ratio < 0.8:
        level = "medium"
    else:
        level = "low"

    congestion = ratio < 0.8

    if current_speed <= 0:
        delay = estimated_time_min
    elif free_flow_speed <= 0:
        delay = 0.0
    else:
        delay_factor = max((free_flow_speed / current_speed) - 1.0, 0.0)
        delay = estimated_time_min * delay_factor

    return TrafficResult(level=level, congestion=congestion, delay_min=delay)


def assess_risk(weather: WeatherResult, traffic: TrafficResult) -> Tuple[str, str, str]:
    if weather.bad_weather and traffic.level == "high":
        risk = "HIGH"
        reason = "Bad weather and heavy traffic together can cause major delays and safety risks."
        suggestion = "Use an alternate route, delay dispatch if possible, and notify the customer."
    elif weather.bad_weather or traffic.level == "medium":
        risk = "MEDIUM"
        reason = "Either weather or traffic may slow delivery, but conditions are still manageable."
        suggestion = "Monitor live route updates and keep a small buffer in delivery time."
    else:
        risk = "LOW"
        reason = "Weather and traffic conditions are favorable for on-time delivery."
        suggestion = "Proceed with the planned route."

    return risk, reason, suggestion


def analyze_delivery_conditions(
    start_lat: float,
    start_lon: float,
    end_lat: float,
    end_lon: float,
) -> Dict[str, Any]:
    weather_key = os.getenv("OPENWEATHER_API_KEY")
    route_key = os.getenv("OPENROUTESERVICE_API_KEY")
    tomtom_key = os.getenv("TOMTOM_API_KEY")

    missing = [
        name
        for name, value in {
            "OPENWEATHER_API_KEY": weather_key,
            "OPENROUTESERVICE_API_KEY": route_key,
            "TOMTOM_API_KEY": tomtom_key,
        }.items()
        if not value
    ]
    if missing:
        raise RuntimeError(f"Missing required environment variables: {', '.join(missing)}")

    # Weather and traffic are sampled at route midpoint for a practical route-level estimate.
    midpoint_lat = (start_lat + end_lat) / 2.0
    midpoint_lon = (start_lon + end_lon) / 2.0

    weather = fetch_weather(midpoint_lat, midpoint_lon, weather_key)
    route = fetch_route(start_lat, start_lon, end_lat, end_lon, route_key)
    traffic = fetch_traffic(midpoint_lat, midpoint_lon, tomtom_key, route.estimated_time_min)

    risk, reason, suggestion = assess_risk(weather, traffic)

    return {
        "weather": weather.summary,
        "traffic_level": traffic.level,
        "distance_km": round(route.distance_km, 2),
        "estimated_time_min": round(route.estimated_time_min + traffic.delay_min, 2),
        "risk_level": risk,
        "reason": reason,
        "suggestion": suggestion,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Analyze delivery risk using weather, route, and traffic APIs.")
    parser.add_argument("--start-lat", type=float, required=True)
    parser.add_argument("--start-lon", type=float, required=True)
    parser.add_argument("--end-lat", type=float, required=True)
    parser.add_argument("--end-lon", type=float, required=True)
    args = parser.parse_args()

    result = analyze_delivery_conditions(
        start_lat=args.start_lat,
        start_lon=args.start_lon,
        end_lat=args.end_lat,
        end_lon=args.end_lon,
    )
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
