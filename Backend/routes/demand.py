from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from Backend.services.model_service import predict_demand as predict_demand_hybrid
from Backend.utils.helpers import to_model_dict

router = APIRouter(tags=["demand"])


class DemandRequest(BaseModel):
    product_id: int = Field(..., ge=1)
    category: str = Field(..., min_length=1)
    order_date: str = Field(..., min_length=1)


class DemandResponse(BaseModel):
    predicted_demand: float


@router.post("/predict-demand", response_model=DemandResponse)
def predict_demand(payload: DemandRequest) -> DemandResponse:
    try:
        data = to_model_dict(payload)
        result = predict_demand_hybrid(data)
        return DemandResponse(**result)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
