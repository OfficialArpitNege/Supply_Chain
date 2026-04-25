from Backend.utils.firebase_helper import get_firestore_client
from datetime import datetime, timezone

db = get_firestore_client()

# Seed correct SKUs into WH-001 (which we know exists or should exist)
sample_inventory = [
    {"name": "Steel Rods (12mm)", "sku": "SKU-STL-12", "quantity": 500, "reserved_quantity": 0, "warehouse_id": "wh_mumbai_01", "category": "Construction"},
    {"name": "Premium Cement", "sku": "SKU-CEM-01", "quantity": 1000, "reserved_quantity": 0, "warehouse_id": "wh_mumbai_01", "category": "Construction"},
    {"name": "Industrial Bricks", "sku": "SKU-BRK-05", "quantity": 5000, "reserved_quantity": 0, "warehouse_id": "wh_mumbai_01", "category": "Construction"},
]

for item in sample_inventory:
    db.collection("inventory").add({
        **item,
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    })
print("Correct SKUs seeded.")
