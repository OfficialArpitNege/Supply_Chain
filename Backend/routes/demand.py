from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, timezone, timedelta
from Backend.utils.firebase_helper import get_firestore_client
import math

router = APIRouter(prefix="/demand", tags=["demand"])

class DemandCluster(BaseModel):
    center: dict # {lat, lon}
    order_count: int
    area_name: str

@router.get("/clusters", response_model=List[DemandCluster])
def get_demand_clusters():
    """
    Detect high demand clusters from recent orders.
    Groups orders by proximity (~1-2km).
    """
    try:
        db = get_firestore_client()
        # Fetch orders from last 15 minutes
        cutoff = datetime.now(timezone.utc) - timedelta(minutes=15)
        orders_ref = db.collection("orders")
        recent_orders = orders_ref.where("created_at", ">=", cutoff).stream()
        
        points = []
        for doc in recent_orders:
            data = doc.to_dict()
            loc = data.get("customer_location")
            if loc and "lat" in loc and "lon" in loc:
                points.append({"lat": loc["lat"], "lon": loc["lon"], "id": doc.id})
        
        if not points:
            return []

        clusters = []
        visited = set()
        RADIUS_KM = 2.0
        THRESHOLD = 3

        def get_dist(p1, p2):
            # Haversine formula for distance
            R = 6371
            dlat = math.radians(p2["lat"] - p1["lat"])
            dlon = math.radians(p2["lon"] - p1["lon"])
            a = math.sin(dlat/2)**2 + math.cos(math.radians(p1["lat"])) * math.cos(math.radians(p2["lat"])) * math.sin(dlon/2)**2
            c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
            return R * c

        for i, p in enumerate(points):
            if p["id"] in visited:
                continue
            
            # Find all points within radius
            current_cluster = [p]
            visited.add(p["id"])
            
            for j, other in enumerate(points):
                if other["id"] in visited:
                    continue
                if get_dist(p, other) <= RADIUS_KM:
                    current_cluster.append(other)
                    visited.add(other["id"])
            
            if len(current_cluster) >= THRESHOLD:
                # Calculate center
                avg_lat = sum(c["lat"] for c in current_cluster) / len(current_cluster)
                avg_lon = sum(c["lon"] for c in current_cluster) / len(current_cluster)
                
                clusters.append(DemandCluster(
                    center={"lat": avg_lat, "lon": avg_lon},
                    order_count=len(current_cluster),
                    area_name="High Demand Zone"
                ))
        
        return clusters

    except Exception as e:
        print(f"Cluster detection error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

class DemandRequest(BaseModel):
    product_id: int = Field(..., ge=1)
    category: str = Field(..., min_length=1)
    order_date: str = Field(..., min_length=1)

class DemandResponse(BaseModel):
    demand_level: str
    ml_score: float
    active_deliveries: int
    final_score: float

@router.post("/predict-demand", response_model=DemandResponse)
def predict_demand(payload: DemandRequest) -> DemandResponse:
    from Backend.services.model_service import predict_demand as predict_demand_hybrid
    from Backend.utils.helpers import to_model_dict
    try:
        data = to_model_dict(payload)
        result = predict_demand_hybrid(data)
        return DemandResponse(
            demand_level=result.get("demand_level", "LOW"),
            ml_score=result.get("ml_score", 1.0),
            active_deliveries=result.get("active_deliveries", -1),
            final_score=result.get("final_score", 1.0),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
