/**
 * Seed script for extended Firestore collections (v2).
 * Run with: node seed_extended.js
 * 
 * v2 changes applied:
 *   Fix #1  — orders.warehouse_id optional (null at pending)
 *   Fix #2  — orders.customer_phone added
 *   Fix #3  — inventory.reserved_quantity added
 *   Fix #9  — drivers.status uses new values (available/assigned/in_transit/offline)
 *   Fix #10 — warehouses.current_inventory_load added alongside current_load
 * 
 * NOTE: Does NOT touch existing deliveries, suppliers, purchase_orders, or automation_rules.
 */

import { initializeApp } from "firebase/app";
import { getFirestore, collection, doc, setDoc, updateDoc, getDocs, Timestamp } from "firebase/firestore";

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

// ─────────────────────────────────────────────────
// Fix #10: Warehouses — add current_inventory_load
// ─────────────────────────────────────────────────
async function seedWarehouses() {
  const warehouses = [
    {
      warehouse_id: "WH-001",
      name: "Thane Central Hub",
      location: { lat: 19.2183, lon: 72.9781 },
      capacity: 5000,
      current_load: 3200,                 // kept for backward compat
      current_inventory_load: 3200,       // Fix #10: clarified name
      status: "active",
      zone: "North Mumbai",
      created_at: Timestamp.now(),
      updated_at: Timestamp.now()
    },
    {
      warehouse_id: "WH-002",
      name: "Andheri Distribution Center",
      location: { lat: 19.1136, lon: 72.8697 },
      capacity: 3000,
      current_load: 1800,
      current_inventory_load: 1800,
      status: "active",
      zone: "West Mumbai",
      created_at: Timestamp.now(),
      updated_at: Timestamp.now()
    },
    {
      warehouse_id: "WH-003",
      name: "Colaba Port Terminal",
      location: { lat: 18.9220, lon: 72.8347 },
      capacity: 8000,
      current_load: 6100,
      current_inventory_load: 6100,
      status: "active",
      zone: "South Mumbai",
      created_at: Timestamp.now(),
      updated_at: Timestamp.now()
    }
  ];

  for (const wh of warehouses) {
    await setDoc(doc(db, "warehouses", wh.warehouse_id), wh);
  }
  console.log(`✅ Seeded ${warehouses.length} warehouses (with current_inventory_load)`);
}

// ─────────────────────────────────────────────────
// Fix #9: Drivers — updated status values
// ─────────────────────────────────────────────────
async function seedDrivers() {
  const drivers = [
    {
      driver_id: "DRV-001",
      name: "Rajesh Kumar",
      phone: "+91-9876543210",
      vehicle_type: "van",
      license_plate: "MH-04-AB-1234",
      current_location: { lat: 19.0760, lon: 72.8777 },
      status: "available",                // Fix #9: was "available" (unchanged)
      assigned_warehouse_id: "WH-001",
      active_delivery_id: null,
      completed_today: 3,
      rating: 4.2,
      created_at: Timestamp.now()
    },
    {
      driver_id: "DRV-002",
      name: "Amit Sharma",
      phone: "+91-9876543211",
      vehicle_type: "truck",
      license_plate: "MH-02-CD-5678",
      current_location: { lat: 19.2183, lon: 72.9781 },
      status: "assigned",                 // Fix #9: demonstrating new status
      assigned_warehouse_id: "WH-001",
      active_delivery_id: null,
      completed_today: 1,
      rating: 4.5,
      created_at: Timestamp.now()
    },
    {
      driver_id: "DRV-003",
      name: "Priya Desai",
      phone: "+91-9876543212",
      vehicle_type: "bike",
      license_plate: "MH-01-EF-9012",
      current_location: { lat: 19.1136, lon: 72.8697 },
      status: "in_transit",              // Fix #9: replaces old "en_route"
      assigned_warehouse_id: "WH-002",
      active_delivery_id: "DEL-demo-001",
      completed_today: 5,
      rating: 4.8,
      created_at: Timestamp.now()
    }
  ];

  for (const drv of drivers) {
    await setDoc(doc(db, "drivers", drv.driver_id), drv);
  }
  console.log(`✅ Seeded ${drivers.length} drivers (with v2 status values)`);
}

// ───────────────────────────────────────────────────────────
// Fix #1: warehouse_id optional | Fix #2: customer_phone
// ───────────────────────────────────────────────────────────
async function seedOrders() {
  const orders = [
    {
      // PENDING — warehouse_id is null (Fix #1)
      order_id: "ORD-SIM-001",
      customer_name: "Retail Mart Andheri",
      customer_phone: "+91-9988776655",   // Fix #2
      customer_location: { lat: 19.1136, lon: 72.8697 },
      items: [
        { sku: "SKU-001", name: "Steel Rods Bundle", quantity: 50 },
        { sku: "SKU-014", name: "Copper Wire 2mm", quantity: 200 }
      ],
      warehouse_id: null,                 // Fix #1: null at pending
      status: "pending",
      driver_id: null,
      delivery_id: null,
      priority: "high",
      total_value: 45000,
      notes: "Deliver before 2 PM",
      created_at: Timestamp.now(),
      updated_at: Timestamp.now()
    },
    {
      // PENDING — warehouse_id is null (Fix #1)
      order_id: "ORD-SIM-002",
      customer_name: "Mumbai Electronics Hub",
      customer_phone: "+91-9876501234",   // Fix #2
      customer_location: { lat: 19.0760, lon: 72.8777 },
      items: [
        { sku: "SKU-003", name: "Circuit Board Pack", quantity: 100 }
      ],
      warehouse_id: null,                 // Fix #1: null at pending
      status: "pending",
      driver_id: null,
      delivery_id: null,
      priority: "normal",
      total_value: 22000,
      notes: null,
      created_at: Timestamp.now(),
      updated_at: Timestamp.now()
    },
    {
      // ACCEPTED — warehouse_id NOW assigned (Fix #1)
      order_id: "ORD-SIM-003",
      customer_name: "South Port Traders",
      customer_phone: "+91-9112233445",   // Fix #2
      customer_location: { lat: 18.9400, lon: 72.8300 },
      items: [
        { sku: "SKU-007", name: "Industrial Adhesive 5L", quantity: 30 },
        { sku: "SKU-009", name: "Packaging Rolls", quantity: 500 }
      ],
      warehouse_id: "WH-003",            // Fix #1: set at accepted
      status: "accepted",
      driver_id: null,
      delivery_id: null,
      priority: "urgent",
      total_value: 78000,
      notes: "Fragile — handle with care",
      created_at: Timestamp.now(),
      updated_at: Timestamp.now()
    }
  ];

  for (const ord of orders) {
    await setDoc(doc(db, "orders", ord.order_id), ord);
  }
  console.log(`✅ Seeded ${orders.length} orders (warehouse_id=null at pending, customer_phone added)`);
}

// ─────────────────────────────────────────────────
// Fix #3: Patch existing inventory with reserved_quantity
// ─────────────────────────────────────────────────
async function patchInventory() {
  const snapshot = await getDocs(collection(db, "inventory"));
  let patched = 0;

  for (const docSnap of snapshot.docs) {
    const data = docSnap.data();
    // Only patch if reserved_quantity is missing
    if (data.reserved_quantity === undefined) {
      await updateDoc(doc(db, "inventory", docSnap.id), {
        reserved_quantity: 0             // Fix #3: default to 0
      });
      patched++;
    }
  }

  console.log(`✅ Patched ${patched} inventory items (added reserved_quantity: 0)`);
}

async function seed() {
  console.log("🚀 Seeding extended collections (v2 fixes)...\n");
  await seedWarehouses();
  await seedDrivers();
  await seedOrders();
  await patchInventory();
  console.log("\n✅ All v2 fixes applied successfully!");
  console.log("   Fixes applied: #1 (optional warehouse_id), #2 (customer_phone),");
  console.log("                  #3 (reserved_quantity), #9 (driver status), #10 (warehouse load)");
  console.log("   Fixes #4-8 are schema-only — applied when new deliveries are created.");
}

seed().catch(console.error);
