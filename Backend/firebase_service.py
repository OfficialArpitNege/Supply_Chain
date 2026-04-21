
import firebase_admin
from firebase_admin import credentials, firestore
from fastapi import APIRouter
import logging

from Backend import app

logger = logging.getLogger("firebase_service")

# Safe Firebase initialization (only once)
if not firebase_admin._apps:
    try:
        cred = credentials.Certificate("firebase_key.json")
        firebase_admin.initialize_app(cred)
        logger.info("Firebase initialized successfully.")
    except Exception as e:
        logger.error(f"FIREBASE INIT ERROR: {e}")
        raise

db = firestore.client()

def get_active_deliveries_count():
    import threading
    logger.info("Entering get_active_deliveries_count")
    result = {"count": 0, "all_docs": [], "error": None}
    def fetch_docs():
        try:
            docs = db.collection("deliveries").stream()
            count = 0
            all_docs = []
            for doc in docs:
                data = doc.to_dict()
                all_docs.append(data)
                # Validate Firestore data format
                if not isinstance(data, dict) or "status" not in data:
                    logger.warning(f"Invalid Firestore doc: {data}")
                    continue
                if data.get("status") == "active":
                    count += 1
            result["count"] = count
            result["all_docs"] = all_docs
        except Exception as e:
            logger.error(f"FIREBASE ERROR: {e}")
            result["error"] = str(e)

    thread = threading.Thread(target=fetch_docs)
    thread.start()
    thread.join(timeout=5)  # 5 seconds timeout
    if thread.is_alive():
        logger.error("Firestore query timed out after 5 seconds")
        return 0
    count = result["count"]
    logger.info(f"ALL DOCS: {result['all_docs']}")
    logger.info(f"ACTIVE COUNT: {count}")
    if count < 0:
        logger.error(f"Count negative ({count}), forcing to 0")
        count = 0
    if count == 0:
        logger.warning("WARNING: No active deliveries found")
    logger.info("Exiting get_active_deliveries_count")
    return count

@app.get("/test-demand")
def test_demand():
    try:
        active = get_active_deliveries_count()
        return {
            "active_deliveries": active,
            "status": "success"
        }
    except Exception as e:
        logger.error(f"API ERROR: {e}")
        return {
            "active_deliveries": 0,
            "status": "error",
            "message": str(e)
        }
