from fastapi import APIRouter, HTTPException, Path
from pydantic import BaseModel
from datetime import datetime, timezone
import uuid
from Backend.utils.firebase_helper import get_firestore_client
from Backend.utils.auth_helper import role_required
from fastapi import Depends

router = APIRouter(prefix="/supplier", tags=["supplier"])

class SupplierSubmission(BaseModel):
    supplier_id: str
    product_name: str
    sku: str
    quantity: int
    price_per_unit: float
    warehouse_id: str

@router.post("/submit", dependencies=[Depends(role_required(["supplier", "admin"]))])
def submit_product(payload: SupplierSubmission):
    """Supplier submits goods for replenishment."""
    try:
        db = get_firestore_client()
        request_id = f"SUP-{uuid.uuid4().hex[:6].upper()}"
        
        doc = {
            "request_id": request_id,
            **payload.model_dump(),
            "status": "pending",
            "created_at": datetime.now(timezone.utc)
        }
        db.collection("supplier_requests").document(request_id).set(doc)
        return {"status": "success", "request_id": request_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/requests/{request_id}/approve", dependencies=[Depends(role_required(["admin"]))])
def approve_request(request_id: str = Path(...)):
    """Admin approves supplier request and adds to inventory."""
    try:
        db = get_firestore_client()
        req_ref = db.collection("supplier_requests").document(request_id)
        req_doc = req_ref.get()
        
        if not req_doc.exists:
            raise HTTPException(status_code=404, detail="Request not found")
            
        data = req_doc.to_dict()
        current_status = str(data.get("status", "")).lower()

        if current_status == "approved":
            # Idempotent behavior: second click should not fail.
            return {"status": "success", "message": "Request already approved"}

        if current_status != "pending":
            raise HTTPException(status_code=409, detail=f"Request is '{data.get('status')}', expected 'pending'")

        # 1. Update Inventory
        # Find existing SKU in that warehouse or create new
        inv_query = db.collection("inventory") \
            .where("sku", "==", data["sku"]) \
            .where("warehouse_id", "==", data["warehouse_id"]) \
            .limit(1).get()
            
        if inv_query:
            inv_ref = db.collection("inventory").document(inv_query[0].id)
            inv_ref.update({
                "quantity": inv_query[0].to_dict()["quantity"] + data["quantity"],
                "name": data.get("product_name"),
                "price_per_unit": data.get("price_per_unit"),
                "updated_at": datetime.now(timezone.utc)
            })
        else:
            db.collection("inventory").add({
                "sku": data["sku"],
                "name": data["product_name"],
                "quantity": data["quantity"],
                "price_per_unit": data.get("price_per_unit"),
                "warehouse_id": data["warehouse_id"],
                "reserved_quantity": 0,
                "created_at": datetime.now(timezone.utc)
            })

        # 2. Mark Approved
        req_ref.update({"status": "approved", "processed_at": datetime.now(timezone.utc)})
        return {"status": "success", "message": "Inventory updated"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
