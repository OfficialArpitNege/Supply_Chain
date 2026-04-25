from datetime import datetime, timezone
from typing import Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from Backend.services.live_route_service import analyze_alternative_routes_live, analyze_route_live
from Backend.services.model_service import predict_delay as predict_delay_model
from Backend.services.model_service import predict_demand as predict_demand_model
from Backend.utils.auth_helper import role_required
from fastapi import Depends

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
    prediction: int
    probability_delayed: float
    is_delayed: bool
    delay: int
    confidence: float
    reason: str
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


class RecommendRoutesRequest(BaseModel):
    start_lat: float = Field(..., ge=-90, le=90)
    start_lon: float = Field(..., ge=-180, le=180)
    end_lat: float = Field(..., ge=-90, le=90)
    end_lon: float = Field(..., ge=-180, le=180)
    weather: Optional[str] = Field(default=None, min_length=1)
    traffic: Optional[str] = Field(default=None, min_length=1)
    vehicle: Optional[str] = Field(default=None, min_length=1)
    timestamp: Optional[str] = Field(default=None, min_length=1)


class RecommendedRouteItem(BaseModel):
    id: str
    distance: float
    base_eta: float
    traffic_eta: float
    traffic_speed: float
    eta_ratio: float
    delay: int
    probability_delayed: float
    confidence: float
    score: float
    risk: str
    route_path: List[List[float]]


class RecommendRoutesResponse(BaseModel):
    routes: List[RecommendedRouteItem]
    recommended_route_id: str
    explanation: str


def _safe_div(numerator: float, denominator: float, fallback: float) -> float:
    if denominator == 0:
        return fallback
    return numerator / denominator


def _route_score(probability_delayed: float, traffic_speed: float, eta_ratio: float, distance: float) -> float:
    score = 0.0
    score += (1.0 - probability_delayed) * 50.0
    score += (traffic_speed / 50.0) * 20.0
    score += _safe_div(1.0, eta_ratio, 0.0) * 20.0
    score += _safe_div(1.0, distance, 0.0) * 10.0
    return round(score, 3)


def _build_recommendation_explanation(best_route: Dict[str, object], routes: List[Dict[str, object]]) -> str:
    if not routes:
        return "Recommended route because it has better overall travel conditions."

    min_eta_ratio = min(float(route["eta_ratio"]) for route in routes)
    max_speed = max(float(route["traffic_speed"]) for route in routes)
    min_delay_prob = min(float(route["probability_delayed"]) for route in routes)
    min_distance = min(float(route["distance"]) for route in routes)

    parts: List[str] = []
    best_eta_ratio = float(best_route["eta_ratio"])
    best_speed = float(best_route["traffic_speed"])
    best_delay_prob = float(best_route["probability_delayed"])
    best_distance = float(best_route["distance"])

    if abs(best_eta_ratio - min_eta_ratio) <= 1e-6:
        parts.append("This route has significantly lower traffic congestion")
    if abs(best_speed - max_speed) <= 1e-6:
        parts.append("Vehicles can move faster on this route")
    if abs(best_delay_prob - min_delay_prob) <= 1e-6:
        parts.append("It has the lowest risk of delay")
    if abs(best_distance - min_distance) <= 1e-6:
        parts.append("It is also relatively shorter")

    if not parts:
        return "Recommended route because it has lower traffic, higher speed, and minimal delay risk."

    return ". ".join(parts) + "."


def _derive_risk_level(delay: int, demand: float, traffic: str, weather: str) -> str:
    traffic_level = traffic.lower()
    weather_level = weather.lower()

    if delay == 1 and demand >= 2.3:
        return "HIGH"
    if delay == 1 or demand >= 1.8 or traffic_level == "high" or weather_level in {"rain", "storm", "thunderstorm"}:
        return "MEDIUM"
    return "LOW"


@router.post("/analyze-route", response_model=AnalyzeRouteResponse, dependencies=[Depends(role_required(["admin"]))])
def analyze_route(payload: AnalyzeRouteRequest) -> AnalyzeRouteResponse:
    try:
        route_data = analyze_route_live(payload.start_lat, payload.start_lon, payload.end_lat, payload.end_lon)

        timestamp = payload.timestamp or datetime.now(timezone.utc).isoformat()
        base_eta = float(route_data.get("base_eta", route_data.get("estimated_time_min", 0.0)) or 0.0)
        traffic_eta = float(
            route_data.get("traffic_eta", route_data.get("traffic_time_min", route_data.get("final_time_min", 0.0)))
            or 0.0
        )
        eta_ratio = (traffic_eta / base_eta) if base_eta > 0 else 1.0
        delay_input = {
            "Agent_Age": 30,
            "Agent_Rating": 4.5,
            "weather": payload.weather or route_data.get("weather", "Clear"),
            "traffic": payload.traffic or route_data.get("congestion_level", "Medium"),
            "vehicle": payload.vehicle or "Bike",
            "area": "Urban",
            "distance": route_data.get("distance_km", 0.0),
            "traffic_speed": route_data.get("traffic_speed", 0.0),
            "base_eta": base_eta,
            "traffic_eta": traffic_eta,
            "hour_of_day": datetime.fromisoformat(timestamp.replace("Z", "+00:00")).hour,
            "weekday": datetime.fromisoformat(timestamp.replace("Z", "+00:00")).weekday(),
            "timestamp": timestamp,
            "temperature": route_data.get("temperature", 30.0),
            "temperature_C": route_data.get("temperature", 30.0),
            "traffic_congestion_index": min(max((eta_ratio - 1.0) / 1.5, 0.0), 1.0),
            "precipitation_mm": 0.0,
        }

        demand_input = {
            "product_id": 101,
            "category": "Grocery & Staples",
            "order_date": timestamp,
        }

        delay_result = predict_delay_model(delay_input)
        demand_result = predict_demand_model(demand_input)
        delay = int(delay_result.get("prediction", delay_result.get("delay", 0)))
        confidence = float(delay_result.get("confidence", 0.0))
        demand = float(demand_result.get("predicted_demand", 0.0))
        overall_risk = _derive_risk_level(
            delay,
            demand,
            str(delay_input.get("traffic", "Medium")),
            str(delay_input.get("weather", "Clear")),
        )
        prediction_risk_level = str(delay_result.get("risk_level", overall_risk))

        response_data = dict(route_data)
        response_data.update(
            {
                "delay": delay,
                "prediction": delay,
                "probability_delayed": float(delay_result.get("probability_delayed", 0.0)),
                "is_delayed": bool(delay_result.get("is_delayed", delay == 1)),
                "confidence": confidence,
                "reason": str(delay_result.get("reason", "Route signals indicate moderate delay risk")),
                "demand": demand,
                "risk_level": prediction_risk_level,
                "risk": overall_risk,
                "weather": route_data.get("weather", payload.weather or "Clear"),
                "traffic": route_data.get("traffic", payload.traffic or "Medium"),
            }
        )
        return AnalyzeRouteResponse(**response_data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/analyze-route", response_model=AnalyzeRouteResponse, dependencies=[Depends(role_required(["admin"]))])
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
        base_eta = float(route_data.get("base_eta", route_data.get("estimated_time_min", 0.0)) or 0.0)
        traffic_eta = float(
            route_data.get("traffic_eta", route_data.get("traffic_time_min", route_data.get("final_time_min", 0.0)))
            or 0.0
        )
        eta_ratio = (traffic_eta / base_eta) if base_eta > 0 else 1.0
        delay_input = {
            "Agent_Age": 30,
            "Agent_Rating": 4.5,
            "weather": weather or route_data.get("weather", "Clear"),
            "traffic": traffic or route_data.get("congestion_level", "Medium"),
            "vehicle": vehicle or "Bike",
            "area": "Urban",
            "distance": route_data.get("distance_km", 0.0),
            "traffic_speed": route_data.get("traffic_speed", 0.0),
            "base_eta": base_eta,
            "traffic_eta": traffic_eta,
            "hour_of_day": datetime.fromisoformat(timestamp_value.replace("Z", "+00:00")).hour,
            "weekday": datetime.fromisoformat(timestamp_value.replace("Z", "+00:00")).weekday(),
            "timestamp": timestamp_value,
            "temperature": route_data.get("temperature", 30.0),
            "temperature_C": route_data.get("temperature", 30.0),
            "traffic_congestion_index": min(max((eta_ratio - 1.0) / 1.5, 0.0), 1.0),
            "precipitation_mm": 0.0,
        }

        demand_input = {
            "product_id": 101,
            "category": "Grocery & Staples",
            "order_date": timestamp_value,
        }

        delay_result = predict_delay_model(delay_input)
        demand_result = predict_demand_model(demand_input)
        delay = int(delay_result.get("prediction", delay_result.get("delay", 0)))
        confidence = float(delay_result.get("confidence", 0.0))
        demand = float(demand_result.get("predicted_demand", 0.0))
        overall_risk = _derive_risk_level(
            delay,
            demand,
            str(delay_input.get("traffic", "Medium")),
            str(delay_input.get("weather", "Clear")),
        )
        prediction_risk_level = str(delay_result.get("risk_level", overall_risk))

        response_data = dict(route_data)
        response_data.update(
            {
                "delay": delay,
                "prediction": delay,
                "probability_delayed": float(delay_result.get("probability_delayed", 0.0)),
                "is_delayed": bool(delay_result.get("is_delayed", delay == 1)),
                "confidence": confidence,
                "reason": str(delay_result.get("reason", "Route signals indicate moderate delay risk")),
                "demand": demand,
                "risk_level": prediction_risk_level,
                "risk": overall_risk,
                "weather": route_data.get("weather", weather or "Clear"),
                "traffic": route_data.get("traffic", traffic or "Medium"),
            }
        )
        return AnalyzeRouteResponse(**response_data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post("/recommend-routes", response_model=RecommendRoutesResponse, dependencies=[Depends(role_required(["admin"]))])
def recommend_routes(payload: RecommendRoutesRequest) -> RecommendRoutesResponse:
    try:
        timestamp = payload.timestamp or datetime.now(timezone.utc).isoformat()
        routes_data = analyze_alternative_routes_live(
            payload.start_lat,
            payload.start_lon,
            payload.end_lat,
            payload.end_lon,
            target_count=3,
        )

        enriched_routes: List[Dict[str, object]] = []
        for route in routes_data:
            distance = float(route.get("distance_km", 0.0) or 0.0)
            base_eta = float(route.get("base_eta", route.get("estimated_time_min", 0.0)) or 0.0)
            traffic_eta = float(route.get("traffic_eta", route.get("traffic_time_min", route.get("final_time_min", 0.0))) or 0.0)
            traffic_speed = float(route.get("traffic_speed", 0.0) or 0.0)
            eta_ratio = float(route.get("eta_ratio", _safe_div(traffic_eta, max(base_eta, 1.0), 1.0)) or 1.0)

            delay_input = {
                "Agent_Age": 30,
                "Agent_Rating": 4.5,
                "weather": payload.weather or route.get("weather", "Clear"),
                "traffic": payload.traffic or route.get("traffic", route.get("congestion_level", "Medium")),
                "vehicle": payload.vehicle or "Bike",
                "area": "Urban",
                "distance": distance,
                "traffic_speed": traffic_speed,
                "base_eta": base_eta,
                "traffic_eta": traffic_eta,
                "hour_of_day": datetime.fromisoformat(timestamp.replace("Z", "+00:00")).hour,
                "weekday": datetime.fromisoformat(timestamp.replace("Z", "+00:00")).weekday(),
                "timestamp": timestamp,
                "temperature": route.get("temperature", 30.0),
                "temperature_C": route.get("temperature", 30.0),
                "traffic_congestion_index": min(max((eta_ratio - 1.0) / 1.5, 0.0), 1.0),
                "precipitation_mm": 0.0,
            }

            delay_result = predict_delay_model(delay_input)
            probability_delayed = float(delay_result.get("probability_delayed", 0.0))
            confidence = float(delay_result.get("confidence", 0.0))
            delay = int(delay_result.get("prediction", delay_result.get("delay", 0)))
            risk = str(delay_result.get("risk_level", route.get("risk", "MEDIUM"))).upper()
            score = _route_score(probability_delayed, traffic_speed, max(eta_ratio, 0.1), max(distance, 0.1))

            enriched_routes.append(
                {
                    "id": str(route.get("id", f"route_{len(enriched_routes) + 1}")),
                    "distance": round(distance, 3),
                    "base_eta": round(base_eta, 3),
                    "traffic_eta": round(traffic_eta, 3),
                    "traffic_speed": round(traffic_speed, 3),
                    "eta_ratio": round(eta_ratio, 3),
                    "delay": delay,
                    "probability_delayed": round(probability_delayed, 6),
                    "confidence": round(confidence, 6),
                    "score": score,
                    "risk": risk,
                    "route_path": route.get("route_path", []),
                }
            )

        if len(enriched_routes) < 2:
            raise RuntimeError("Unable to compare multiple routes for recommendation.")

        best_route = max(enriched_routes, key=lambda route: float(route["score"]))
        explanation = _build_recommendation_explanation(best_route, enriched_routes)
        return RecommendRoutesResponse(
            routes=[RecommendedRouteItem(**route) for route in enriched_routes],
            recommended_route_id=str(best_route["id"]),
            explanation=explanation,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
