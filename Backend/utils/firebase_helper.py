import firebase_admin
from firebase_admin import credentials, firestore
import os
from functools import lru_cache

# Initialize Firebase only once
@lru_cache(maxsize=1)
def get_firestore_client():
    cred_path = os.getenv("FIREBASE_CREDENTIALS")
    
    # Fallback logic to find firebase_key.json
    if not cred_path or not os.path.exists(cred_path):
        current_dir = os.path.dirname(__file__)
        candidates = [
            os.path.join(current_dir, "..", "firebase_key.json"),  # Backend/firebase_key.json
            os.path.join(os.getcwd(), "firebase_key.json"),
            os.path.join(os.getcwd(), "Backend", "firebase_key.json"),
        ]
        for candidate in candidates:
            if os.path.exists(candidate):
                cred_path = candidate
                break

    if not cred_path or not os.path.exists(cred_path):
        raise RuntimeError("FIREBASE_CREDENTIALS env var not set and firebase_key.json not found in fallback locations.")
        
    if not firebase_admin._apps:
        cred = credentials.Certificate(cred_path)
        firebase_admin.initialize_app(cred)
    return firestore.client()


def get_active_deliveries_count() -> int:
    try:
        from google.cloud.firestore_v1.base_query import FieldFilter
        db = get_firestore_client()
        deliveries_ref = db.collection("deliveries")
        query = deliveries_ref.where(filter=FieldFilter("status", "==", "active"))
        return len(list(query.stream()))
    except Exception as exc:
        # Failsafe: log and fallback
        print(f"FIREBASE ERROR: {exc}")
        return -1

