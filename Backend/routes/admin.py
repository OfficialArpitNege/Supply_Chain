from fastapi import APIRouter, HTTPException, Path, Query
from pydantic import BaseModel, Field
from datetime import datetime, timezone
from typing import List, Optional
import uuid

from Backend.utils.firebase_helper import get_firestore_client, get_active_deliveries_count
from Backend.utils.auth_helper import role_required, get_current_role
from fastapi import Depends

def add_notification(db, n_type: str, message: str, priority: str = "NORMAL"):
    """Push a live alert to the notifications collection."""
    db.collection("notifications").add({
        "type": n_type,
        "message": message,
        "priority": priority,
        "created_at": datetime.now(timezone.utc),
        "read": False
    })

router = APIRouter(prefix="/admin", tags=["admin"])

# ──────────────────────────────────────────────
# Pydantic Models
# ──────────────────────────────────────────────

class DisruptionRequest(BaseModel):
    type: str  # "traffic_spike" | "road_block" | "weather"
    route_id: str
    severity: str # "LOW" | "MEDIUM" | "HIGH"
    duration_minutes: int

class OverrideRequest(BaseModel):
    delivery_id: str
    action: str  # "force_continue" | "force_reroute"
    reason: str

class WarehouseCreateRequest(BaseModel):
    name: str
    location: dict  # {lat: float, lon: float}
    capacity: int

class DriverCreateRequest(BaseModel):
    name: str
    email: str
    vehicle_type: str # "bike" | "van" | "truck"
    license_plate: str

# ──────────────────────────────────────────────
# Endpoints
# ──────────────────────────────────────────────

@router.post("/disruptions/inject", dependencies=[Depends(role_required(["admin"]))])
def inject_disruption(payload: DisruptionRequest):
    """
    Simulate a disruption on a specific route and escalate risk for active deliveries.
    """
    try:
        db = get_firestore_client()
        now = datetime.now(timezone.utc)
        
        # 1. Store the disruption event
        disruption_id = f"DIS-{uuid.uuid4().hex[:6].upper()}"
        db.collection("disruptions").document(disruption_id).set({
            "disruption_id": disruption_id,
            **payload.model_dump(),
            "created_at": now
        })

        # 2. Find and update affected active deliveries
        affected_count = 0
        deliveries = db.collection("deliveries") \
            .where("status", "==", "in_transit") \
            .where("selected_route.route_id", "==", payload.route_id) \
            .stream()

        for doc in deliveries:
            dref = db.collection("deliveries").document(doc.id)
            ddata = doc.to_dict()
            
            # Escalate Risk
            current_risk = ddata.get("risk_level", "LOW")
            new_risk = "MEDIUM" if current_risk == "LOW" else "HIGH"
            
            risk_factors = ddata.get("risk_factors", [])
            risk_factors.append(f"Injected {payload.type} ({payload.severity})")
            
            updates = {
                "risk_level": new_risk,
                "risk_factors": risk_factors,
                "updated_at": now
            }
            
            # Trigger Recommendation if Risk becomes HIGH
            if new_risk == "HIGH":
                updates["recommended_action"] = "CRITICAL: Switch to backup_route immediately"
            
            dref.update(updates)
            affected_count += 1
            
        # 3. Add Notification
        add_notification(db, "DISRUPTION", f"🚧 {payload.type.upper()} detected on {payload.route_id} — {affected_count} deliveries impacted", "HIGH")

        return {
            "status": "success",
            "disruption_id": disruption_id,
            "deliveries_affected": affected_count,
            "message": f"Injected {payload.type} on {payload.route_id}. Escalated risk for {affected_count} deliveries."
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/evaluate-system", dependencies=[Depends(role_required(["admin"]))])
def evaluate_system():
    """
    AUTO DECISION ENGINE: Scans system state and updates recommendations fleet-wide.
    """
    try:
        db = get_firestore_client()
        now = datetime.now(timezone.utc)
        
        # 1. Global Demand Analysis
        active_deliveries = list(db.collection("deliveries").where("status", "in", ["dispatched", "in_transit"]).stream())
        active_count = len(active_deliveries)
        
        # 2. Route Density Map
        route_density = {}
        high_risk_count = 0
        
        for doc in active_deliveries:
            data = doc.to_dict()
            rid = data.get("selected_route", {}).get("route_id", "unknown")
            route_density[rid] = route_density.get(rid, 0) + 1
            if data.get("risk_level") == "HIGH":
                high_risk_count += 1

        # 3. Apply Decision Rules
        updates_performed = 0
        for doc in active_deliveries:
            data = doc.to_dict()
            if data.get("override"): continue # Skip if admin manually overrode
            
            dref = db.collection("deliveries").document(doc.id)
            rid = data.get("selected_route", {}).get("route_id")
            
            rec = data.get("recommended_action")
            
            # RULE: High system risk
            if active_count > 10 and high_risk_count > 2:
                rec = "SYSTEM ALERT: Delay new dispatches to prevent gridlock"
            
            # RULE: Route Congestion
            elif route_density.get(rid, 0) > 5:
                rec = f"CONGESTION: Avoid route {rid}, exceeding density limit"
                
            # RULE: Specific Risk
            elif data.get("risk_level") == "HIGH":
                rec = "Switch to backup route"

            if rec != data.get("recommended_action"):
                dref.update({"recommended_action": rec, "updated_at": now})
                updates_performed += 1
                # Alert on Reroute
                if "Switch" in rec:
                    add_notification(db, "REROUTE", f"🔄 Reroute recommended for {data.get('delivery_id')} due to {data.get('risk_level')} risk")
                elif "Avoid" in rec:
                    add_notification(db, "CONGESTION", f"⚠️ {rec}")

        # 4. Failsafe: Check Offline Drivers
        offline_drivers = db.collection("drivers").where("status", "==", "offline").stream()
        failsafes_triggered = 0
        for ddoc in offline_drivers:
            ddata = ddoc.to_dict()
            active_del_id = ddata.get("active_delivery_id")
            if active_del_id:
                del_ref = db.collection("deliveries").document(active_del_id)
                del_doc = del_ref.get()
                if del_doc.exists and del_doc.to_dict().get("status") in ["dispatched", "in_transit"]:
                    del_ref.update({
                        "recommended_action": "ALERT: Driver disconnected. Reassign driver immediately.",
                        "risk_level": "HIGH",
                        "updated_at": now
                    })
                    add_notification(db, "FAILSAFE", f"🚨 Driver disconnected during active delivery {active_del_id}!", "CRITICAL")
                    failsafes_triggered += 1

        return {
            "status": "success",
            "active_fleet_size": active_count,
            "recommendations_updated": updates_performed,
            "failsafes_triggered": failsafes_triggered
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/override", dependencies=[Depends(role_required(["admin"]))])
def admin_override(payload: OverrideRequest):
    """
    Allow manual admin override of system recommendations.
    """
    try:
        db = get_firestore_client()
        dref = db.collection("deliveries").document(payload.delivery_id)
        
        updates = {
            "recommended_action": f"ADMIN OVERRIDE: {payload.action.upper()}",
            "override": True,
            "override_reason": payload.reason,
            "updated_at": datetime.now(timezone.utc)
        }
        
        dref.update(updates)
        return {"status": "success", "delivery_id": payload.delivery_id, "action": payload.action}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ── Warehouse Management ──

@router.get("/warehouses", dependencies=[Depends(role_required(["admin"]))])
def list_warehouses():
    try:
        db = get_firestore_client()
        docs = db.collection("warehouses").stream()
        return [{**doc.to_dict(), "id": doc.id} for doc in docs]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/warehouses", dependencies=[Depends(role_required(["admin"]))])
def create_warehouse(payload: WarehouseCreateRequest):
    try:
        db = get_firestore_client()
        wid = f"WH-{uuid.uuid4().hex[:4].upper()}"
        doc = {
            **payload.model_dump(),
            "status": "active",
            "current_load": 0,
            "created_at": datetime.now(timezone.utc)
        }
        db.collection("warehouses").document(wid).set(doc)
        return {"status": "success", "id": wid}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ── Driver Management ──

@router.get("/drivers", dependencies=[Depends(role_required(["admin"]))])
def list_drivers():
    try:
        db = get_firestore_client()
        docs = db.collection("drivers").stream()
        return [{**doc.to_dict(), "id": doc.id} for doc in docs]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/drivers", dependencies=[Depends(role_required(["admin"]))])
def create_driver(payload: DriverCreateRequest):
    try:
        db = get_firestore_client()
        did = f"DRV-{uuid.uuid4().hex[:4].upper()}"
        doc = {
            **payload.model_dump(),
            "status": "available",
            "current_location": {"lat": 19.0760, "lon": 72.8777}, # Default center
            "completed_today": 0,
            "created_at": datetime.now(timezone.utc)
        }
        db.collection("drivers").document(did).set(doc)
        return {"status": "success", "id": did}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ── Inventory Management ──

@router.get("/inventory", dependencies=[Depends(role_required(["admin"]))])
def list_inventory():
    try:
        db = get_firestore_client()
        docs = db.collection("inventory").stream()
        return [{**doc.to_dict(), "id": doc.id} for doc in docs]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
