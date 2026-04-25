import firebase_admin
from firebase_admin import firestore
from google.cloud import firestore as gc_firestore

print(f"firebase_admin.firestore has Increment: {hasattr(firestore, 'Increment')}")
print(f"google.cloud.firestore has Increment: {hasattr(gc_firestore, 'Increment')}")
