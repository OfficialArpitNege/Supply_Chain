"""
Order Workflow Router — Full lifecycle: place → accept → assign → dispatch → deliver.
Integrates with: warehouses, inventory, drivers, deliveries, route API.
"""
from fastapi import APIRouter, HTTPException, Path
from pydantic import BaseModel, Field
from datetime import datetime, timezone
from typing import List, Optional
import uuid
from google.cloud import firestore
import math

from Backend.utils.firebase_helper import get_firestore_client, get_active_deliveries_count
from Backend.routes.analyze import recommend_routes, RecommendRoutesRequest
from Backend.utils.auth_helper import role_required
from fastapi import Depends

router = APIRouter(prefix="/orders", tags=["orders"])


# ──────────────────────────────────────────────
# Pydantic Models
# ──────────────────────────────────────────────

class OrderItem(BaseModel):
    sku: str
    name: str
    quantity: int = Field(..., gt=0)

class CustomerLocation(BaseModel):
    lat: float = Field(..., ge=-90, le=90)
    lon: float = Field(..., ge=-180, le=180)

class PlaceOrderRequest(BaseModel):
    customer_name: str = Field(..., min_length=1)
    customer_phone: str = Field(..., min_length=6)
    customer_location: CustomerLocation
    items: List[OrderItem] = Field(..., min_length=1)
    priority: str = Field(default="normal")
    notes: Optional[str] = None

class AcceptOrderRequest(BaseModel):
    """Optional override. If empty, system auto-selects best warehouse."""
    warehouse_id: Optional[str] = None

class AssignDriverRequest(BaseModel):
    driver_id: str


# ──────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────

def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance between two coordinates in km."""
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(dlon / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _select_best_warehouse(db, items: List[OrderItem], customer_lat: float, customer_lon: float) -> dict:
    """
    Choose the optimal warehouse based on:
      1. Product availability (all SKUs in stock)
      2. Sufficient stock (quantity >= ordered)
      3. Warehouse is active
      4. Minimum distance to customer
    """
    # Get all active warehouses
    warehouses = {}
    for wdoc in db.collection("warehouses").where("status", "==", "active").stream():
        wdata = wdoc.to_dict()
        warehouses[wdoc.id] = wdata

    if not warehouses:
        raise HTTPException(status_code=404, detail="No active warehouses found")

    # Get all inventory grouped by warehouse_id
    inventory_docs = list(db.collection("inventory").stream())
    # Build: { warehouse_id: { sku: available_qty } }
    warehouse_stock = {}
    for idoc in inventory_docs:
        idata = idoc.to_dict()
        wid = idata.get("warehouse_id")
        if not wid:
            # Fallback: match by warehouse name
            for wh_id, wh_data in warehouses.items():
                if wh_data.get("name") == idata.get("warehouse"):
                    wid = wh_id
                    break
        if not wid:
            continue

        if wid not in warehouse_stock:
            warehouse_stock[wid] = {}

        sku = idata.get("sku")
        qty = int(idata.get("quantity", 0))
        reserved = int(idata.get("reserved_quantity", 0))
        available = qty - reserved
        warehouse_stock[wid][sku] = {
            "available": available,
            "doc_id": idoc.id
        }

    # Filter warehouses that can fulfill ALL items
    candidate_warehouses = []
    for wh_id, wh_data in warehouses.items():
        stock = warehouse_stock.get(wh_id, {})
        can_fulfill = True
        for item in items:
            sku_info = stock.get(item.sku)
            if not sku_info or sku_info["available"] < item.quantity:
                can_fulfill = False
                break

        if can_fulfill:
            loc = wh_data.get("location", {})
            distance = _haversine_km(
                loc.get("lat", 0), loc.get("lon", 0),
                customer_lat, customer_lon
            )
            candidate_warehouses.append({
                "warehouse_id": wh_id,
                "warehouse_data": wh_data,
                "distance_km": round(distance, 2),
                "stock": stock
            })

    if not candidate_warehouses:
        raise HTTPException(
            status_code=409,
            detail="No warehouse can fulfill this order. Check stock availability."
        )

    # Sort by distance (closest first)
    candidate_warehouses.sort(key=lambda w: w["distance_km"])
    return candidate_warehouses[0]


# ──────────────────────────────────────────────
# Endpoints
# ──────────────────────────────────────────────

@router.post("/place", dependencies=[Depends(role_required(["customer", "admin"]))])
def place_order(payload: PlaceOrderRequest):
    """
    Stage 1: Customer places an order.
    - Stores product, quantity, destination, phone.
    - warehouse_id = null (assigned at acceptance).
    - Status: pending
    """
    try:
        order_id = f"ORD-{uuid.uuid4().hex[:8].upper()}"
        now = datetime.now(timezone.utc)

        order_doc = {
            "order_id": order_id,
            "customer_name": payload.customer_name,
            "customer_phone": payload.customer_phone,
            "customer_location": payload.customer_location.model_dump(),
            "items": [item.model_dump() for item in payload.items],
            "warehouse_id": None,       # Not assigned until accepted
            "status": "pending",
            "driver_id": None,
            "delivery_id": None,
            "priority": payload.priority,
            "total_value": None,
            "notes": payload.notes,
            "created_at": now,
            "updated_at": now,
        }

        db = get_firestore_client()
        db.collection("orders").document(order_id).set(order_doc)

        return {
            "status": "success",
            "order_id": order_id,
            "message": "Order placed successfully. Awaiting stock validation.",
            "order": order_doc
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{order_id}/accept", dependencies=[Depends(role_required(["admin"]))])
def accept_order(order_id: str = Path(...), payload: AcceptOrderRequest = AcceptOrderRequest()):
    """
    Stage 2: System validates stock and assigns warehouse.
    - Auto-selects best warehouse (closest + in-stock).
    - Reserves inventory (increments reserved_quantity).
    - Status: pending → accepted
    """
    try:
        db = get_firestore_client()
        order_ref = db.collection("orders").document(order_id)
        order_doc = order_ref.get()

        if not order_doc.exists:
            raise HTTPException(status_code=404, detail="Order not found")

        order_data = order_doc.to_dict()

        if order_data.get("status") != "pending":
            raise HTTPException(
                status_code=409,
                detail=f"Order is '{order_data.get('status')}', expected 'pending'"
            )

        # Parse items back to OrderItem objects for type safety
        items = [OrderItem(**item) for item in order_data.get("items", [])]
        cust_loc = order_data.get("customer_location", {})

        # Select warehouse (auto or override)
        if payload.warehouse_id:
            # Manual override — validate the warehouse exists and can fulfill
            wh_doc = db.collection("warehouses").document(payload.warehouse_id).get()
            if not wh_doc.exists:
                raise HTTPException(status_code=404, detail="Specified warehouse not found")
            selected = {
                "warehouse_id": payload.warehouse_id,
                "warehouse_data": wh_doc.to_dict(),
                "distance_km": 0,
                "stock": {}
            }
            # Still need stock info for reservation
            for idoc in db.collection("inventory").where("warehouse_id", "==", payload.warehouse_id).stream():
                idata = idoc.to_dict()
                selected["stock"][idata.get("sku")] = {
                    "available": int(idata.get("quantity", 0)) - int(idata.get("reserved_quantity", 0)),
                    "doc_id": idoc.id
                }
        else:
            selected = _select_best_warehouse(
                db, items,
                cust_loc.get("lat", 0), cust_loc.get("lon", 0)
            )

        # ── TRANSACTIONAL RESERVATION ──
        @firestore.transactional
        def _reserve_in_transaction(transaction, db, items, selected):
            reserved_skus = []
            for item in items:
                sku_info = selected["stock"].get(item.sku)
                if not sku_info or not sku_info.get("doc_id"):
                    raise HTTPException(status_code=400, detail=f"Item {item.sku} not available in selected warehouse")
                
                # Check actual available stock inside transaction
                inv_ref = db.collection("inventory").document(sku_info["doc_id"])
                inv_snap = inv_ref.get(transaction=transaction)
                inv_data = inv_snap.to_dict()
                
                available = inv_data.get("quantity", 0) - inv_data.get("reserved_quantity", 0)
                if available < item.quantity:
                    raise HTTPException(status_code=400, detail=f"Insufficient stock for {item.sku} during reservation")
                
                # Reserve
                transaction.update(inv_ref, {
                    "reserved_quantity": firestore.Increment(item.quantity)
                })
                reserved_skus.append({"sku": item.sku, "reserved": item.quantity})
            return reserved_skus

        transaction = db.transaction()
        reserved_skus = _reserve_in_transaction(transaction, db, items, selected)

        # Update order
        wh_data = selected["warehouse_data"]
        order_ref.update({
            "status": "accepted",
            "warehouse_id": selected["warehouse_id"],
            "updated_at": datetime.now(timezone.utc),
        })

        return {
            "status": "success",
            "order_id": order_id,
            "warehouse_selected": {
                "id": selected["warehouse_id"],
                "name": wh_data.get("name"),
                "distance_km": selected["distance_km"],
            },
            "reserved_skus": reserved_skus,
            "message": f"Order accepted. Warehouse '{wh_data.get('name')}' selected ({selected['distance_km']} km away). Inventory reserved."
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error accepting order: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{order_id}/auto-assign", dependencies=[Depends(role_required(["admin"]))])
def auto_assign_driver(order_id: str = Path(...)):
    """
    Stage 3 (Auto): Find the nearest available driver and assign them.
    - Queries all drivers with status 'available'.
    - Calculates distance from the assigned warehouse.
    - Assigns the closest driver.
    - Status: accepted → assigned
    """
    try:
        db = get_firestore_client()
        order_ref = db.collection("orders").document(order_id)
        order_doc = order_ref.get()

        if not order_doc.exists:
            raise HTTPException(status_code=404, detail="Order not found")

        order_data = order_doc.to_dict()
        if order_data.get("status") != "accepted":
            raise HTTPException(
                status_code=409,
                detail=f"Order is '{order_data.get('status')}', expected 'accepted'"
            )

        warehouse_id = order_data.get("warehouse_id")
        if not warehouse_id:
            raise HTTPException(status_code=400, detail="Warehouse not assigned to this order yet")

        # Get warehouse location
        wh_doc = db.collection("warehouses").document(warehouse_id).get()
        if not wh_doc.exists:
            raise HTTPException(status_code=404, detail="Warehouse not found")
        wh_loc = wh_doc.to_dict().get("location", {})
        wh_lat, wh_lon = wh_loc.get("lat"), wh_loc.get("lon")

        # 1. Calculate Order Size for Vehicle Matching
        total_items = sum(item.get("quantity", 0) for item in order_data.get("items", []))
        
        # Vehicle Capacity Logic:
        # bike: <= 20 items | van: <= 100 items | truck: <= 500 items | trailer: 500+
        required_vehicle_types = ["trailer"]
        if total_items <= 20:
            required_vehicle_types = ["bike", "van", "truck", "trailer"]
        elif total_items <= 100:
            required_vehicle_types = ["van", "truck", "trailer"]
        elif total_items <= 500:
            required_vehicle_types = ["truck", "trailer"]

        # 2. Find and Filter Drivers
        available_drivers = []
        # Fix: Add distance threshold (Geographical Realism)
        ASSIGNMENT_RADIUS_KM = 10.0
        
        status_counts = {
            "available": 0, 
            "wrong_vehicle": 0, 
            "too_far": 0
        }
        
        for ddoc in db.collection("drivers").where("status", "==", "available").stream():
            ddata = ddoc.to_dict()
            status_counts["available"] += 1
            
            # Check Vehicle Type Match
            if ddata.get("vehicle_type") not in required_vehicle_types:
                status_counts["wrong_vehicle"] += 1
                continue
                
            dloc = ddata.get("current_location", {})
            dist = _haversine_km(wh_lat, wh_lon, dloc.get("lat", 0), dloc.get("lon", 0))
            
            # Check Distance Threshold
            if dist > ASSIGNMENT_RADIUS_KM:
                status_counts["too_far"] += 1
                continue
            
            available_drivers.append({
                "id": ddoc.id,
                "data": ddata,
                "distance": dist,
                "completed_today": ddata.get("completed_today", 0)
            })

        # 3. Fallback Handling
        if not available_drivers:
            if status_counts["available"] == 0:
                reason = "All drivers are currently busy or offline."
            elif status_counts['too_far'] > 0 and (len(available_drivers) == 0):
                reason = f"No nearby drivers available within the {ASSIGNMENT_RADIUS_KM}km service radius."
            else:
                reason = f"Found {status_counts['available']} available drivers, but none match the vehicle capacity ({required_vehicle_types}) or distance requirements."
                
            return {
                "status": "fallback",
                "order_id": order_id,
                "reason": reason,
                "service_radius_km": ASSIGNMENT_RADIUS_KM,
                "action_required": "Please wait for a nearby driver to become available or manually override assignment.",
                "stats": status_counts
            }

        # 4. Multi-Factor Selection (Load Balancing + Distance)
        # Sort primary by completed_today (fewer first), secondary by distance (nearest first)
        available_drivers.sort(key=lambda d: (d["completed_today"], d["distance"]))
        
        best_driver = available_drivers[0]
        driver_id = best_driver["id"]
        driver_data = best_driver["data"]

        now = datetime.now(timezone.utc)

        # Update driver
        db.collection("drivers").document(driver_id).update({
            "status": "assigned",
            "updated_at": now
        })

        # Update order
        order_ref.update({
            "status": "assigned",
            "driver_id": driver_id,
            "updated_at": now,
        })

        return {
            "status": "success",
            "order_id": order_id,
            "driver": {
                "id": driver_id,
                "name": driver_data.get("name"),
                "distance_to_warehouse_km": round(best_driver["distance"], 2),
                "vehicle": driver_data.get("vehicle_type"),
                "completed_today": best_driver["completed_today"]
            },
            "selection_logic": {
                "factor_1": "Vehicle capacity matched",
                "factor_2": f"Load balanced (Driver has only {best_driver['completed_today']} completed today)",
                "factor_3": "Nearest among balanced group"
            },
            "message": f"Driver '{driver_data.get('name')}' ({driver_data.get('vehicle_type')}) auto-assigned based on capacity and workload."
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error auto-assigning driver: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{order_id}/assign", dependencies=[Depends(role_required(["admin"]))])
def assign_driver(order_id: str = Path(...), payload: AssignDriverRequest = None):
    """
    Stage 3: Assign a driver to the order.
    - Validates driver is available.
    - Updates driver status to 'assigned'.
    - Status: accepted → assigned
    """
    try:
        db = get_firestore_client()
        order_ref = db.collection("orders").document(order_id)
        order_doc = order_ref.get()

        if not order_doc.exists:
            raise HTTPException(status_code=404, detail="Order not found")

        order_data = order_doc.to_dict()
        if order_data.get("status") != "accepted":
            raise HTTPException(
                status_code=409,
                detail=f"Order is '{order_data.get('status')}', expected 'accepted'"
            )

        # Validate driver
        driver_ref = db.collection("drivers").document(payload.driver_id)
        driver_doc = driver_ref.get()

        if not driver_doc.exists:
            raise HTTPException(status_code=404, detail="Driver not found")

        driver_data = driver_doc.to_dict()
        if driver_data.get("status") not in ("available",):
            raise HTTPException(
                status_code=409,
                detail=f"Driver is '{driver_data.get('status')}', must be 'available'"
            )

        now = datetime.now(timezone.utc)

        # Update driver
        driver_ref.update({
            "status": "assigned",
            "active_delivery_id": None,  # Will be set at dispatch
        })

        # Update order
        order_ref.update({
            "status": "assigned",
            "driver_id": payload.driver_id,
            "updated_at": now,
        })

        return {
            "status": "success",
            "order_id": order_id,
            "driver": {
                "id": payload.driver_id,
                "name": driver_data.get("name"),
                "vehicle": driver_data.get("vehicle_type"),
            },
            "message": f"Driver '{driver_data.get('name')}' assigned to order."
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{order_id}/dispatch", dependencies=[Depends(role_required(["admin"]))])
def dispatch_order(order_id: str = Path(...)):
    """
    Stage 4: Create delivery, generate route, dispatch vehicle.
    - Creates a delivery document linked to order + warehouse.
    - Reuses existing /recommend-routes API for route generation.
    - Decrements warehouse load and inventory.
    - Status: assigned → dispatched
    """
    try:
        db = get_firestore_client()
        order_ref = db.collection("orders").document(order_id)
        order_doc = order_ref.get()

        if not order_doc.exists:
            raise HTTPException(status_code=404, detail="Order not found")

        order_data = order_doc.to_dict()
        if order_data.get("status") != "assigned":
            raise HTTPException(
                status_code=409,
                detail=f"Order is '{order_data.get('status')}', expected 'assigned'"
            )

        warehouse_id = order_data.get("warehouse_id")
        driver_id = order_data.get("driver_id")
        cust_loc = order_data.get("customer_location", {})

        # Get warehouse location for route generation
        wh_doc = db.collection("warehouses").document(warehouse_id).get()
        if not wh_doc.exists:
            raise HTTPException(status_code=404, detail="Warehouse not found")
        wh_data = wh_doc.to_dict()
        wh_loc = wh_data.get("location", {})

        # ── ML-DRIVEN DEMAND PREDICTION ──
        from Backend.services.model_service import predict_demand as predict_demand_model
        demand_result = predict_demand_model({
            "product_id": 101,
            "category": "Grocery & Staples",
            "order_date": datetime.now(timezone.utc).isoformat()
        })
        demand_level = demand_result.get("demand_level", "MEDIUM")

        # ── ML-INTEGRATED ROUTE GENERATION ──
        rec_request = RecommendRoutesRequest(
            start_lat=wh_loc.get("lat"),
            start_lon=wh_loc.get("lon"),
            end_lat=cust_loc.get("lat"),
            end_lon=cust_loc.get("lon"),
        )
        recommendations = recommend_routes(rec_request)
        
        # ── DEMAND-AWARE SELECTION ──
        all_eval_routes = [r.model_dump() for r in recommendations.routes]
        
        # If Demand is HIGH, prioritize Reliability (lowest delay_prob) over Score
        if demand_level == "HIGH":
            sorted_routes = sorted(recommendations.routes, key=lambda r: (r.probability_delayed, -r.score))
            best_route = sorted_routes[0]
            selection_mode = "RELIABILITY_FIRST (High Demand)"
        else:
            sorted_routes = sorted(recommendations.routes, key=lambda r: r.score, reverse=True)
            best_route = sorted_routes[0]
            selection_mode = "SCORE_OPTIMIZED"

        backup = sorted_routes[1] if len(sorted_routes) > 1 else None

        # Calculate Confidence Score (Percentage + Label)
        raw_conf = 1.0
        if backup:
            score_diff = abs(best_route.score - backup.score)
            raw_conf = min(score_diff / max(best_route.score, 0.1), 1.0)
        
        confidence_pct = round(raw_conf * 100, 1)
        if confidence_pct < 30:
            confidence_label = "LOW"
        elif confidence_pct < 70:
            confidence_label = "MEDIUM"
        else:
            confidence_label = "HIGH"

        # ── METRIC-BASED EXPLANATION (STRUCTURED) ──
        explanation_bullets = []
        if backup:
            risk_diff = round((backup.probability_delayed - best_route.probability_delayed) * 100, 1)
            eta_diff = round(best_route.traffic_eta - backup.traffic_eta, 1)
            
            explanation_bullets.append(f"- Delay risk is {abs(risk_diff)}% {'lower' if risk_diff > 0 else 'higher'} than alternative")
            explanation_bullets.append(f"- ETA is {abs(eta_diff)} minutes {'longer' if eta_diff > 0 else 'shorter'}")
        else:
            explanation_bullets.append("- No viable alternative routes found for comparison")

        final_explanation = f"Confidence: {confidence_label} ({confidence_pct}%)\n\n"
        final_explanation += f"Selected Route {best_route.id} because:\n" + "\n".join(explanation_bullets)
        final_explanation += f"\n\nFinal Decision:\nPrioritized {'reliability' if demand_level == 'HIGH' else 'efficiency'} due to {demand_level} system demand."

        # ── REJECTED REASONS FOR AUDIT ──
        for route in all_eval_routes:
            if route["id"] == best_route.id:
                route["rejected_reason"] = None
                continue
            
            # Simple rejection logic
            if route["probability_delayed"] > best_route.probability_delayed:
                route["rejected_reason"] = f"Higher delay probability (+{round((route['probability_delayed'] - best_route.probability_delayed)*100, 1)}%)"
            elif route["traffic_eta"] > best_route.traffic_eta:
                route["rejected_reason"] = f"Longer estimated arrival (+{round(route['traffic_eta'] - best_route.traffic_eta, 1)}m)"
            else:
                route["rejected_reason"] = "Lower overall composite score"

        # ── Build route waypoints ──
        route_waypoints = []
        if best_route.route_path:
            route_waypoints.append({"lat": wh_loc.get("lat"), "lon": wh_loc.get("lon"), "label": wh_data.get("name", "Warehouse")})
            path = best_route.route_path
            step = max(1, len(path) // 4)
            for i in range(step, len(path) - 1, step):
                route_waypoints.append({"lat": path[i][0], "lon": path[i][1], "label": f"Waypoint {len(route_waypoints)}"})
            route_waypoints.append({"lat": cust_loc.get("lat"), "lon": cust_loc.get("lon"), "label": order_data.get("customer_name", "Customer")})

        now = datetime.now(timezone.utc)
        delivery_id = f"DEL-{uuid.uuid4().hex[:8].upper()}"
        total_eta = round(best_route.traffic_eta, 2)
        total_distance = round(best_route.distance, 2)

        # ── LOAD BALANCING CHECK (CRITICAL) ──
        active_on_route = 0
        for doc in db.collection("deliveries").where("status", "in", ["dispatched", "in_transit"]).where("selected_route.route_id", "==", best_route.id).stream():
            active_on_route += 1
            
        recommended_action = f"DISPATCH: Route {best_route.id} ({selection_mode})"
        if active_on_route >= 5:
            recommended_action = f"LOAD ALERT: Route {best_route.id} has {active_on_route} active deliveries. Consider manual reroute to backup."
            # Trigger Live Alert
            db.collection("notifications").add({
                "type": "CONGESTION",
                "message": f"⚠️ Route {best_route.id} overloaded ({active_on_route} deliveries) — reroute suggested",
                "priority": "MEDIUM",
                "created_at": now,
                "read": False
            })

        # ── GOOGLE MAPS NAVIGATION LINK ──
        nav_link = f"https://www.google.com/maps/dir/?api=1&origin={wh_loc.get('lat')},{wh_loc.get('lon')}&destination={cust_loc.get('lat')},{cust_loc.get('lon')}&travelmode=driving"

        delivery_doc = {
            "delivery_id": delivery_id,
            "order_id": order_id,
            "driver_id": driver_id,
            "warehouse_id": warehouse_id,
            "status": "dispatched",
            "navigation_link": nav_link, # ADDED
            "start_location": {"lat": wh_loc.get("lat"), "lon": wh_loc.get("lon")},
            "end_location": {"lat": cust_loc.get("lat"), "lon": cust_loc.get("lon")},
            "selected_route": {
                "route_id": best_route.id,
                "distance": total_distance,
                "eta": total_eta,
                "traffic_speed": round(best_route.traffic_speed, 2),
                "delay_prob": round(best_route.probability_delayed, 4),
                "score": best_route.score
            },
            "backup_route": {
                "route_id": backup.id,
                "distance": round(backup.distance, 2),
                "eta": round(backup.traffic_eta, 2),
                "traffic_speed": round(backup.traffic_speed, 2),
            } if backup else None,
            "all_routes": all_eval_routes,
            "confidence_score": confidence_pct,
            "confidence_label": confidence_label,
            "selection_mode": selection_mode,
            "route": route_waypoints,
            "current_index": 0,
            "progress": 0,
            "eta_remaining": total_eta,
            "total_eta": total_eta,
            "distance_remaining": total_distance,
            "risk_level": best_route.risk,
            "demand_level": demand_level,
            "recommended_action": recommended_action,
            "explanation": final_explanation,
            "decision_timestamp": now.isoformat(),
            "created_at": now,
            "assigned_at": now,
            "dispatched_at": now,
            "start_time": now,
            "end_time": None,
        }

        # Persist delivery
        db.collection("deliveries").document(delivery_id).set(delivery_doc)

        # Update order
        order_ref.update({
            "status": "dispatched",
            "delivery_id": delivery_id,
            "updated_at": now,
        })

        # Update driver
        db.collection("drivers").document(driver_id).update({
            "status": "in_transit",
            "active_delivery_id": delivery_id,
        })

        # Decrement warehouse inventory load
        items = order_data.get("items", [])
        total_units = sum(item.get("quantity", 0) for item in items)

        from google.cloud.firestore_v1 import Increment
        db.collection("warehouses").document(warehouse_id).update({
            "current_load": Increment(-total_units),
            "current_inventory_load": Increment(-total_units),
            "updated_at": now,
        })

        # Finalize inventory: decrement quantity AND reserved_quantity
        for item in items:
            inv_docs = db.collection("inventory") \
                .where("warehouse_id", "==", warehouse_id) \
                .where("sku", "==", item.get("sku")) \
                .stream()
            for inv_doc in inv_docs:
                db.collection("inventory").document(inv_doc.id).update({
                    "quantity": Increment(-item.get("quantity", 0)),
                    "reserved_quantity": Increment(-item.get("quantity", 0)),
                })

        return {
            "status": "success",
            "order_id": order_id,
            "delivery_id": delivery_id,
            "route": {
                "id": best_route.id,
                "distance_km": total_distance,
                "eta_minutes": total_eta,
                "waypoints": len(route_waypoints),
            },
            "driver_id": driver_id,
            "message": f"Order dispatched. Delivery {delivery_id} created with route {best_route.id} ({total_distance} km, ~{total_eta} min)."
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error dispatching order: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{order_id}/deliver", dependencies=[Depends(role_required(["admin", "driver"]))])
def deliver_order(order_id: str = Path(...)):
    """
    Stage 5: Mark order as delivered.
    - Completes delivery and frees driver.
    - Status: dispatched → delivered
    """
    try:
        db = get_firestore_client()
        order_ref = db.collection("orders").document(order_id)
        order_doc = order_ref.get()

        if not order_doc.exists:
            raise HTTPException(status_code=404, detail="Order not found")

        order_data = order_doc.to_dict()
        if order_data.get("status") != "dispatched":
            raise HTTPException(
                status_code=409,
                detail=f"Order is '{order_data.get('status')}', expected 'dispatched'"
            )

        delivery_id = order_data.get("delivery_id")
        driver_id = order_data.get("driver_id")
        now = datetime.now(timezone.utc)

        # Complete delivery
        if delivery_id:
            del_ref = db.collection("deliveries").document(delivery_id)
            del_doc = del_ref.get()
            if del_doc.exists:
                del_data = del_doc.to_dict()
                route = del_data.get("route", [])
                del_ref.update({
                    "status": "delivered",
                    "current_index": len(route) - 1 if route else 0,
                    "progress": 100,
                    "eta_remaining": 0,
                    "distance_remaining": 0,
                    "end_time": now,
                })

        # Free driver
        if driver_id:
            driver_ref = db.collection("drivers").document(driver_id)
            driver_doc = driver_ref.get()
            if driver_doc.exists:
                from google.cloud.firestore_v1 import Increment
                driver_ref.update({
                    "status": "available",
                    "active_delivery_id": None,
                    "completed_today": Increment(1),
                })

        # Update order
        order_ref.update({
            "status": "delivered",
            "updated_at": now,
        })

        return {
            "status": "success",
            "order_id": order_id,
            "delivery_id": delivery_id,
            "message": "Order delivered successfully. Driver released."
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/")
def list_orders(status: Optional[str] = None):
    """List all orders, optionally filtered by status."""
    try:
        db = get_firestore_client()
        q = db.collection("orders")
        if status:
            q = q.where("status", "==", status)

        orders = []
        for doc in q.stream():
            data = doc.to_dict()
            # Serialize datetime objects for JSON
            for key in ("created_at", "updated_at"):
                if data.get(key) and hasattr(data[key], "isoformat"):
                    data[key] = data[key].isoformat()
            orders.append(data)

        return {"orders": orders, "count": len(orders)}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{order_id}")
def get_order(order_id: str = Path(...)):
    """Get a single order with full details."""
    try:
        db = get_firestore_client()
        doc = db.collection("orders").document(order_id).get()

        if not doc.exists:
            raise HTTPException(status_code=404, detail="Order not found")

        data = doc.to_dict()
        for key in ("created_at", "updated_at"):
            if data.get(key) and hasattr(data[key], "isoformat"):
                data[key] = data[key].isoformat()

        return data

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
