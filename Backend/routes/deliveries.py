"""
Delivery Management Router — Persistent lifecycle tracking with intelligence layer.
Supports: create, start, complete, list, system insights, disruption injection.
"""
from fastapi import APIRouter, HTTPException, Path, Query
from pydantic import BaseModel, Field
from Backend.services.model_service import predict_delay as predict_delay_model
from Backend.services.model_service import predict_demand as predict_demand_model
from Backend.utils.firebase_helper import get_firestore_client, get_active_deliveries_count, add_notification

import threading
import time
from Backend.routes.analyze import recommend_routes, RecommendRoutesRequest
from datetime import datetime, timezone
from typing import List, Dict, Optional
import uuid
from Backend.utils.auth_helper import role_required
from fastapi import Depends

router = APIRouter(prefix="/deliveries", tags=["deliveries"])

# Global fleet capacity (adjustable via /deliveries/fleet-scale)
FLEET_CAPACITY = 30


# ──────────────────────────────────────────────
# Pydantic Models
# ──────────────────────────────────────────────

class Location(BaseModel):
    lat: float
    lon: float

class CreateDeliveryRequest(BaseModel):
    start_location: Location
    end_location: Location
    product_id: Optional[int] = 101

class DeliveryRoute(BaseModel):
    route_id: str
    distance: float
    eta: float
    traffic_speed: float

class DeliveryResponse(BaseModel):
    delivery_id: str
    status: str
    start_location: Location
    end_location: Location
    selected_route: DeliveryRoute
    backup_route: Optional[DeliveryRoute] = None
    risk_level: str
    demand_level: str
    recommended_action: str
    explanation: Optional[str] = None
    risk_factors: Optional[List[str]] = None
    created_at: datetime
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None

class DisruptionRequest(BaseModel):
    type: str = Field(..., description="traffic_spike | weather_event | road_closure")
    affected_route: str = Field(..., description="Route ID to disrupt")
    severity: str = Field(default="HIGH", description="LOW | MEDIUM | HIGH")
    duration_minutes: int = Field(default=30)


# ──────────────────────────────────────────────
# Helper: Generate Explainability
# ──────────────────────────────────────────────

def _build_explanation(best, all_routes, active_count):
    """Generate a human-readable WHY card for route selection."""
    parts = []

    # Speed advantage
    speeds = [r.traffic_speed for r in all_routes]
    if best.traffic_speed >= max(speeds):
        parts.append(f"Highest traffic speed at {best.traffic_speed:.1f} km/h")

    # Delay advantage
    probs = [r.probability_delayed for r in all_routes]
    if best.probability_delayed <= min(probs):
        pct = round(best.probability_delayed * 100, 1)
        parts.append(f"Lowest delay probability at {pct}%")

    # Distance advantage
    dists = [r.distance for r in all_routes]
    if best.distance <= min(dists):
        parts.append(f"Shortest distance at {best.distance:.2f} km")

    # Score advantage
    scores = [r.score for r in all_routes]
    if best.score >= max(scores):
        parts.append(f"Highest composite score: {best.score:.2f}")

    # Demand context
    if active_count >= 15:
        parts.append(f"Selected under HIGH demand ({active_count} active deliveries)")
    elif active_count >= 8:
        parts.append(f"Selected under MODERATE demand ({active_count} active deliveries)")

    if not parts:
        parts.append("Best overall balance of speed, distance, and delay risk")

    return " • ".join(parts)


def _build_risk_factors(route, active_count):
    """Generate list of risk contributors for transparency."""
    factors = []
    if route.probability_delayed > 0.5:
        factors.append(f"Delay probability is {round(route.probability_delayed*100)}% (above threshold)")
    if route.traffic_speed < 20:
        factors.append(f"Traffic speed is {route.traffic_speed:.1f} km/h (congested)")
    if route.eta_ratio > 1.5:
        factors.append(f"ETA ratio is {route.eta_ratio:.2f} (heavy traffic impact)")
    if active_count >= 15:
        factors.append(f"System under HIGH demand ({active_count} active deliveries)")
    if route.risk == "HIGH":
        factors.append("Route classified as HIGH risk by ML model")
    if not factors:
        factors.append("No significant risk factors detected")
    return factors


def _determine_action(risk, active_count):
    """Generate recommended action with context."""
    if risk == "HIGH" and active_count >= 15:
        return "HOLD: Delay dispatch until demand drops — system is at critical load"
    if risk == "HIGH":
        return "CAUTION: Consider backup route — primary route has elevated risk"
    if risk == "MEDIUM" and active_count >= 10:
        return "MONITOR: Proceed with caution — moderate risk under growing demand"
    if risk == "MEDIUM":
        return "PROCEED: Route is acceptable — monitor for changes"
    return "CLEAR: Conditions are favorable — proceed as scheduled"


# ──────────────────────────────────────────────
# CRUD Endpoints
# ──────────────────────────────────────────────

@router.post("/create", dependencies=[Depends(role_required(["admin"]))])
def create_delivery(payload: CreateDeliveryRequest):
    try:
        rec_request = RecommendRoutesRequest(
            start_lat=payload.start_location.lat,
            start_lon=payload.start_location.lon,
            end_lat=payload.end_location.lat,
            end_lon=payload.end_location.lon
        )
        recommendations = recommend_routes(rec_request)

        best_route_id = recommendations.recommended_route_id
        best_route = next(r for r in recommendations.routes if r.id == best_route_id)

        # Find backup route (second best)
        sorted_routes = sorted(recommendations.routes, key=lambda r: r.score, reverse=True)
        backup = sorted_routes[1] if len(sorted_routes) > 1 else None

        # Get real-time system state
        active_count = get_active_deliveries_count()
        if active_count == -1:
            active_count = 0

        # Demand prediction
        from Backend.services.model_service import predict_demand as predict_demand_model
        demand_result = predict_demand_model({
            "product_id": payload.product_id or 101,
            "category": "Grocery & Staples",
            "order_date": datetime.now(timezone.utc).isoformat()
        })
        demand_level = demand_result.get("demand_level", "MEDIUM")

        # Explainability
        risk = best_route.risk
        explanation = _build_explanation(best_route, recommendations.routes, active_count)
        risk_factors = _build_risk_factors(best_route, active_count)
        action = _determine_action(risk, active_count)

        delivery_id = str(uuid.uuid4())

        delivery_doc = {
            "delivery_id": delivery_id,
            "status": "waiting",
            "start_location": payload.start_location.model_dump(),
            "end_location": payload.end_location.model_dump(),
            "route": [{"lat": p[0], "lon": p[1]} for p in best_route.route_path],
            "selected_route": {
                "route_id": best_route.id,
                "distance": round(best_route.distance, 2),
                "eta": round(best_route.traffic_eta, 2),
                "traffic_speed": round(best_route.traffic_speed, 2),
            },
            "backup_route": {
                "route_id": backup.id,
                "distance": round(backup.distance, 2),
                "eta": round(backup.traffic_eta, 2),
                "traffic_speed": round(backup.traffic_speed, 2),
                "route_path": [{"lat": p[0], "lon": p[1]} for p in backup.route_path]
            } if backup else None,
            "risk_level": risk,
            "demand_level": demand_level,
            "recommended_action": action,
            "explanation": explanation,
            "risk_factors": risk_factors,
            "created_at": datetime.now(timezone.utc),
        }

        db = get_firestore_client()
        db.collection("deliveries").document(delivery_id).set(delivery_doc)

        return delivery_doc

    except Exception as e:
        print(f"Error creating delivery: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{delivery_id}/move", dependencies=[Depends(role_required(["admin", "driver"]))])
def move_delivery(
    delivery_id: str = Path(...),
    step_size: int = Query(1),
    step_percent: Optional[int] = Query(None)
):
    """
    Simulate movement: Advance the driver to the next waypoint(s).
    Updates progress, location, and ETA in real-time.
    """
    try:
        db = get_firestore_client()
        del_ref = db.collection("deliveries").document(delivery_id)
        doc = del_ref.get()
        
        if not doc.exists:
            raise HTTPException(status_code=404, detail="Delivery not found")
            
        data = doc.to_dict()
        if data.get("status") not in ["dispatched", "in_transit", "nearing", "active"]:
            return {"status": "ignored", "message": f"Delivery is '{data.get('status')}', not moving."}

        route = data.get("route", [])
        if not route:
            raise HTTPException(status_code=400, detail="No route coordinates found for this delivery")

        current_idx = data.get("current_index", 0)
        route_last_idx = len(route) - 1

        # Single-point routes are effectively at destination.
        if route_last_idx <= 0:
            del_ref.update({"status": "delivered", "progress": 100, "updated_at": datetime.now(timezone.utc)})
            
            # Sync Order status
            order_id = data.get("order_id")
            if order_id:
                db.collection("orders").document(order_id).update({
                    "status": "delivered",
                    "delivered_at": datetime.now(timezone.utc)
                })
            
            # Release driver fully
            driver_id = data.get("driver_id")
            if driver_id:
                db.collection("drivers").document(driver_id).update({
                    "status": "available",
                    "active_delivery_id": None,
                    "active_order_id": None
                })
                
            return {"status": "at_destination", "message": "Driver has reached the destination."}

        target_progress = None
        if step_percent and step_percent > 0:
            # Move in deterministic percentage buckets (e.g., 25 -> 25%, 50%, 75%, 100%).
            pct_step = max(1, min(step_percent, 100))
            current_progress = float(data.get("progress", 0) or 0)
            current_bucket = int(current_progress // pct_step)
            target_progress = min((current_bucket + 1) * pct_step, 100)
            new_idx = min(round((target_progress / 100) * route_last_idx), route_last_idx)
        else:
            # Advance point-by-point for smooth road-following movement.
            move_amount = max(step_size, 0)
            new_idx = min(current_idx + move_amount, route_last_idx)
        
        if new_idx == current_idx and new_idx == len(route) - 1:
            del_ref.update({"status": "delivered", "progress": 100, "updated_at": datetime.now(timezone.utc)})
            
            # Sync Order status
            order_id = data.get("order_id")
            if order_id:
                db.collection("orders").document(order_id).update({
                    "status": "delivered",
                    "delivered_at": datetime.now(timezone.utc)
                })
                
            # Release driver fully
            driver_id = data.get("driver_id")
            if driver_id:
                db.collection("drivers").document(driver_id).update({
                    "status": "available",
                    "active_delivery_id": None,
                    "active_order_id": None
                })
                
            return {"status": "at_destination", "message": "Driver has reached the destination."}

        # Calculate new metrics
        new_loc = route[new_idx]
        progress = target_progress if target_progress is not None else round((new_idx / route_last_idx) * 100, 1)
        
        # UI-Friendly Status (Nearing)
        orig_eta = data.get("total_eta", 30)
        remaining_ratio = 1.0 - (new_idx / route_last_idx)
        new_eta = round(orig_eta * remaining_ratio, 1)
        
        status = "in_transit"
        if new_eta <= 10 and new_eta > 0:
            status = "nearing"
        elif new_idx == len(route) - 1:
            status = "delivered"

        # Decrement ETA and Distance linearly (simulated)
        orig_dist = data.get("selected_route", {}).get("distance", 10)
        new_dist = round(orig_dist * remaining_ratio, 2)

        # Update Firestore
        update_data = {
            "current_index": new_idx,
            "progress": progress,
            "eta_remaining": new_eta,
            "distance_remaining": new_dist,
            "status": status,
            "updated_at": datetime.now(timezone.utc)
        }
        del_ref.update(update_data)

        # Trigger Notifications
        customer_name = data.get("customer_name", "Customer")
        if status == "nearing" and data.get("status") != "nearing":
             add_notification("DELIVERY", f"📦 Driver is ~10 mins away from {customer_name}!", "HIGH")
        elif status == "delivered" and data.get("status") != "delivered":
             add_notification("DELIVERY", f"✅ Delivery #{delivery_id[:8]} reached {customer_name} successfully.", "NORMAL")
        
        # Sync to Driver
        driver_id = data.get("driver_id")
        if driver_id:
            driver_update = {
                "current_location": {"lat": new_loc["lat"], "lon": new_loc["lon"]},
                "status": "in_transit" if status != "delivered" else "available"
            }
            if status == "delivered":
                driver_update["active_delivery_id"] = None
                driver_update["active_order_id"] = None
            db.collection("drivers").document(driver_id).update(driver_update)

        # Sync to Order if status changed to delivered
        if status == "delivered" and data.get("status") != "delivered":
            order_id = data.get("order_id")
            if order_id:
                db.collection("orders").document(order_id).update({
                    "status": "delivered",
                    "delivered_at": datetime.now(timezone.utc)
                })

        return {
            "status": "moving",
            "delivery_id": delivery_id,
            "new_index": new_idx,
            "progress": progress,
            "location": new_loc,
            "eta_remaining": new_eta
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def _run_auto_simulation(delivery_id: str, interval: float, steps: int):
    """Background task for auto-movement."""
    while True:
        try:
            result = move_delivery(delivery_id, step_size=1)
            if result["status"] in ["at_destination", "ignored"]:
                break
            time.sleep(interval)
        except:
            break

@router.post("/{delivery_id}/simulate", dependencies=[Depends(role_required(["admin", "driver"]))])
def start_simulation(delivery_id: str = Path(...), interval: float = 3.0):
    """Trigger a background thread to move the driver every X seconds."""
    thread = threading.Thread(target=_run_auto_simulation, args=(delivery_id, interval, 1))
    thread.daemon = True
    thread.start()
    return {"status": "started", "message": f"Auto-tracking simulation started for {delivery_id}"}
    try:
        db = get_firestore_client()
        doc_ref = db.collection("deliveries").document(delivery_id)
        doc = doc_ref.get()

        if not doc.exists:
            raise HTTPException(status_code=404, detail="Delivery not found")

        data = doc.to_dict()
        route_id = data.get("selected_route", {}).get("route_id", "")
        backup = data.get("backup_route")

        # Load-balanced dispatch: check route saturation
        active_on_route = 0
        if route_id:
            active_docs = db.collection("deliveries").where("status", "==", "active").stream()
            for adoc in active_docs:
                ad = adoc.to_dict()
                if ad.get("selected_route", {}).get("route_id") == route_id:
                    active_on_route += 1

        warning = None
        if active_on_route >= 3:
            if backup:
                warning = {
                    "type": "load_balance",
                    "message": f"Route {route_id} is saturated ({active_on_route} active). Consider switching to backup route {backup.get('route_id')}.",
                    "suggestion": f"Backup route {backup.get('route_id')} has ETA {backup.get('eta')} min at {backup.get('traffic_speed')} km/h.",
                    "saturated": True,
                }
            else:
                warning = {
                    "type": "load_balance",
                    "message": f"Route {route_id} is saturated ({active_on_route} active). No backup route available — proceed with caution.",
                    "saturated": True,
                }

        doc_ref.update({
            "status": "active",
            "start_time": datetime.now(timezone.utc)
        })

        result = {"status": "success", "message": f"Delivery {delivery_id} started"}
        if warning:
            result["warning"] = warning
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{delivery_id}/complete", dependencies=[Depends(role_required(["admin", "driver"]))])

def complete_delivery(delivery_id: str = Path(...)):
    try:
        db = get_firestore_client()
        doc_ref = db.collection("deliveries").document(delivery_id)
        doc = doc_ref.get()

        if not doc.exists:
            raise HTTPException(status_code=404, detail="Delivery not found")

        data = doc.to_dict()
        start_time = data.get("start_time")
        now = datetime.now(timezone.utc)

        # Calculate performance score
        perf_score = None
        if start_time:
            predicted_eta = data.get("selected_route", {}).get("eta", 0)
            if predicted_eta > 0:
                # Simulated actual time (slightly varied from predicted)
                import random
                actual_minutes = predicted_eta * random.uniform(0.85, 1.3)
                perf_score = round(min(predicted_eta / actual_minutes, 1.0) * 100, 1)

        update = {
            "status": "completed",
            "end_time": now,
        }
        if perf_score is not None:
            update["performance_score"] = perf_score

        doc_ref.update(update)

        # Set driver status to available if assigned
        driver_id = data.get("driver_id")
        if driver_id:
            driver_ref = db.collection("drivers").document(driver_id)
            driver_doc = driver_ref.get()
            if driver_doc.exists:
                driver_ref.update({
                    "status": "available",
                    "active_delivery_id": None,
                    "active_order_id": None
                })
                
        # Set order status to delivered
        order_id = data.get("order_id")
        if order_id:
            db.collection("orders").document(order_id).update({
                "status": "delivered",
                "delivered_at": datetime.now(timezone.utc)
            })

        return {"status": "success", "message": f"Delivery {delivery_id} completed", "performance_score": perf_score}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("", dependencies=[Depends(role_required(["admin"]))])
def get_all_deliveries():
    try:
        db = get_firestore_client()
        docs = db.collection("deliveries").order_by("created_at", direction="DESCENDING").stream()

        deliveries = []
        for doc in docs:
            d = doc.to_dict()
            # Convert datetime objects for JSON
            for key in ["created_at", "start_time", "end_time"]:
                val = d.get(key)
                if val and hasattr(val, "isoformat"):
                    d[key] = val.isoformat()
            deliveries.append(d)
        return deliveries
    except Exception as e:
        print(f"Error fetching deliveries: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ──────────────────────────────────────────────
# System Intelligence Endpoints
# ──────────────────────────────────────────────

@router.get("/insights", dependencies=[Depends(role_required(["admin"]))])
def get_system_insights():
    """Central Decision Engine — aggregates system state and generates decisions."""
    try:
        db = get_firestore_client()
        all_docs = list(db.collection("deliveries").stream())

        deliveries = [d.to_dict() for d in all_docs]
        active = [d for d in deliveries if d.get("status") == "active"]
        waiting = [d for d in deliveries if d.get("status") == "waiting"]
        completed = [d for d in deliveries if d.get("status") == "completed"]

        active_count = len(active)
        total = len(deliveries)

        # Risk distribution
        high_risk = [d for d in active if d.get("risk_level") == "HIGH"]
        med_risk = [d for d in active if d.get("risk_level") == "MEDIUM"]

        # Route saturation (count active deliveries per route)
        route_load = {}
        for d in active:
            rid = d.get("selected_route", {}).get("route_id", "unknown")
            route_load[rid] = route_load.get(rid, 0) + 1

        saturated_routes = {k: v for k, v in route_load.items() if v >= 3}

        # Demand level
        demand = "NORMAL"
        if active_count >= 20:
            demand = "CRITICAL"
        elif active_count >= 12:
            demand = "HIGH"
        elif active_count >= 5:
            demand = "MODERATE"

        # Fleet utilization
        utilization = min(round((active_count / FLEET_CAPACITY) * 100), 100)

        # Avg performance score for completed deliveries
        perf_scores = [d.get("performance_score", 0) for d in completed if d.get("performance_score")]
        avg_perf = round(sum(perf_scores) / len(perf_scores), 1) if perf_scores else None

        # ── Generate Decisions ──
        decisions = []

        if active_count >= 18:
            decisions.append({
                "type": "critical",
                "title": "🚨 Surge Alert: Deploy Additional Fleet",
                "description": f"System load is at {utilization}% with {active_count} active deliveries. Deploy 5+ standby courier agents to prevent backlog.",
                "reason": f"Active count ({active_count}) exceeds surge threshold (18). Risk of delivery delays increases exponentially above this point.",
                "action": "deploy_agents",
            })

        if high_risk:
            affected_routes = set(d.get("selected_route", {}).get("route_id", "?") for d in high_risk)
            decisions.append({
                "type": "warning",
                "title": f"⚠️ {len(high_risk)} Units in HIGH Risk Zones",
                "description": f"Active deliveries on routes {', '.join(affected_routes)} are experiencing elevated risk. Consider rerouting to backup paths.",
                "reason": f"{len(high_risk)} delivery/ies have HIGH risk classification due to traffic congestion, delay probability, or adverse conditions.",
                "action": "reroute",
            })

        if saturated_routes:
            for route_id, count in saturated_routes.items():
                decisions.append({
                    "type": "warning",
                    "title": f"🔀 Route {route_id} Saturated ({count} active)",
                    "description": f"Route {route_id} has {count} concurrent deliveries. New dispatches should use alternative routes.",
                    "reason": f"Route congestion increases linearly with concurrent usage. {count} deliveries on one route reduces avg speed by ~{count * 8}%.",
                    "action": "load_balance",
                })

        if active_count > 10 and len(high_risk) > 0:
            decisions.append({
                "type": "info",
                "title": "⏸️ Strategic Dispatch Delay",
                "description": "Throttle new WAITING deliveries by 15 minutes to allow current congestion to clear.",
                "reason": f"With {active_count} active deliveries and {len(high_risk)} in HIGH risk, adding more will compound delays.",
                "action": "delay_dispatch",
            })

        if waiting and active_count >= 15:
            decisions.append({
                "type": "info",
                "title": f"📋 {len(waiting)} Deliveries Queued",
                "description": "System recommends holding WAITING deliveries until demand stabilizes below HIGH threshold.",
                "reason": "Starting additional deliveries under HIGH demand increases system-wide delay probability by ~23%.",
                "action": "hold",
            })

        if not decisions:
            decisions.append({
                "type": "success",
                "title": "✅ System Stable",
                "description": "All operations within normal parameters. No intervention required.",
                "reason": f"Active count ({active_count}) is within capacity. No HIGH risk deliveries detected.",
                "action": "none",
            })

        return {
            "active_count": active_count,
            "waiting_count": len(waiting),
            "completed_count": len(completed),
            "total_count": total,
            "demand_level": demand,
            "utilization": utilization,
            "fleet_capacity": FLEET_CAPACITY,
            "high_risk_count": len(high_risk),
            "medium_risk_count": len(med_risk),
            "route_load": route_load,
            "saturated_routes": saturated_routes,
            "avg_performance": avg_perf,
            "decisions": decisions,
        }

    except Exception as e:
        print(f"Insights error: {e}")
        return {
            "active_count": 0, "waiting_count": 0, "completed_count": 0,
            "total_count": 0, "demand_level": "UNKNOWN", "utilization": 0,
            "high_risk_count": 0, "medium_risk_count": 0,
            "route_load": {}, "saturated_routes": {},
            "avg_performance": None,
            "decisions": [{"type": "warning", "title": "⚠️ System Offline", "description": str(e), "reason": "Firebase connectivity issue", "action": "none"}],
        }


# ──────────────────────────────────────────────
# Fleet Scaling
# ──────────────────────────────────────────────

class FleetScaleRequest(BaseModel):
    action: str = Field(..., description="scale_up | scale_down | reset")
    amount: int = Field(default=5, description="Number of agents to add/remove")

@router.post("/fleet-scale", dependencies=[Depends(role_required(["admin"]))])
def scale_fleet(payload: FleetScaleRequest):
    """Dynamically adjust fleet capacity to respond to demand changes."""
    global FLEET_CAPACITY
    old_capacity = FLEET_CAPACITY

    if payload.action == "scale_up":
        FLEET_CAPACITY = min(FLEET_CAPACITY + payload.amount, 100)
    elif payload.action == "scale_down":
        FLEET_CAPACITY = max(FLEET_CAPACITY - payload.amount, 5)
    elif payload.action == "reset":
        FLEET_CAPACITY = 30

    active_count = get_active_deliveries_count()
    if active_count < 0:
        active_count = 0
    new_util = min(round((active_count / FLEET_CAPACITY) * 100), 100)

    return {
        "old_capacity": old_capacity,
        "new_capacity": FLEET_CAPACITY,
        "active_count": active_count,
        "new_utilization": new_util,
        "message": f"Fleet capacity changed from {old_capacity} to {FLEET_CAPACITY} agents.",
    }


# ──────────────────────────────────────────────
# Decision-Based Rerouting
# ──────────────────────────────────────────────

class RerouteRequest(BaseModel):
    reason: Optional[str] = Field(default=None, description="Optional override reason for the reroute")

@router.post("/{delivery_id}/reroute", dependencies=[Depends(role_required(["admin"]))])
def reroute_delivery(delivery_id: str = Path(...), payload: Optional[RerouteRequest] = None):
    """
    Decision-based reroute: Only applies when the delivery's stored decision
    warrants rerouting (HIGH risk, disruption flag, or explicit admin override).
    Recalculates route from the driver's CURRENT position to the destination.
    Falls back to current route if recalculation fails.
    """
    try:
        db = get_firestore_client()
        del_ref = db.collection("deliveries").document(delivery_id)
        doc = del_ref.get()

        if not doc.exists:
            raise HTTPException(status_code=404, detail="Delivery not found")

        data = doc.to_dict()
        status = data.get("status", "")

        # Guard: only reroute deliveries that are actively moving or dispatched
        if status not in ("dispatched", "in_transit", "nearing", "active"):
            return {
                "status": "skipped",
                "decision": "NO_REROUTE",
                "message": f"Delivery is '{status}' — not eligible for rerouting."
            }

        # ── Decision Gate ──
        # Check if stored state warrants a reroute
        risk_level = data.get("risk_level", "LOW")
        recommended_action = (data.get("recommended_action") or "").lower()
        already_rerouted = data.get("rerouted", False)

        should_reroute = False
        decision_reason = ""

        # Condition 1: Explicit admin override via payload (highest priority — always honour)
        if payload and payload.reason:
            should_reroute = True
            decision_reason = f"Admin override: {payload.reason}"

        # Condition 2: HIGH risk delivery (disruption-affected)
        elif risk_level == "HIGH":
            should_reroute = True
            decision_reason = f"HIGH risk level detected"

        # Condition 3: Recommended action explicitly mentions reroute/backup
        elif any(kw in recommended_action for kw in ["reroute", "backup", "disruption", "critical"]):
            should_reroute = True
            decision_reason = f"Stored action recommends reroute: {data.get('recommended_action', '')[:60]}"

        if not should_reroute:
            return {
                "status": "skipped",
                "decision": "KEEP_CURRENT",
                "risk_level": risk_level,
                "recommended_action": data.get("recommended_action"),
                "message": "No reroute needed — current route is optimal."
            }

        # ── Execute Reroute ──
        # 1. Determine current driver position
        current_idx = data.get("current_index", 0)
        route_points = data.get("route", [])
        if current_idx < len(route_points):
            current_pos = route_points[current_idx]
        else:
            current_pos = data.get("start_location", {})

        end_loc = data.get("end_location", {})
        if not current_pos.get("lat") or not end_loc.get("lat"):
            return {
                "status": "error",
                "decision": "REROUTE",
                "message": "Cannot reroute — missing location coordinates."
            }

        # 2. Calculate new route from current position
        try:
            rec_request = RecommendRoutesRequest(
                start_lat=current_pos["lat"],
                start_lon=current_pos["lon"],
                end_lat=end_loc["lat"],
                end_lon=end_loc["lon"]
            )
            new_recommendations = recommend_routes(rec_request)

            # Prefer a different route than the current one
            current_route_id = data.get("selected_route", {}).get("route_id", "")
            alternatives = [r for r in new_recommendations.routes if r.id != current_route_id]
            if not alternatives:
                alternatives = new_recommendations.routes

            best_new = max(alternatives, key=lambda r: r.score)
            new_route_path = [{"lat": p[0], "lon": p[1]} for p in best_new.route_path]

            # 3. Store old route for visualization, apply new route
            old_route = data.get("route", [])

            reason_text = (payload.reason if payload and payload.reason
                           else decision_reason)

            update_data = {
                "selected_route": {
                    "route_id": best_new.id,
                    "distance": round(best_new.distance, 2),
                    "eta": round(best_new.traffic_eta, 2),
                    "traffic_speed": round(best_new.traffic_speed, 2),
                },
                "route": new_route_path,
                "old_route": old_route,
                "current_index": 0,
                "total_eta": round(best_new.traffic_eta, 2),
                "eta_remaining": round(best_new.traffic_eta, 2),
                "distance_remaining": round(best_new.distance, 2),
                "rerouted": True,
                "reroute_reason": f"Decision Reroute: {reason_text}",
                "rerouted_at": datetime.now(timezone.utc),
                "recommended_action": "REROUTED: New optimal path applied by admin decision.",
            }

            del_ref.update(update_data)
            add_notification(
                "SYSTEM",
                f"🔀 Delivery #{delivery_id[:8]} rerouted — {reason_text}",
                "HIGH"
            )

            return {
                "status": "success",
                "decision": "REROUTE",
                "delivery_id": delivery_id,
                "reason": reason_text,
                "new_route_id": best_new.id,
                "new_distance": round(best_new.distance, 2),
                "new_eta": round(best_new.traffic_eta, 2),
                "message": f"Rerouted successfully. New route: {best_new.id} ({round(best_new.distance, 2)} km, ~{round(best_new.traffic_eta, 2)} min)"
            }

        except Exception as route_err:
            # ── Fallback: keep current route ──
            print(f"Reroute calculation failed for {delivery_id}: {route_err}")

            # Try backup route if available
            backup = data.get("backup_route")
            if backup and backup.get("route_path"):
                old_route = data.get("route", [])
                del_ref.update({
                    "route": backup["route_path"],
                    "old_route": old_route,
                    "selected_route": {
                        "route_id": backup.get("route_id", "backup"),
                        "distance": backup.get("distance", 0),
                        "eta": backup.get("eta", 0),
                        "traffic_speed": backup.get("traffic_speed", 0),
                    },
                    "current_index": 0,
                    "rerouted": True,
                    "reroute_reason": "Fallback: Switched to backup route (live recalculation unavailable)",
                    "rerouted_at": datetime.now(timezone.utc),
                })
                return {
                    "status": "fallback",
                    "decision": "REROUTE",
                    "delivery_id": delivery_id,
                    "message": "Live recalculation failed — applied backup route.",
                    "new_route_id": backup.get("route_id", "backup"),
                }

            # No backup available — keep current route
            return {
                "status": "kept",
                "decision": "KEEP_CURRENT",
                "delivery_id": delivery_id,
                "message": "Reroute failed and no backup available — keeping current route.",
            }

    except HTTPException:
        raise
    except Exception as e:
        print(f"Reroute error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ──────────────────────────────────────────────
# Disruption Injection
# ──────────────────────────────────────────────

@router.post("/disrupt", dependencies=[Depends(role_required(["admin"]))])
def inject_disruption(payload: DisruptionRequest):
    """Inject a disruption event — escalates risk on affected deliveries and generates response plan."""
    try:
        db = get_firestore_client()
        all_docs = list(db.collection("deliveries").stream())

        affected = []
        actions_taken = []

        for doc in all_docs:
            data = doc.to_dict()
            route_id = data.get("selected_route", {}).get("route_id", "")
            status = data.get("status", "")

            if route_id == payload.affected_route and status in ("active", "waiting", "in_transit", "dispatched", "nearing"):
                delivery_id = data.get("delivery_id", doc.id)
                old_risk = data.get("risk_level", "LOW")

                # Escalate risk
                new_risk = "HIGH" if payload.severity in ("HIGH", "MEDIUM") else "MEDIUM"

                update_data = {
                    "risk_level": new_risk,
                    "recommended_action": f"DISRUPTION: {payload.type} on {payload.affected_route} — consider backup route",
                }

                # --- DYNAMIC LIVE REROUTING ---
                # 1. Get current position for rerouting
                current_idx = data.get("current_index", 0)
                route_points = data.get("route", [])
                current_pos = route_points[current_idx] if current_idx < len(route_points) else data.get("start_location")
                
                # 2. Call routing engine for NEW options from CURRENT position
                try:
                    rec_request = RecommendRoutesRequest(
                        start_lat=current_pos["lat"],
                        start_lon=current_pos["lon"],
                        end_lat=data["end_location"]["lat"],
                        end_lon=data["end_location"]["lon"]
                    )
                    # Force variety to avoid the disrupted route if possible
                    new_recommendations = recommend_routes(rec_request)
                    
                    # Filter out the disrupted route ID if it appears in new options
                    valid_options = [r for r in new_recommendations.routes if r.id != payload.affected_route]
                    if not valid_options:
                        valid_options = new_recommendations.routes
                        
                    best_new = max(valid_options, key=lambda r: r.score)
                    
                    # 3. Store OLD route for visualization and update to NEW route
                    old_route = data.get("route", [])
                    new_route_path = [{"lat": p[0], "lon": p[1]} for p in best_new.route_path]
                    
                    update_data.update({
                        "selected_route": {
                            "route_id": best_new.id,
                            "distance": round(best_new.distance, 2),
                            "eta": round(best_new.traffic_eta, 2),
                            "traffic_speed": round(best_new.traffic_speed, 2),
                        },
                        "route": new_route_path,
                        "old_route": old_route, # Kept for frontend "faded" visualization
                        "current_index": 0, # Start at the beginning of the new segment
                        "progress": data.get("progress", 0), # Maintain progress context
                        "rerouted": True,
                        # Include the disrupted route_id in reroute_reason so the frontend
                        # can identify these deliveries even after the route_id changes.
                        "reroute_reason": f"Dynamic Reroute: {payload.type.replace('_', ' ').title()} on route {payload.affected_route}. Recalculated optimal path.",
                        "rerouted_at": datetime.now(timezone.utc),
                        "recommended_action": "CRITICAL: Disruption detected. System has recalculated the most efficient path.",
                        "status": "in_transit"
                    })
                    action_desc = f"LIVE REROUTE: Recalculated path from current pos to avoid {payload.affected_route}"
                    add_notification("SYSTEM", f"🚨 Dynamic Reroute: Delivery #{delivery_id[:8]} bypassing {payload.type.replace('_', ' ')}", "HIGH")
                
                except Exception as reroute_err:
                    print(f"Rerouting failed for {delivery_id}: {reroute_err}")
                    # Fallback to backup if live rerouting fails
                    backup = data.get("backup_route")
                    if backup and backup.get("route_path"):
                        update_data.update({
                            "route": backup.get("route_path"),
                            "rerouted": True,
                            "reroute_reason": f"Fallback Reroute: {payload.type.replace('_', ' ').title()} (Live engine error)",
                        })
                        action_desc = "Rerouted to pre-calculated backup"
                    else:
                        action_desc = f"Risk escalated from {old_risk} to {new_risk} (No alternative found)"

                db.collection("deliveries").document(delivery_id).update(update_data)

                affected.append(delivery_id)
                actions_taken.append({
                    "delivery_id": delivery_id,
                    "status": status,
                    "old_risk": old_risk,
                    "new_risk": new_risk,
                    "action": action_desc,
                })

        # Calculate system risk change
        active_count = get_active_deliveries_count()
        sys_risk = "CRITICAL" if len(affected) >= 3 else "HIGH" if len(affected) >= 1 else "MODERATE"

        return {
            "disruption_type": payload.type,
            "affected_route": payload.affected_route,
            "severity": payload.severity,
            "affected_count": len(affected),
            "affected_deliveries": affected,
            "actions_taken": actions_taken,
            "system_risk_level": sys_risk,
            "message": f"Disruption injected: {payload.type} on {payload.affected_route}. {len(affected)} deliveries affected.",
        }

    except Exception as e:
        print(f"Disruption injection error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ──────────────────────────────────────────────
# What-If Simulator
# ──────────────────────────────────────────────

class WhatIfRequest(BaseModel):
    scenario: str = Field(..., description="demand_surge | route_failure | fleet_reduction | weather_crisis")
    multiplier: float = Field(default=2.0, description="Intensity multiplier")

@router.post("/what-if", dependencies=[Depends(role_required(["admin"]))])
def what_if_simulation(payload: WhatIfRequest):
    """Simulate hypothetical scenarios without modifying actual data."""
    try:
        db = get_firestore_client()
        all_docs = list(db.collection("deliveries").stream())
        deliveries = [d.to_dict() for d in all_docs]

        active = [d for d in deliveries if d.get("status") == "active"]
        waiting = [d for d in deliveries if d.get("status") == "waiting"]
        completed = [d for d in deliveries if d.get("status") == "completed"]

        current_active = len(active)
        current_high_risk = len([d for d in active if d.get("risk_level") == "HIGH"])

        result = {
            "scenario": payload.scenario,
            "multiplier": payload.multiplier,
            "current_state": {
                "active": current_active,
                "waiting": len(waiting),
                "completed": len(completed),
                "high_risk": current_high_risk,
            },
            "projected_state": {},
            "impact_analysis": [],
            "recommended_actions": [],
        }

        if payload.scenario == "demand_surge":
            projected_active = int(current_active * payload.multiplier)
            projected_util = min(round((projected_active / 30) * 100), 100)
            new_high_risk = int(current_high_risk * payload.multiplier * 1.3)

            result["projected_state"] = {
                "active": projected_active,
                "utilization": projected_util,
                "high_risk": new_high_risk,
                "demand_level": "CRITICAL" if projected_active >= 20 else "HIGH" if projected_active >= 12 else "MODERATE",
            }
            result["impact_analysis"] = [
                f"Active deliveries would increase from {current_active} to {projected_active}",
                f"Fleet utilization would hit {projected_util}% (capacity: 30)",
                f"HIGH risk deliveries would rise from {current_high_risk} to {new_high_risk}",
                f"Estimated delay probability increase: +{round(payload.multiplier * 15)}%",
                f"System would enter {'CRITICAL' if projected_active >= 20 else 'HIGH'} demand mode",
            ]
            result["recommended_actions"] = [
                {"action": "Scale fleet by 40%", "priority": "CRITICAL", "reason": f"Current capacity cannot handle {projected_active} concurrent deliveries"},
                {"action": "Activate backup routes for all active deliveries", "priority": "HIGH", "reason": "Primary routes will experience congestion under surge"},
                {"action": "Implement staggered dispatch (5-min intervals)", "priority": "HIGH", "reason": "Reduces route overlap and prevents bottlenecks"},
                {"action": "Enable dynamic rerouting for all in-transit units", "priority": "MEDIUM", "reason": "Allows real-time path adjustment as conditions change"},
            ]

        elif payload.scenario == "route_failure":
            affected_routes = set(d.get("selected_route", {}).get("route_id", "") for d in active)
            route_to_fail = list(affected_routes)[0] if affected_routes else "route_1"
            affected_count = len([d for d in active if d.get("selected_route", {}).get("route_id") == route_to_fail])
            has_backup = len([d for d in active if d.get("backup_route") and d.get("selected_route", {}).get("route_id") == route_to_fail])

            result["projected_state"] = {
                "failed_route": route_to_fail,
                "affected_deliveries": affected_count,
                "with_backup": has_backup,
                "without_backup": affected_count - has_backup,
                "stranded_deliveries": affected_count - has_backup,
            }
            result["impact_analysis"] = [
                f"Route {route_to_fail} failure would affect {affected_count} active deliveries",
                f"{has_backup} deliveries have backup routes and can be rerouted immediately",
                f"{affected_count - has_backup} deliveries would be stranded without alternatives",
                f"System resilience coverage: {round(has_backup/max(affected_count,1)*100)}%",
            ]
            result["recommended_actions"] = [
                {"action": f"Pre-compute backup routes for all deliveries on {route_to_fail}", "priority": "CRITICAL", "reason": f"{affected_count - has_backup} deliveries lack fallback paths"},
                {"action": "Enable circuit breaker on vulnerable routes", "priority": "HIGH", "reason": "Automatically blocks new dispatch to failed corridors"},
                {"action": "Redistribute waiting deliveries to alternative routes", "priority": "MEDIUM", "reason": "Prevents future exposure to the same failure point"},
            ]

        elif payload.scenario == "fleet_reduction":
            reduced_capacity = max(int(30 / payload.multiplier), 5)
            new_util = min(round((current_active / reduced_capacity) * 100), 100)

            result["projected_state"] = {
                "reduced_capacity": reduced_capacity,
                "utilization": new_util,
                "overloaded": current_active > reduced_capacity,
                "overflow_count": max(current_active - reduced_capacity, 0),
            }
            result["impact_analysis"] = [
                f"Fleet capacity would drop from 30 to {reduced_capacity} units",
                f"Utilization would spike to {new_util}%",
                f"{'System OVERLOADED: ' + str(current_active - reduced_capacity) + ' deliveries exceed capacity' if current_active > reduced_capacity else 'System can still handle current load'}",
                f"Average delivery time would increase by ~{round(payload.multiplier * 20)}%",
            ]
            result["recommended_actions"] = [
                {"action": "Prioritize HIGH-value deliveries", "priority": "CRITICAL", "reason": "Limited fleet must serve most critical orders first"},
                {"action": "Merge nearby deliveries into batched routes", "priority": "HIGH", "reason": "Reduces individual trips by combining deliveries"},
                {"action": "Delay LOW priority dispatches by 30 min", "priority": "MEDIUM", "reason": f"Frees {min(len(waiting), 3)} fleet slots for urgent deliveries"},
            ]

        elif payload.scenario == "weather_crisis":
            affected_pct = min(payload.multiplier * 30, 100)
            projected_high_risk = int(current_active * (affected_pct / 100))

            result["projected_state"] = {
                "affected_percentage": round(affected_pct),
                "projected_high_risk": projected_high_risk,
                "safe_deliveries": current_active - projected_high_risk,
                "recommended_suspensions": int(projected_high_risk * 0.6),
            }
            result["impact_analysis"] = [
                f"Weather event would affect ~{round(affected_pct)}% of active routes",
                f"{projected_high_risk} deliveries would escalate to HIGH risk",
                f"Recommended to suspend {int(projected_high_risk * 0.6)} deliveries preemptively",
                f"Delay probability increases by ~{round(affected_pct * 0.8)}% system-wide",
            ]
            result["recommended_actions"] = [
                {"action": "Activate weather contingency protocol", "priority": "CRITICAL", "reason": f"{round(affected_pct)}% route coverage affected"},
                {"action": f"Suspend {int(projected_high_risk * 0.6)} non-urgent deliveries", "priority": "HIGH", "reason": "Reduces exposure to hazardous conditions"},
                {"action": "Switch all affected units to covered/indoor routes", "priority": "HIGH", "reason": "Alternative paths with weather shelter available"},
                {"action": "Notify recipients of potential delays", "priority": "MEDIUM", "reason": "Proactive communication reduces complaint rate by 60%"},
            ]
        else:
            result["impact_analysis"] = ["Unknown scenario type"]
            result["recommended_actions"] = [{"action": "No simulation available for this scenario", "priority": "LOW", "reason": "Use: demand_surge, route_failure, fleet_reduction, or weather_crisis"}]

        return result

    except Exception as e:
        print(f"What-if error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ──────────────────────────────────────────────
# Resilience Score
# ──────────────────────────────────────────────

@router.get("/resilience")
def get_resilience_score():
    """Calculate system resilience based on backup coverage, recovery rate, and risk handling."""
    try:
        db = get_firestore_client()
        all_docs = list(db.collection("deliveries").stream())
        deliveries = [d.to_dict() for d in all_docs]

        if not deliveries:
            return {
                "score": 100,
                "grade": "A+",
                "factors": {"backup_coverage": 100, "risk_handling": 100, "completion_rate": 100, "recovery_speed": 100},
                "summary": "No deliveries in system — baseline resilience is optimal.",
            }

        total = len(deliveries)
        active = [d for d in deliveries if d.get("status") == "active"]
        completed = [d for d in deliveries if d.get("status") == "completed"]
        high_risk_active = [d for d in active if d.get("risk_level") == "HIGH"]

        # Factor 1: Backup Route Coverage (do deliveries have fallback?)
        with_backup = len([d for d in deliveries if d.get("backup_route")])
        backup_pct = round((with_backup / max(total, 1)) * 100)

        # Factor 2: Risk Handling (how many active are HIGH risk?)
        risk_score = 100 - (len(high_risk_active) / max(len(active), 1) * 100) if active else 100
        risk_score = round(max(risk_score, 0))

        # Factor 3: Completion Rate
        attempted = len(completed) + len(active)
        completion_rate = round((len(completed) / max(attempted, 1)) * 100) if attempted > 0 else 100

        # Factor 4: Performance (how close to predicted ETA?)
        perf_scores = [d.get("performance_score", 0) for d in completed if d.get("performance_score")]
        avg_perf = round(sum(perf_scores) / len(perf_scores)) if perf_scores else 85

        # Weighted composite
        composite = round(
            backup_pct * 0.25 +
            risk_score * 0.30 +
            completion_rate * 0.20 +
            avg_perf * 0.25
        )

        grade = "A+" if composite >= 95 else "A" if composite >= 85 else "B" if composite >= 70 else "C" if composite >= 55 else "D"

        return {
            "score": composite,
            "grade": grade,
            "factors": {
                "backup_coverage": backup_pct,
                "risk_handling": risk_score,
                "completion_rate": completion_rate,
                "recovery_speed": avg_perf,
            },
            "breakdown": [
                f"Backup Route Coverage: {backup_pct}% ({with_backup}/{total} deliveries have fallback routes)",
                f"Risk Handling: {risk_score}% ({len(high_risk_active)} of {len(active)} active deliveries are HIGH risk)",
                f"Completion Rate: {completion_rate}% ({len(completed)} completed out of {attempted} attempted)",
                f"Recovery Speed: {avg_perf}% (average delivery performance vs predicted ETA)",
            ],
            "summary": f"System resilience is {'STRONG' if composite >= 80 else 'MODERATE' if composite >= 60 else 'WEAK'}. Grade: {grade} ({composite}/100).",
        }

    except Exception as e:
        print(f"Resilience score error: {e}")
        return {"score": 0, "grade": "?", "factors": {}, "summary": str(e)}

