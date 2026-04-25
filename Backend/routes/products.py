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
    
    # Simple case-insensitive match simulation
    docs = db.collection("inventory").where("quantity", ">", 0).stream()
    
    search_term = q.lower()
    for doc in docs:
        data = doc.to_dict()
        
        # Calculate available quantity
        qty = int(data.get("quantity", 0))
        reserved = int(data.get("reserved_quantity", 0))
        available = qty - reserved
        
        if available > 0:
            if search_term in data.get("name", "").lower() or search_term in data.get("sku", "").lower():
                results.append({
                    "id": doc.id,
                    **data,
                    "available_quantity": available
                })
            
    return results
