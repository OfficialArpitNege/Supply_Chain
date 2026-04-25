from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os

from Backend.routes.analyze import router as analyze_router
from Backend.routes.delay import router as delay_router
from Backend.routes.demand import router as demand_router
from Backend.routes.deliveries import router as deliveries_router
from Backend.routes.orders import router as orders_router
from Backend.routes.admin import router as admin_router
from Backend.routes.demo import router as demo_router
from Backend.routes.products import router as products_router
from Backend.routes.supplier import router as supplier_router
from Backend.services.model_service import health_check as model_health_check
from Backend.utils.firebase_helper import get_active_deliveries_count
from Backend.services.simulation_service import start_simulation



app = FastAPI(
    title="Smart Supply Chain API",
    description="Modular FastAPI backend with fallback logic ready for ML model integration.",
    version="0.1.0",
)

@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    return JSONResponse(
        status_code=500,
        content={"message": "Internal Neural Logic Error", "detail": str(exc)},
        headers={"Access-Control-Allow-Origin": "*"}
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8000",
        "http://127.0.0.1:8000"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount frontend as static files
# Use absolute path relative to this file to be robust
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
frontend_path = os.path.join(parent_dir, "Frontend")

print(f"DEBUG: Checking for frontend at: {frontend_path}")
if os.path.exists(frontend_path):
    print("DEBUG: Frontend found, mounting /static")
    app.mount("/static", StaticFiles(directory=frontend_path), name="static")
else:
    print("DEBUG: Frontend NOT found at that path!")


# @app.on_event("startup")
# def startup_event():
#     start_simulation()
# SIMULATION DISABLED — uncomment above to re-enable

@app.post("/simulate/start", tags=["simulation"])
def start_sim_endpoint():
    started = start_simulation()
    return {"status": "simulation started" if started else "already running"}

@app.post("/admin/clear-deliveries", tags=["admin"])
def clear_all_deliveries():
    """Delete ALL delivery documents from Firebase. Use with caution."""
    try:
        from Backend.utils.firebase_helper import get_firestore_client
        db = get_firestore_client()
        docs = db.collection("deliveries").stream()
        count = 0
        for doc in docs:
            doc.reference.delete()
            count += 1
        return {"status": "success", "deleted": count}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.get("/test-demand")
def test_demand():
    active = get_active_deliveries_count()
    if active == -1:
        return {
            "active_deliveries": -1,
            "status": "error",
            "message": "Failed to fetch active deliveries from Firebase. Check credentials/connectivity."
        }
    return {"active_deliveries": active, "status": "success"}

@app.get("/.well-known/appspecific/com.chrome.devtools.json", include_in_schema=False)
def chrome_devtools_support():
    return {"status": "ok"}


from fastapi.responses import FileResponse

@app.get("/", tags=["health"], include_in_schema=False)
def root():
    # Use absolute path for reliability
    dashboard_file = os.path.join(frontend_path, "admin_dashboard.html")
    if os.path.exists(dashboard_file):
        return FileResponse(dashboard_file)
    return {"status": "API is running", "message": "Dashboard file not found"}




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
app.include_router(deliveries_router)
app.include_router(orders_router)
app.include_router(admin_router)
app.include_router(demo_router)
app.include_router(products_router)
app.include_router(supplier_router)

