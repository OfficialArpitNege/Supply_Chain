from fastapi import FastAPI
from fastapi.responses import JSONResponse

from Backend.routes.analyze import router as analyze_router
from Backend.routes.delay import router as delay_router
from Backend.routes.demand import router as demand_router
from Backend.services.model_service import health_check as model_health_check

app = FastAPI(
    title="Smart Supply Chain API",
    description="Modular FastAPI backend with fallback logic ready for ML model integration.",
    version="0.1.0",
)


@app.get("/", tags=["health"])
def root() -> dict:
    return {"status": "API is running"}


@app.get("/health", tags=["health"])
def health() -> dict:
    return {"status": "ok"}


@app.get("/models/health", tags=["health"])
def models_health() -> dict:
    health = model_health_check()
    return JSONResponse(content=health, status_code=200 if health.get("status") == "healthy" else 503)


app.include_router(analyze_router)
app.include_router(demand_router)
app.include_router(delay_router)
