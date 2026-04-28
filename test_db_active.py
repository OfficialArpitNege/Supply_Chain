import os
import sys
import json
sys.path.append("/Users/rishi/Supply_Chain")
from Backend.utils.firebase_helper import get_firestore_client
db = get_firestore_client()
docs = db.collection('deliveries').where('status', 'in', ['active', 'in_transit', 'dispatched', 'nearing']).limit(2).stream()
output = []
for d in docs:
    data = d.to_dict()
    route = data.get("route", [])
    output.append({
        "id": d.id,
        "route_len": len(route),
        "route_sample": route[:2] if len(route) > 0 else None,
        "selected_route": data.get("selected_route")
    })
with open("test_out.json", "w") as f:
    json.dump(output, f, indent=2)
