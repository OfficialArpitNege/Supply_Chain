import os
import sys
sys.path.append("/Users/rishi/Supply_Chain")
from Backend.utils.firebase_helper import get_firestore_client
db = get_firestore_client()
docs = db.collection('deliveries').limit(2).stream()
for d in docs:
    data = d.to_dict()
    print("Delivery ID:", d.id)
    print("Status:", data.get("status"))
    route = data.get("route", [])
    print("Route length:", len(route))
    if len(route) > 0:
        print("First point:", route[0])
    old_route = data.get("old_route", [])
    print("Old Route length:", len(old_route))
    if len(old_route) > 0:
        print("First point:", old_route[0])
    print("---")
