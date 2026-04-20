from datetime import datetime, timezone
from typing import Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from Backend.services.live_route_service import analyze_route_live
from Backend.services.model_service import predict_delay as predict_delay_model
from Backend.services.model_service import predict_demand as predict_demand_model

router = APIRouter(tags=["analyze"])


class AnalyzeRouteRequest(BaseModel):
    start_lat: float = Field(..., ge=-90, le=90)
    start_lon: float = Field(..., ge=-180, le=180)
    end_lat: float = Field(..., ge=-90, le=90)
    end_lon: float = Field(..., ge=-180, le=180)
    weather: Optional[str] = Field(default=None, min_length=1)
    traffic: Optional[str] = Field(default=None, min_length=1)
    vehicle: Optional[str] = Field(default=None, min_length=1)
    timestamp: Optional[str] = Field(default=None, min_length=1)


class AnalyzeRouteResponse(BaseModel):
    delay: int
    confidence: float
    demand: float
    risk_level: str
    start_location: Optional[Dict[str, float]] = None
    destination: Optional[Dict[str, float]] = None
    distance_km: float
    estimated_time_min: float
    traffic_time_min: Optional[float] = None
    final_time_min: Optional[float] = None
    traffic_speed: Optional[float] = None
    congestion_level: Optional[str] = None
    temperature: Optional[float] = None
    traffic: str
    weather: str
    risk: str
    route_path: Optional[List[List[float]]] = None


def _derive_risk_level(delay: int, demand: float, traffic: str, weather: str) -> str:
    traffic_level = traffic.lower()
    weather_level = weather.lower()

    if delay == 1 and demand >= 2.3:
        return "HIGH"
    if delay == 1 or demand >= 1.8 or traffic_level == "high" or weather_level in {"rain", "storm", "thunderstorm"}:
        return "MEDIUM"
    return "LOW"


@router.post("/analyze-route", response_model=AnalyzeRouteResponse)
def analyze_route(payload: AnalyzeRouteRequest) -> AnalyzeRouteResponse:
    try:
        route_data = analyze_route_live(payload.start_lat, payload.start_lon, payload.end_lat, payload.end_lon)

        timestamp = payload.timestamp or datetime.now(timezone.utc).isoformat()
        delay_input = {
            "Agent_Age": 30,
            "Agent_Rating": 4.5,
            "weather": payload.weather or route_data.get("weather", "Clear"),
            "traffic": payload.traffic or route_data.get("congestion_level", "Medium"),
            "vehicle": payload.vehicle or "Bike",
            "area": "Urban",
            "distance": route_data.get("distance_km", 0.0),
            "hour_of_day": datetime.fromisoformat(timestamp.replace("Z", "+00:00")).hour,
            "weekday": datetime.fromisoformat(timestamp.replace("Z", "+00:00")).weekday(),
            "timestamp": timestamp,
            "temperature_C": route_data.get("temperature", 30.0),
            "traffic_congestion_index": 0.5,
            "precipitation_mm": 0.0,
        }

        demand_input = {
            "product_id": 101,
            "category": "Grocery & Staples",
            "order_date": timestamp,
        }

        delay_result = predict_delay_model(delay_input)
        demand_result = predict_demand_model(demand_input)
        delay = int(delay_result.get("delay", 0))
        confidence = float(delay_result.get("confidence", 0.0))
        demand = float(demand_result.get("predicted_demand", 0.0))
        risk_level = _derive_risk_level(
            delay,
            demand,
            str(delay_input.get("traffic", "Medium")),
            str(delay_input.get("weather", "Clear")),
        )

        response_data = dict(route_data)
        response_data.update(
            {
                "delay": delay,
                "confidence": confidence,
                "demand": demand,
                "risk_level": risk_level,
                "risk": risk_level,
                "weather": route_data.get("weather", payload.weather or "Clear"),
                "traffic": route_data.get("traffic", payload.traffic or "Medium"),
            }
        )
        return AnalyzeRouteResponse(**response_data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/analyze-route", response_model=AnalyzeRouteResponse)
def analyze_route_get(
    start_lat: float = Query(..., ge=-90, le=90),
    start_lon: float = Query(..., ge=-180, le=180),
    end_lat: float = Query(..., ge=-90, le=90),
    end_lon: float = Query(..., ge=-180, le=180),
    weather: str = Query("Clear", min_length=1),
    traffic: str = Query("Medium", min_length=1),
    vehicle: str = Query("Bike", min_length=1),
    timestamp: str = Query(default_factory=lambda: datetime.now(timezone.utc).isoformat()),
) -> AnalyzeRouteResponse:
    try:
        route_data = analyze_route_live(start_lat, start_lon, end_lat, end_lon)
        timestamp_value = timestamp or datetime.now(timezone.utc).isoformat()
        delay_input = {
            "Agent_Age": 30,
            "Agent_Rating": 4.5,
            "weather": weather or route_data.get("weather", "Clear"),
            "traffic": traffic or route_data.get("congestion_level", "Medium"),
            "vehicle": vehicle or "Bike",
            "area": "Urban",
            "distance": route_data.get("distance_km", 0.0),
            "hour_of_day": datetime.fromisoformat(timestamp_value.replace("Z", "+00:00")).hour,
            "weekday": datetime.fromisoformat(timestamp_value.replace("Z", "+00:00")).weekday(),
            "timestamp": timestamp_value,
            "temperature_C": route_data.get("temperature", 30.0),
            "traffic_congestion_index": 0.5,
            "precipitation_mm": 0.0,
        }

        demand_input = {
            "product_id": 101,
            "category": "Grocery & Staples",
            "order_date": timestamp_value,
        }

        delay_result = predict_delay_model(delay_input)
        demand_result = predict_demand_model(demand_input)
        delay = int(delay_result.get("delay", 0))
        confidence = float(delay_result.get("confidence", 0.0))
        demand = float(demand_result.get("predicted_demand", 0.0))
        risk_level = _derive_risk_level(
            delay,
            demand,
            str(delay_input.get("traffic", "Medium")),
            str(delay_input.get("weather", "Clear")),
        )

        response_data = dict(route_data)
        response_data.update(
            {
                "delay": delay,
                "confidence": confidence,
                "demand": demand,
                "risk_level": risk_level,
                "risk": risk_level,
                "weather": route_data.get("weather", weather or "Clear"),
                "traffic": route_data.get("traffic", traffic or "Medium"),
            }
        )
        return AnalyzeRouteResponse(**response_data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
