from Backend.utils.firebase_helper import get_firestore_client

db = get_firestore_client()
inventory = db.collection("inventory").stream()
print("Inventory Items:")
for item in inventory:
    print(item.to_dict())

orders = db.collection("orders").stream()
print("\nOrders:")
for order in orders:
    print(order.to_dict())
