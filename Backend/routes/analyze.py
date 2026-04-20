from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from Backend.services.fallback_logic import analyze_route_fallback
from Backend.utils.helpers import to_model_dict

router = APIRouter(tags=["analyze"])


class AnalyzeRouteRequest(BaseModel):
    start_lat: float = Field(..., ge=-90, le=90)
    start_lon: float = Field(..., ge=-180, le=180)
    end_lat: float = Field(..., ge=-90, le=90)
    end_lon: float = Field(..., ge=-180, le=180)
    weather: str = Field(..., min_length=1)
    traffic: str = Field(..., min_length=1)
    vehicle: str = Field(..., min_length=1)
    timestamp: str = Field(..., min_length=1)


class AnalyzeRouteResponse(BaseModel):
    distance_km: float
    estimated_time_min: float
    traffic: str
    weather: str
    risk: str


@router.post("/analyze-route", response_model=AnalyzeRouteResponse)
def analyze_route(payload: AnalyzeRouteRequest) -> AnalyzeRouteResponse:
    try:
        result = analyze_route_fallback(to_model_dict(payload))
        return AnalyzeRouteResponse(**result)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
