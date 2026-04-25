from fastapi import Header, HTTPException, Depends
from Backend.utils.firebase_helper import get_firestore_client

def get_current_role(x_role: str = Header(None), x_email: str = Header(None)):
    if not x_role or not x_email:
        raise HTTPException(status_code=401, detail="Authentication headers missing")
    
    # 1. Hardcoded Admin Bypass
    if x_email == "admin@logistics.com" and x_role == "admin":
        return "admin"

    # 2. Firestore Validation
    try:
        db = get_firestore_client()
        users_ref = db.collection("users")
        query = users_ref.where("email", "==", x_email).limit(1).get()
        
        if not query:
            raise HTTPException(status_code=403, detail="User not found in system")
        
        user_data = query[0].to_dict()
        db_role = user_data.get("role")
        
        if db_role != x_role:
            raise HTTPException(status_code=403, detail="Role spoofing detected")
            
        return db_role
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        raise HTTPException(status_code=500, detail=f"Auth Error: {str(e)}")

def role_required(allowed_roles: list):
    def role_checker(role: str = Depends(get_current_role)):
        if role not in allowed_roles:
            raise HTTPException(
                status_code=403, 
                detail=f"Forbidden: You do not have the required permissions"
            )
        return role
    return role_checker
