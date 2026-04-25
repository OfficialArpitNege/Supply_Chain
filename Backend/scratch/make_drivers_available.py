import sys
import os

# Add the project root to sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from Backend.utils.firebase_helper import get_firestore_client

def make_all_drivers_available():
    db = get_firestore_client()
    drivers_ref = db.collection("drivers")
    docs = drivers_ref.stream()
    
    count = 0
    for doc in docs:
        drivers_ref.document(doc.id).update({
            "status": "available",
            "active_delivery_id": None,
            "active_order_id": None
        })
        print(f"Updated driver {doc.id} to available.")
        count += 1
    
    print(f"Total drivers updated: {count}")

if __name__ == "__main__":
    make_all_drivers_available()
