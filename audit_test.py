
import sys
import os
from datetime import datetime, timezone
from google.cloud import firestore

# Setup path
sys.path.append(os.getcwd())

from Backend.utils.firebase_helper import get_firestore_client
from Backend.routes.supplier import SupplierSubmission, submit_product, approve_request
from Backend.routes.orders import place_order, PlaceOrderRequest, CustomerLocation, OrderItem

def audit():
    db = get_firestore_client()
    print("PHASE 2: SUPPLIER FLOW")
    
    # Check if we can create a product in a non-existent warehouse
    # Code review shows it just adds to inventory collection regardless of warehouse existence
    payload = SupplierSubmission(
        supplier_id="AUDIT-002",
        product_name="Audit Beam 2",
        sku="SKU-AUDIT-2",
        quantity=100,
        price_per_unit=50.0,
        warehouse_id="WH-NON-EXISTENT"
    )
    
    res = submit_product(payload)
    req_id = res["request_id"]
    print(f"Submission ID: {req_id}")
    
    approve_request(req_id)
    print("Approval processed.")
    
    # PHASE 3: CUSTOMER ORDER FLOW (INSUFFICIENT STOCK)
    print("\nPHASE 3: CUSTOMER ORDER (STOCK VALIDATION)")
    order_req = PlaceOrderRequest(
        customer_name="Audit Customer",
        customer_phone="+91-1111111111",
        customer_location=CustomerLocation(lat=19.11, lon=72.86),
        items=[OrderItem(sku="SKU-AUDIT-2", name="Audit Beam 2", quantity=200)], # Exceeds 100
        priority="normal"
    )
    
    try:
        place_order(order_req)
        print("FAIL: Order placed with insufficient stock!")
    except Exception as e:
        print(f"PASS: Order rejected as expected: {e}")

    # PHASE 4: LOGISTICS (NO DRIVER CASE)
    # We will check if auto_assign fails gracefully
    print("\nPHASE 4: LOGISTICS (DRIVER ASSIGNMENT)")
    # Logic check: auto_assign_driver looks for drivers with status 'available'
    # and matching vehicle type (if implemented)
    
if __name__ == "__main__":
    audit()
