from typing import Any, Dict, Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from services.delay_service import predict_delay
from services.demand_service import predict_demand

app = FastAPI(title="Smart Supply Chain ML API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.get("/predict-demand")
def predict_demand_endpoint(
    product_id: str = Query(..., min_length=2, description="Product code, for example P101"),
    date: Optional[str] = Query(None, description="Date in YYYY-MM-DD format"),
    day_of_week: Optional[str] = Query(None, description="Day name, for example monday"),
    season: Optional[str] = Query(None, description="Optional season tag"),
) -> Dict[str, Any]:
    try:
        payload = {
            "product_id": product_id,
            "date": date,
            "day_of_week": day_of_week,
            "season": season,
        }
        result = predict_demand(payload)
        return {
            "product_id": result["product_id"],
            "predicted_demand": result["predicted_demand"],
            "confidence": result["confidence"],
        }
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.get("/predict-delay")
def predict_delay_endpoint(
    weather_condition: str = Query(..., description="Current weather condition"),
    temperature: float = Query(..., description="Temperature in Celsius"),
    traffic_congestion: str = Query(..., description="Traffic level low/medium/high or 0-1"),
    precipitation: float = Query(0.0, ge=0.0, description="Precipitation amount"),
    peak_hour: int = Query(0, ge=0, le=1, description="Peak hour flag: 0 or 1"),
    weekday: str = Query(..., description="Weekday name"),
    season: str = Query(..., description="Season label"),
) -> Dict[str, Any]:
    payload = {
        "weather_condition": weather_condition,
        "temperature": temperature,
        "traffic_congestion": traffic_congestion,
        "precipitation": precipitation,
        "peak_hour": peak_hour,
        "weekday": weekday,
        "season": season,
    }
    return predict_delay(payload)


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


@app.get("/final-analysis")
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
    demand_result = predict_demand_endpoint(
        product_id=product_id,
        date=date,
        day_of_week=day_of_week,
        season=season,
    )

    delay_result = predict_delay_endpoint(
        weather_condition=weather_condition,
        temperature=temperature,
        traffic_congestion=traffic_congestion,
        precipitation=precipitation,
        peak_hour=peak_hour,
        weekday=weekday,
        season=season,
    )

    decision = _final_decision(
        demand=demand_result["predicted_demand"],
        delay_risk=delay_result["delay_risk"],
    )

    return {
        "demand": demand_result["predicted_demand"],
        "delay_risk": delay_result["delay_risk"],
        "final_decision": decision,
        "signals": {
            "demand_confidence": demand_result["confidence"],
            "delay_probability": delay_result["probability"],
        },
    }
