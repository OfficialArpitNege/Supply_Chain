from fastapi import APIRouter, Query
from Backend.utils.firebase_helper import get_firestore_client
from Backend.utils.auth_helper import role_required
from fastapi import Depends

router = APIRouter(prefix="/products", tags=["products"])

@router.get("/search", dependencies=[Depends(role_required(["customer", "admin"]))])
def search_products(q: str = Query("")):
    """Search available inventory across all warehouses."""
    db = get_firestore_client()
    results = []
    price_cache = {}
    
    # Simple case-insensitive match simulation
    docs = db.collection("inventory").where("quantity", ">", 0).stream()
    
    search_term = q.lower()
    for doc in docs:
        data = doc.to_dict()
        
        # Calculate available quantity (quantity field now represents unreserved stock)
        available = int(data.get("quantity", 0))
        
        if available > 0:
            if search_term in data.get("name", "").lower() or search_term in data.get("sku", "").lower():
                sku = data.get("sku")
                resolved_price = data.get("price_per_unit")

                if resolved_price is None and sku:
                    if sku in price_cache:
                        resolved_price = price_cache[sku]
                    else:
                        # Use an index-safe lookup (single where clause) and resolve the latest
                        # approved request in Python to avoid composite index requirements.
                        latest_doc = None
                        latest_ts = 0
                        for req_doc in db.collection("supplier_requests").where("sku", "==", sku).stream():
                            req_data = req_doc.to_dict()
                            if str(req_data.get("status", "")).lower() != "approved":
                                continue

                            ts = req_data.get("processed_at") or req_data.get("created_at")
                            if hasattr(ts, "timestamp"):
                                ts_value = ts.timestamp()
                            else:
                                ts_value = 0

                            if latest_doc is None or ts_value > latest_ts:
                                latest_doc = req_data
                                latest_ts = ts_value

                        if latest_doc:
                            resolved_price = latest_doc.get("price_per_unit")
                        price_cache[sku] = resolved_price

                results.append({
                    "id": doc.id,
                    **data,
                    "price_per_unit": resolved_price,
                    "unit_price": data.get("unit_price"),
                    "price": data.get("price"),
                    "available_quantity": available
                })
            
    return results
