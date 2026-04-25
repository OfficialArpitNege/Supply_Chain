from fastapi import APIRouter, HTTPException, BackgroundTasks
from datetime import datetime, timezone
import uuid
import time
import random

from Backend.utils.firebase_helper import get_firestore_client
from Backend.routes.orders import place_order, accept_order, auto_assign_driver, dispatch_order, PlaceOrderRequest, CustomerLocation, OrderItem
from Backend.routes.deliveries import start_simulation

router = APIRouter(prefix="/demo", tags=["demo"])

# Sample Data for Automation
LOCATIONS = [
    {"name": "Andheri Retailer", "lat": 19.1136, "lon": 72.8697},
    {"name": "Bandra Store", "lat": 19.0596, "lon": 72.8295},
    {"name": "Powai Hub", "lat": 19.1176, "lon": 72.9060},
    {"name": "Dadar Market", "lat": 19.0178, "lon": 72.8478},
    {"name": "Vashi Outlet", "lat": 19.0745, "lon": 72.9978}
]

def _ensure_baseline_data(db):
    """Create sample warehouses and drivers if the database is empty."""
    # 1. Warehouses
    wh_snap = db.collection("warehouses").limit(1).get()
    if not wh_snap:
        sample_warehouses = [
            {"name": "Mumbai Central Hub", "location": {"lat": 19.1176, "lon": 72.9060}, "capacity": 1000, "status": "active", "current_load": 0},
            {"name": "Bandra Logistics Center", "location": {"lat": 19.0596, "lon": 72.8295}, "capacity": 500, "status": "active", "current_load": 0}
        ]
        for wh in sample_warehouses:
            db.collection("warehouses").document().set(wh)

    # 2. Drivers
    dr_snap = db.collection("drivers").limit(1).get()
    if not dr_snap:
        sample_drivers = [
            {"name": "Rahul Sharma", "email": "rahul@driver.com", "status": "available", "vehicle_type": "van", "current_location": {"lat": 19.1000, "lon": 72.8500}, "completed_today": 0},
            {"name": "Amit Patel", "email": "amit@driver.com", "status": "available", "vehicle_type": "truck", "current_location": {"lat": 19.0800, "lon": 72.8800}, "completed_today": 0},
            {"name": "Vikram Singh", "email": "vikram@driver.com", "status": "available", "vehicle_type": "bike", "current_location": {"lat": 19.1200, "lon": 72.8900}, "completed_today": 0}
        ]
        for dr in sample_drivers:
            db.collection("drivers").document().set(dr)

    # 3. Inventory
    inv_snap = db.collection("inventory").limit(1).get()
    if not inv_snap:
        # Get a warehouse ID
        wh_id = db.collection("warehouses").limit(1).get()[0].id
        sample_inventory = [
            {"name": "Steel Rods", "sku": "SKU-001", "quantity": 500, "reserved_quantity": 0, "warehouse_id": wh_id},
            {"name": "Cement Bags", "sku": "SKU-002", "quantity": 300, "reserved_quantity": 0, "warehouse_id": wh_id}
        ]
        for inv in sample_inventory:
            db.collection("inventory").document().set(inv)

def _run_full_demo():
    """Automated background worker for the demo flow."""
    db = get_firestore_client()
    _ensure_baseline_data(db)
    
    # 2. Start 5 Parallel Workflows
    for i in range(5):
        try:
            loc = LOCATIONS[i]
            # Stage 1: Place Order
            req = PlaceOrderRequest(
                customer_name=loc["name"],
                customer_phone=f"+91-900000000{i}",
                customer_location=CustomerLocation(lat=loc["lat"], lon=loc["lon"]),
                items=[OrderItem(sku="SKU-001", name="Steel Rods", quantity=random.randint(5, 20))],
                priority="high" if i % 2 == 0 else "normal"
            )
            res_place = place_order(req)
            order_id = res_place["order_id"]
            time.sleep(1)
            
            # Stage 2: Accept (Auto Warehouse)
            accept_order(order_id)
            time.sleep(1)
            
            # Stage 3: Auto Assign Driver
            res_assign = auto_assign_driver(order_id)
            time.sleep(1)
            
            # Stage 4: Dispatch (ML Route Generation)
            if res_assign["status"] == "success":
                res_dispatch = dispatch_order(order_id)
                delivery_id = res_dispatch["delivery_id"]
                
                # Stage 5: Start Simulation (Live Tracking)
                start_simulation(delivery_id, interval=2.0)
                
            print(f"Demo Order {i+1} live: {order_id}")
        except Exception as e:
            print(f"Demo Step Failed: {e}")

@router.post("/start")
def start_demo(background_tasks: BackgroundTasks):
    """
    ONE-CLICK HACKATHON MODE:
    Automates 5 full order lifecycles from placement to live simulation.
    """
    background_tasks.add_task(_run_full_demo)
    return {
        "status": "success", 
        "message": "Demo mode initiated. 5 orders are being processed and simulated."
    }

@router.get("/health")
def get_system_health():
    """
    Control Tower Health Metric.
    Computes global health based on risk and demand.
    """
    try:
        db = get_firestore_client()
        active = list(db.collection("deliveries").where("status", "in", ["dispatched", "in_transit", "nearing"]).stream())
        
        if not active:
            return {"status": "GREEN", "score": 100, "message": "System Idle - Optimal"}
            
        high_risk_count = 0
        total_risk = 0
        for doc in active:
            data = doc.to_dict()
            risk = data.get("risk_level", "LOW")
            if risk == "HIGH": 
                high_risk_count += 1
                total_risk += 3
            elif risk == "MEDIUM":
                total_risk += 1
        
        # Scoring logic
        avg_risk = total_risk / len(active)
        load_factor = len(active) / 15.0 # Max demo fleet 15
        
        health_score = 100 - (avg_risk * 20) - (load_factor * 10)
        health_score = max(0, min(100, health_score))
        
        status = "GREEN"
        if health_score < 40 or high_risk_count >= 3:
            status = "RED"
        elif health_score < 75:
            status = "YELLOW"
            
        return {
            "status": status,
            "score": round(health_score, 1),
            "active_deliveries": len(active),
            "high_risk_alerts": high_risk_count,
            "system_load": f"{round(load_factor * 100)}%"
        }
    except Exception as e:
        return {"status": "UNKNOWN", "error": str(e)}
