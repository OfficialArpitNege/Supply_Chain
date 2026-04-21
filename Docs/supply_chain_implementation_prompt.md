# 🚀 Smart Supply Chain Monitor — Full Implementation Prompt

> **How to use:** Paste each section's prompt into your AI coding assistant (Cursor / Claude / ChatGPT).
> Run them in ORDER — each module builds on the previous one.

---

## 🗂️ PROJECT CONTEXT (Paste this first in EVERY prompt session)

```
I am building "Smart Supply Chain Monitor" — an AI-powered, real-time logistics platform.

Tech Stack:
- Frontend: React + Tailwind CSS
- Backend: FastAPI (Python)
- Database: Firebase Firestore (real-time)
- ML Models: Already built (delay prediction, demand estimation)
- Maps: Leaflet.js or Google Maps API
- Auth: Firebase Auth

Backend API endpoints already exist:
- POST /recommend-routes → returns 2-3 route options
- POST /predict-delay → returns { status, confidence }
- POST /predict-demand → returns { demand_level: LOW/MEDIUM/HIGH }
- POST /analyze-route → returns { risk_level, recommended_action }

Firebase Firestore collections:
- deliveries: { id, warehouse, destination, route, status: waiting|active|completed, delay_prediction, demand_level, risk_level, recommended_action, created_at }
- inventory: { id, sku, name, quantity, reorder_level, warehouse, status: in_stock|low|out_of_stock }
- suppliers: { id, name, contact, lead_time_days, rating, active_pos }
- users: { id, name, email, role: admin|manager|staff|viewer }
```

---

## 📊 MODULE 1 — DASHBOARD (Start Here)

```
Using the project context above, build a React Dashboard page with these components:

1. TOP KPI CARDS ROW (4 cards):
   - Total Active Deliveries (count from Firebase deliveries where status=active)
   - System Demand Level (LOW/MEDIUM/HIGH — color coded: green/yellow/red)
   - Low Stock Alerts (count from inventory where status=low or out_of_stock)
   - Active Suppliers (count from suppliers collection)

2. DELIVERY STATUS CHART:
   - Bar chart using Recharts
   - X-axis: Waiting, Active, Completed
   - Y-axis: Count
   - Data: real-time from Firebase deliveries collection

3. DEMAND TREND LINE CHART:
   - Line chart using Recharts
   - Show demand level changes over last 10 delivery events
   - Use demand_level field from deliveries

4. RECENT DELIVERIES TABLE:
   - Last 5 deliveries
   - Columns: ID, Warehouse→Destination, Status (badge), Risk Level (badge), Time
   - Color coding: LOW=green, MEDIUM=yellow, HIGH=red badges

5. SYSTEM ALERTS FEED:
   - Pull deliveries where risk_level=HIGH
   - Show as alert cards with recommended_action text

REQUIREMENTS:
- All data must use Firebase onSnapshot (real-time updates — no manual refresh)
- Use Tailwind CSS for styling
- Dark sidebar layout with white card content area
- Loading skeletons while data fetches
- Mobile responsive
```

---

## 📦 MODULE 2 — INVENTORY MANAGEMENT

```
Using the project context above, build a React Inventory Management page:

1. INVENTORY TABLE:
   - Columns: SKU, Product Name, Quantity, Warehouse Location, Reorder Level, Status
   - Status badge: IN STOCK (green) / LOW (yellow) / OUT OF STOCK (red)
   - Logic: if quantity <= reorder_level → LOW, if quantity == 0 → OUT OF STOCK
   - Sortable columns, search/filter bar at top
   - Pagination (10 items per page)

2. ADD/EDIT INVENTORY MODAL:
   - Fields: SKU, Name, Quantity, Reorder Level, Warehouse
   - On submit → write to Firebase inventory collection
   - Validation: quantity and reorder_level must be numbers > 0

3. LOW STOCK ALERT BANNER:
   - Sticky banner at top if any item is LOW or OUT OF STOCK
   - Shows count: "⚠️ 3 items need restocking"
   - Click → filters table to show only low/out items

4. BULK ACTIONS:
   - Checkbox select rows
   - "Update Quantity" bulk action
   - "Export CSV" button (generates downloadable CSV of current table view)

5. INVENTORY STATS ROW:
   - Total SKUs, Total Units in Stock, Low Stock Count, Out of Stock Count

REQUIREMENTS:
- Firebase Firestore for all CRUD operations
- Real-time updates with onSnapshot
- Tailwind CSS styling consistent with Dashboard
- Confirm dialog before delete
```

---

## 🚚 MODULE 3 — LOGISTICS & DELIVERY TRACKER

```
Using the project context above, build the core Logistics page — this is the most important module:

1. CREATE DELIVERY FORM (left panel):
   - Fields: Warehouse (dropdown), Destination (text input), Priority (Low/Medium/High)
   - On submit:
     a. Call POST /recommend-routes with { warehouse, destination }
     b. Display 2-3 route cards (distance, ETA, traffic speed)
     c. Auto-call POST /predict-delay for best route
     d. Auto-call POST /predict-demand
     e. Call POST /analyze-route to get risk + recommended_action
     f. Show Decision Panel: risk level badge + recommended action text
     g. "Confirm Delivery" button → saves to Firebase with status=waiting

2. MAP VIEW (center panel):
   - Use Leaflet.js
   - Show all active deliveries as moving markers
   - When route is selected, draw the route polyline on map
   - Color code: waiting=blue, active=green, completed=gray

3. DELIVERY PIPELINE (right panel):
   - Kanban-style 3 columns: WAITING | ACTIVE | COMPLETED
   - Each delivery card shows: destination, risk badge, delay prediction
   - "Start" button on waiting cards → updates Firebase status to active
   - "Complete" button on active cards → updates Firebase status to completed
   - Starting a delivery must trigger demand recalculation

4. DELIVERY DETAIL DRAWER:
   - Click any delivery card → slide-in drawer from right
   - Shows full details: route info, ML predictions, risk level, action recommendation
   - Timeline of status changes with timestamps

REQUIREMENTS:
- This is the core workflow — make it feel like a real dispatch center
- All status changes must update Firebase AND re-fetch demand from /predict-demand
- Real-time listener so all admin sessions see the same state
- Leaflet.js for maps (free, no API key needed)
```

---

## 🤝 MODULE 4 — SUPPLIERS MANAGEMENT

```
Using the project context above, build a Suppliers Management page:

1. SUPPLIER DIRECTORY:
   - Card grid layout (3 columns)
   - Each card: Supplier name, contact, lead time, rating (stars), active POs count
   - Status indicator: Active / Inactive
   - Search bar + filter by rating

2. ADD/EDIT SUPPLIER MODAL:
   - Fields: Name, Contact Email, Phone, Lead Time (days), Rating (1-5 stars input)
   - On save → write to Firebase suppliers collection

3. PURCHASE ORDERS (PO) TABLE:
   - Below supplier cards, show PO table
   - Columns: PO Number, Supplier, Items, Quantity, Status (Pending/Approved/Delivered), Date
   - "Create PO" button → modal with supplier dropdown + items

4. SUPPLIER PERFORMANCE MINI-CHART:
   - On each supplier card, a small sparkline showing delivery time trend
   - Use dummy data if real data not available yet — structure it to be replaceable

REQUIREMENTS:
- Firebase Firestore CRUD
- Tailwind CSS card design
- Clicking a supplier card expands to show full detail + PO history
```

---

## 👥 MODULE 5 — USERS & RBAC

```
Using the project context above, build a Users Management page with Role-Based Access Control:

1. USERS TABLE:
   - Columns: Name, Email, Role, Last Active, Status (Active/Inactive)
   - Roles: admin | manager | staff | viewer
   - Inline role change dropdown per row

2. ROLE PERMISSIONS MATRIX:
   - Visual table showing what each role can do
   - Rows: Dashboard, Inventory, Logistics, Suppliers, Users, Automation, AI
   - Columns: View, Create, Edit, Delete
   - Checkmarks per role/module combination

3. INVITE USER FORM:
   - Email input + role selector
   - On submit → create Firebase user doc with status=pending

4. RBAC ENFORCEMENT:
   - Read current user role from Firebase Auth + Firestore
   - Hide/show nav items based on role
   - Show "Access Denied" component for unauthorized routes
   - Admin-only: Users page, Automation page
   - Viewer: Dashboard + read-only Inventory only

REQUIREMENTS:
- Use Firebase Auth for authentication
- Store role in Firestore users collection
- useContext or Zustand for global auth state
- Protect all routes with a PrivateRoute component that checks role
```

---

## ⚙️ MODULE 6 — AUTOMATION RULES

```
Using the project context above, build an Automation Rules page:

1. ACTIVE RULES LIST:
   - Show all automation rules as toggle cards
   - Each card: Rule name, trigger condition, action, ON/OFF toggle
   - Example rules:
     a. "Auto Reorder" — IF inventory quantity < reorder_level → CREATE PO
     b. "High Risk Alert" — IF risk_level = HIGH → SEND notification
     c. "Demand Spike" — IF demand = HIGH → FLAG dispatch for review

2. CREATE RULE FORM:
   - Trigger: Select module (Inventory/Logistics/Demand)
   - Condition: Select field + operator + value (e.g., quantity < 50)
   - Action: Select action (Create PO / Send Alert / Delay Dispatch / Flag Review)
   - Save to Firebase automation_rules collection

3. RULE EXECUTION ENGINE (Frontend simulation):
   - On every Firebase data change, check all active rules
   - If condition met → execute action (create Firestore doc / show toast notification)
   - Log rule executions to Firebase automation_logs collection

4. EXECUTION LOGS TABLE:
   - Show last 20 rule executions
   - Columns: Rule Name, Triggered At, Condition Met, Action Taken, Status

REQUIREMENTS:
- Rules stored in Firebase, evaluated on frontend using onSnapshot triggers
- Toast notifications (react-hot-toast) for rule fires
- Toggle switches with instant Firebase update
```

---

## 🤖 MODULE 7 — AI INTEGRATION PAGE

```
Using the project context above, build an AI Insights page:

1. DEMAND FORECAST PANEL:
   - Call POST /predict-demand every 30 seconds automatically
   - Display current demand: LOW / MEDIUM / HIGH with animated gauge/meter
   - Show: "X active deliveries contributing to demand"
   - Trend arrow: ↑ Increasing / → Stable / ↓ Decreasing

2. DELAY RISK HEATMAP:
   - Show all waiting deliveries as a table
   - For each, show delay probability % from ML model
   - Color code rows: <30% green, 30-60% yellow, >60% red
   - Sort by highest risk first

3. ROUTE INTELLIGENCE PANEL:
   - Show best vs worst performing routes (based on completed deliveries)
   - Average ETA accuracy per route
   - "AI Recommended Route" highlight

4. AI DECISION LOG:
   - Table of all system decisions made
   - Columns: Delivery ID, Risk Level, Recommended Action, Actual Outcome, Was AI Correct?
   - "Was AI Correct?" filled in when delivery completes

5. AI CHAT ASSISTANT (Nice to Have):
   - Simple chat input at bottom of page
   - Questions like: "How many high risk deliveries today?" 
   - Answer by querying Firebase and formatting response
   - No external LLM needed — rule-based query parser is fine for MVP

REQUIREMENTS:
- All ML calls go through your existing FastAPI endpoints
- Show loading state during API calls
- Handle API errors gracefully with retry button
- Charts using Recharts
```

---

## 🔗 MODULE 8 — WIRING EVERYTHING TOGETHER

```
Using the project context above, wire the full app together:

1. APP SHELL & NAVIGATION:
   - Left sidebar with icons + labels
   - Nav items: Dashboard, Logistics (⭐ main), Inventory, Suppliers, Users, Automation, AI Insights
   - Active route highlighting
   - Collapse sidebar to icons-only on small screens
   - Top bar: current user name + role badge + logout button

2. GLOBAL STATE:
   - Create AppContext with:
     - currentUser (from Firebase Auth)
     - userRole
     - systemDemandLevel (shared across all pages)
     - activeDeliveriesCount
   - Wrap entire app in AppContext provider

3. REAL-TIME DEMAND SYNC:
   - In AppContext, subscribe to Firebase deliveries with onSnapshot
   - Count active deliveries
   - Call /predict-demand when active count changes
   - Store result in context so ALL pages see same demand level

4. NOTIFICATION SYSTEM:
   - Toast notifications (react-hot-toast) for:
     - New high-risk delivery created
     - Automation rule fired
     - Delivery status changed
   - Notification bell in top bar showing unread count

5. ROUTING:
   - React Router v6
   - /dashboard, /logistics, /inventory, /suppliers, /users, /automation, /ai
   - Default redirect to /dashboard
   - 404 page

6. ERROR BOUNDARIES:
   - Wrap each page in ErrorBoundary component
   - Show friendly error card if a module crashes

REQUIREMENTS:
- React Router v6 for routing
- React Context API for global state
- react-hot-toast for notifications
- All Firebase listeners cleaned up on component unmount (unsubscribe in useEffect cleanup)
```

---

## 🎨 STYLING GUIDE (Apply Everywhere)

```
Design system for the entire app:

COLOR PALETTE:
- Background: #0F172A (dark navy)
- Sidebar: #1E293B
- Cards: #1E293B with border #334155
- Primary accent: #3B82F6 (blue)
- Success: #22C55E (green)
- Warning: #F59E0B (amber)
- Danger: #EF4444 (red)
- Text primary: #F1F5F9
- Text secondary: #94A3B8

RISK LEVEL COLORS:
- LOW: bg-green-500/20 text-green-400 border-green-500/30
- MEDIUM: bg-amber-500/20 text-amber-400 border-amber-500/30
- HIGH: bg-red-500/20 text-red-400 border-red-500/30

TYPOGRAPHY:
- Font: 'IBM Plex Mono' for data/numbers, 'Inter' for body text
- Headings: font-semibold tracking-tight
- Data values: font-mono text-lg

COMPONENT PATTERNS:
- Cards: rounded-xl border border-slate-700 bg-slate-800 p-6
- Buttons primary: bg-blue-600 hover:bg-blue-700 rounded-lg px-4 py-2
- Input fields: bg-slate-900 border border-slate-600 rounded-lg px-3 py-2
- Badges: inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium
- Tables: divide-y divide-slate-700, hover:bg-slate-700/50 on rows

ANIMATIONS:
- Fade in cards on load: animate-fadeIn (custom CSS)
- Pulse on live data indicators
- Smooth transitions on status changes: transition-all duration-200
```

---

## ✅ IMPLEMENTATION ORDER

Run these prompts **in this exact order**:

1. **Module 8 first** — set up routing, auth, global state shell
2. **Module 1** — Dashboard (validates Firebase connection works)
3. **Module 3** — Logistics (core feature, most important for judges)
4. **Module 2** — Inventory
5. **Module 7** — AI page (connects your ML models visually)
6. **Module 4** — Suppliers
7. **Module 5** — Users/RBAC
8. **Module 6** — Automation (if time allows)

---

## 🏆 ONE-LINER FOR JUDGES

> "Smart Supply Chain Monitor is a real-time, ML-powered logistics platform that predicts delivery delays, estimates system demand dynamically, and guides operational decisions — combining Firebase live state, FastAPI ML endpoints, and an admin-controlled delivery lifecycle into a resilient, production-ready supply chain system."
