import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, Timestamp } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyD14dpmNNLNVQ8aSucxD84WsS5418c70QY",
  authDomain: "supplychain-cb54c.firebaseapp.com",
  projectId: "supplychain-cb54c",
  storageBucket: "supplychain-cb54c.firebasestorage.app",
  messagingSenderId: "344648311184",
  appId: "1:344648311184:web:45a80c904bda5142511315"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function seed() {
  await addDoc(collection(db, "deliveries"), {
    warehouse: "Warehouse A", destination: "Mumbai",
    status: "waiting", risk_level: "LOW",
    demand_level: "LOW", created_at: Timestamp.now()
  });

  await addDoc(collection(db, "inventory"), {
    sku: "SKU-001", name: "Test Product",
    quantity: 100, reorder_level: 20,
    warehouse: "Warehouse A", status: "in_stock"
  });

  await addDoc(collection(db, "suppliers"), {
    name: "Test Supplier", contact: "test@supplier.com",
    lead_time_days: 5, rating: 4,
    active_pos: 0, status: "active"
  });

  await addDoc(collection(db, "automation_rules"), {
    name: "Auto Reorder", trigger: "inventory",
    condition: "quantity < reorder_level",
    action: "Create PO", active: true
  });

  console.log("✅ All collections seeded!");
}

seed().catch(console.error);