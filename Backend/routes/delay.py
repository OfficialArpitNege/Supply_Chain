from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from Backend.services.feature_builder import prepare_delay_input
from Backend.services.model_service import predict_delay as predict_delay_hybrid
from Backend.services.preprocessing import preprocess
from Backend.utils.helpers import to_model_dict

router = APIRouter(tags=["delay"])


class DelayRequest(BaseModel):
    Agent_Age: int = Field(..., ge=18, le=80)
    Agent_Rating: float = Field(..., ge=0.0, le=5.0)
    weather: Optional[str] = Field(default=None)
    traffic: Optional[str] = Field(default=None)
    vehicle: Optional[str] = Field(default=None)
    area: Optional[str] = Field(default=None)
    distance: Optional[float] = Field(default=None, ge=0.0)
    hour_of_day: Optional[int] = Field(default=None, ge=0, le=23)
    weekday: Optional[int] = Field(default=None, ge=0, le=6)
    timestamp: Optional[str] = Field(default=None)
    temperature_C: Optional[float] = Field(default=None)
    start_lat: Optional[float] = Field(default=None, ge=-90, le=90)
    start_lon: Optional[float] = Field(default=None, ge=-180, le=180)
    end_lat: Optional[float] = Field(default=None, ge=-90, le=90)
    end_lon: Optional[float] = Field(default=None, ge=-180, le=180)


class DelayResponse(BaseModel):
    delay: int
    confidence: float


@router.post("/predict-delay", response_model=DelayResponse)
def predict_delay(payload: DelayRequest) -> DelayResponse:
    try:
        processed = preprocess(to_model_dict(payload))
        features = prepare_delay_input(processed)
        result = predict_delay_hybrid(features, processed)
        return DelayResponse(**result)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
