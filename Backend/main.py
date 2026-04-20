from fastapi import FastAPI

from Backend.routes.analyze import router as analyze_router
from Backend.routes.delay import router as delay_router
from Backend.routes.demand import router as demand_router

app = FastAPI(
    title="Smart Supply Chain API",
    description="Modular FastAPI backend with fallback logic ready for ML model integration.",
    version="0.1.0",
)


@app.get("/health", tags=["health"])
def health() -> dict:
    return {"status": "ok"}


app.include_router(analyze_router)
app.include_router(demand_router)
app.include_router(delay_router)
