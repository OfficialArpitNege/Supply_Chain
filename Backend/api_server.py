import os
from typing import Any, Dict, Optional

import requests
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from services.decision_engine_service import evaluate_logistics_decision
from services.delay_service import predict_delay
from services.demand_service import predict_demand

load_dotenv()

app = FastAPI(title="Smart Supply Chain Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

weather_key = os.getenv("OPENWEATHER_API_KEY")
ors_key = os.getenv("OPENROUTESERVICE_API_KEY")
tomtom_key = os.getenv("TOMTOM_API_KEY")

def _ensure_keys() -> None:
    missing = [
        name
        for name, value in {
            "OPENWEATHER_API_KEY": weather_key,
            "OPENROUTESERVICE_API_KEY": ors_key,
            "TOMTOM_API_KEY": tomtom_key,
        }.items()
        if not value
    ]
    if missing:
        raise HTTPException(status_code=500, detail=f"Missing required environment variables: {', '.join(missing)}")


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


def _analyze_route(start_lat: float, start_lon: float, end_lat: float, end_lon: float) -> Dict[str, Any]:
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
        raise HTTPException(status_code=502, detail="No route found from OpenRouteService.")

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

    weather_main = (
        weather_data.get("weather", [{}])[0].get("main", "Unknown")
        if isinstance(weather_data.get("weather", []), list)
        else "Unknown"
    )
    temperature = float(weather_data.get("main", {}).get("temp", 0.0))

    distance_m = float(route_summary.get("distance", 0.0))
    duration_s = float(route_summary.get("duration", 0.0))
    distance_km = distance_m / 1000.0
    estimated_time_min = duration_s / 60.0

    flow_data = traffic_data.get("flowSegmentData", {})
    traffic_speed = float(flow_data.get("currentSpeed", 0.0) or 0.0)
    free_flow_speed = float(flow_data.get("freeFlowSpeed", 0.0) or 0.0)
    congestion_level = _congestion_from_speed(traffic_speed, free_flow_speed)

    if traffic_speed > 0:
        traffic_time_min = distance_km / (traffic_speed / 60.0)
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
        "traffic_speed": round(traffic_speed, 2),
        "congestion_level": congestion_level,
        "risk": risk,
        "route_path": route_path,
    }


@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.get("/test-apis")
def test_apis() -> Dict[str, Any]:
    _ensure_keys()

    try:
        return _analyze_route(
            start_lat=21.1458,
            start_lon=79.0882,
            end_lat=21.1600,
            end_lon=79.1000,
        )
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail=f"External API error: {exc}") from exc


@app.get("/analyze")
def analyze(
    start_lat: float = Query(..., description="Start latitude"),
    start_lon: float = Query(..., description="Start longitude"),
    end_lat: float = Query(..., description="Destination latitude"),
    end_lon: float = Query(..., description="Destination longitude"),
) -> Dict[str, Any]:
    _ensure_keys()

    try:
        return _analyze_route(
            start_lat=start_lat,
            start_lon=start_lon,
            end_lat=end_lat,
            end_lon=end_lon,
        )
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail=f"External API error: {exc}") from exc


@app.get("/ml/predict-demand")
def predict_demand_endpoint(
    product_id: str = Query(..., min_length=2, description="Product code, for example P101"),
    date: Optional[str] = Query(None, description="Date in YYYY-MM-DD format"),
    day_of_week: Optional[str] = Query(None, description="Day name, for example monday"),
    season: Optional[str] = Query(None, description="Optional season tag"),
) -> Dict[str, Any]:
    try:
        result = predict_demand(
            {
                "product_id": product_id,
                "date": date,
                "day_of_week": day_of_week,
                "season": season,
            }
        )
        return {
            "product_id": result["product_id"],
            "predicted_demand": result["predicted_demand"],
            "confidence": result["confidence"],
        }
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.get("/ml/predict-delay")
def predict_delay_endpoint(
    weather_condition: str = Query(..., description="Current weather condition"),
    temperature: float = Query(..., description="Temperature in Celsius"),
    traffic_congestion: str = Query(..., description="Traffic level low/medium/high or 0-1"),
    precipitation: float = Query(0.0, ge=0.0, description="Precipitation amount"),
    peak_hour: int = Query(0, ge=0, le=1, description="Peak hour flag: 0 or 1"),
    weekday: str = Query(..., description="Weekday name"),
    season: str = Query(..., description="Season label"),
) -> Dict[str, Any]:
    return predict_delay(
        {
            "weather_condition": weather_condition,
            "temperature": temperature,
            "traffic_congestion": traffic_congestion,
            "precipitation": precipitation,
            "peak_hour": peak_hour,
            "weekday": weekday,
            "season": season,
        }
    )


def _final_decision(demand: str, delay_risk: str) -> str:
    if demand == "HIGH" and delay_risk == "LOW":
        return "Dispatch immediately"
    if demand == "HIGH" and delay_risk == "MEDIUM":
        return "Proceed with caution"
    if delay_risk == "HIGH":
        return "Delay shipment and optimize route"
    if demand == "LOW" and delay_risk == "LOW":
        return "Proceed as scheduled"
    return "Proceed with caution"


@app.get("/ml/final-analysis")
def final_analysis(
    product_id: str = Query(..., min_length=2),
    date: Optional[str] = Query(None),
    day_of_week: Optional[str] = Query(None),
    season: str = Query("summer"),
    weather_condition: str = Query("clear"),
    temperature: float = Query(30.0),
    traffic_congestion: str = Query("low"),
    precipitation: float = Query(0.0, ge=0.0),
    peak_hour: int = Query(0, ge=0, le=1),
    weekday: str = Query("monday"),
) -> Dict[str, Any]:
    try:
        demand_result = predict_demand(
            {
                "product_id": product_id,
                "date": date,
                "day_of_week": day_of_week,
                "season": season,
            }
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    delay_result = predict_delay(
        {
            "weather_condition": weather_condition,
            "temperature": temperature,
            "traffic_congestion": traffic_congestion,
            "precipitation": precipitation,
            "peak_hour": peak_hour,
            "weekday": weekday,
            "season": season,
        }
    )

    return {
        "demand": demand_result["predicted_demand"],
        "delay_risk": delay_result["delay_risk"],
        "final_decision": _final_decision(demand_result["predicted_demand"], delay_result["delay_risk"]),
        "signals": {
            "demand_confidence": demand_result["confidence"],
            "delay_probability": delay_result["probability"],
        },
    }


@app.get("/ml/decision-engine")
def decision_engine(
    weather_condition: str = Query(..., description="Weather condition, e.g. Clear/Haze/Rain"),
    temperature: float = Query(..., description="Temperature in Celsius"),
    distance_km: float = Query(..., ge=0.0, description="Route distance in km"),
    estimated_time_min: float = Query(..., ge=0.0, description="Estimated route time in minutes"),
    traffic_speed: float = Query(..., gt=0.0, description="Traffic speed in km/h"),
    congestion_level: str = Query(..., description="Congestion level low/medium/high"),
    predicted_demand: str = Query(..., description="Demand level LOW/MEDIUM/HIGH"),
    delay_probability: float = Query(..., ge=0.0, le=1.0, description="Delay probability from model (0-1)"),
    peak_hour: int = Query(0, ge=0, le=1, description="Peak hour flag 0 or 1"),
    weekday: int = Query(0, ge=0, le=6, description="Weekday index 0-6"),
    season: Optional[str] = Query(None, description="Optional season label"),
) -> Dict[str, Any]:
    try:
        return evaluate_logistics_decision(
            {
                "weather_condition": weather_condition,
                "temperature": temperature,
                "distance_km": distance_km,
                "estimated_time_min": estimated_time_min,
                "traffic_speed": traffic_speed,
                "congestion_level": congestion_level,
                "predicted_demand": predicted_demand,
                "delay_probability": delay_probability,
                "peak_hour": peak_hour,
                "weekday": weekday,
                "season": season,
            }
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
