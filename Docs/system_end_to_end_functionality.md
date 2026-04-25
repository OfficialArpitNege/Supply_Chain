# Smart Supply Chain Monitor: End-to-End Functionality and Feature Guide

## 1. What Your System Is Doing

Smart Supply Chain Monitor is a real-time logistics control platform that combines:
- React frontend modules for operations management.
- FastAPI backend intelligence services.
- Firebase Firestore and Auth for live shared state and identity.
- ML-driven delay and demand prediction with route-risk analysis.

At runtime, your system continuously:
- Collects delivery, inventory, supplier, and user state from Firestore.
- Predicts demand and route delay risk via backend endpoints.
- Recommends safer/faster route decisions.
- Lets operators move deliveries through waiting -> active -> completed.
- Applies role-based access restrictions.
- Evaluates automation rules and writes execution logs.
- Surfaces alerts and insights on dashboards in near real time.

## 2. High-Level Architecture

## Frontend (React + Vite)
- Main app shell with role-aware navigation and route guards.
- Domain pages: Dashboard, Logistics, Inventory, Suppliers, Users/RBAC, Automation, AI Insights, Login.
- Shared context provides current user, role, active deliveries count, and demand level.
- Firestore onSnapshot listeners keep UI synchronized without manual refresh.

## Backend (FastAPI)
- Core API entry: Backend/main.py.
- Core endpoints:
  - /analyze-route
  - /recommend-routes
  - /predict-delay
  - /predict-demand
  - /deliveries/* lifecycle and intelligence endpoints
  - /health and /models/health
- Routing intelligence integrates weather + traffic + routing services.
- Model service combines model artifacts and fallback logic.

## Data and Identity (Firebase)
- Firestore collections back operational state (deliveries, inventory, suppliers, users, purchase_orders, automation_rules, automation_logs).
- Firebase Auth handles login identity.
- Firestore users collection stores role used by frontend route protection.

## 3. End-to-End User and Data Flow

## Step A: User signs in
- User authenticates on Login page via Firebase Auth.
- If user document does not exist, app creates one with default role logic.
- AppContext subscribes to auth state and role document.

## Step B: Global context starts live subscriptions
- AppContext subscribes to deliveries in Firestore.
- Active delivery count is computed from statuses and stored globally.
- Demand is re-synced by calling backend /predict-demand.
- New high-risk delivery additions trigger toast alerts.

## Step C: Operator creates a delivery (core Logistics flow)
1. Operator selects warehouse and destination in Logistics page.
2. Frontend geocodes destination.
3. Frontend calls backend /recommend-routes for 2-3 route options.
4. Frontend calls backend /predict-demand.
5. Frontend calls backend /analyze-route on selected/best route.
6. Decision card shows risk, probability, confidence, and recommendation.
7. Confirm writes delivery to Firestore with:
   - status waiting
   - selected route + metrics
   - risk metadata
   - recommendation
   - timeline entry

## Step D: Dispatch lifecycle execution
- Waiting card -> Start: status changes to active.
- Active card -> Complete: status changes to completed.
- Timeline is appended on each transition.
- All clients see updates immediately via onSnapshot.

## Step E: Dashboard and AI modules react automatically
- KPI cards, charts, and alerts update in real time.
- AI page refreshes demand forecast every 30 seconds.
- Delay heatmap and route intelligence recompute from current data.

## Step F: Inventory/Suppliers/Users/Automation continue in parallel
- Inventory updates can trigger low-stock visibility.
- Supplier and PO updates impact procurement visibility.
- Role changes instantly affect page access.
- Automation engine evaluates active rules and creates logs/actions.

## 4. Feature-by-Feature Explanation

## 4.1 Login and Security
- Firebase email/password sign-in.
- Demo bootstrap behavior for admin account creation if missing.
- ProtectedRoute prevents unauthorized access and redirects/blocks by role.
- Access matrix enforced in router configuration and sidebar visibility.

## 4.2 App Shell and Global Navigation
- Collapsible sidebar with role-filtered nav options.
- Top bar shows demand level badge, in-transit count, current user role, and notifications indicator.
- Logout available globally.

## 4.3 Dashboard
- KPI cards:
  - Active deliveries
  - System demand level
  - Low-stock alerts
  - Active suppliers
- Delivery pipeline status bar chart (waiting/active/completed).
- Demand trend line chart from recent delivery demand fields.
- Recent deliveries table with risk/status context.
- High-risk alerts feed generated from delivery risk_level.

## 4.4 Logistics Command Center (Core)
- Delivery creation panel with warehouse/destination/priority.
- Route recommendation with scored alternatives.
- Route analysis merges route/weather/traffic and ML delay+demand context.
- Map view:
  - Warehouse/destination markers
  - Delivery markers by status
  - Route polyline drawing
- Kanban-style lifecycle board:
  - Waiting
  - Active
  - Completed
- Delivery detail drawer displays full route, risk, timeline, and recommendation context.

## 4.5 Inventory Management
- Real-time inventory table with status derivation:
  - In Stock
  - Low Stock
  - Out of Stock
- Search, low-stock filtering, pagination, row selection.
- Create/edit modal with validation.
- Delete with confirmation.
- CSV export of current filtered view.
- Sticky low-stock warning banner.
- Inventory stat cards (total SKUs, units, low/out counts).

## 4.6 Suppliers and Purchase Orders
- Supplier cards with status, rating, lead time, contacts, active PO count.
- Search and rating filtering.
- Add/edit supplier modal.
- Create PO modal with generated PO number.
- PO status update support.
- Supplier detail expansion with associated PO history.
- Mini performance sparkline per supplier card.

## 4.7 Users and RBAC
- Users table with role updates inline.
- Invite user flow (pending status).
- Role-permission matrix visualization.
- Role-based route authorization and access denied UI.

## 4.8 Automation Rules
- Active rules list with enable/disable toggles.
- Rule creation by module/field/operator/value/action.
- Rule execution simulation engine:
  - Evaluates inventory and logistics triggers.
  - Writes automation logs.
  - Executes actions like create PO or send alerts.
- Execution logs table (latest events with condition and action).
- Duplicate-fire suppression window for repeated triggers.

## 4.9 AI Insights
- Demand gauge with periodic backend polling (30s).
- Delay risk heatmap for waiting deliveries sorted by probability.
- Route intelligence from completed delivery performance heuristics.
- Decision log for delivery outcomes.
- Rule-based assistant chat for operational Q&A (high-risk counts, demand, inventory, delivery volume).

## 5. Backend Intelligence and API Behavior

## 5.1 Main backend runtime
- FastAPI app with CORS for local frontend ports.
- Global exception handler returns structured error payload.
- Health endpoints:
  - /health
  - /models/health
- Optional simulation endpoint /simulate/start.
- Administrative utility /admin/clear-deliveries.

## 5.2 Route analysis and recommendation
- /analyze-route:
  - Gets live route/weather/traffic context.
  - Runs delay and demand model paths.
  - Produces risk, confidence, probability_delayed, reason, timing metrics, and route geometry.
- /recommend-routes:
  - Generates alternatives (target 3).
  - Scores routes using delay probability, traffic speed, ETA ratio, and distance.
  - Returns ranked alternatives + explanation for best route.

## 5.3 Delay and demand prediction
- /predict-delay:
  - Preprocesses payload, runs hybrid delay model/fallback.
  - Returns prediction, probability_delayed, risk_level, confidence, reason.
- /predict-demand:
  - Combines model score + active deliveries load signal.
  - Returns demand_level, ml_score, active_deliveries, final_score.

## 5.4 Delivery lifecycle and system command endpoints
- /deliveries/create: creates delivery with best route, backup route, explanation, risk factors, and recommended action.
- /deliveries/{id}/start: starts delivery and performs route saturation warning checks.
- /deliveries/{id}/complete: completes delivery and can compute performance score.
- /deliveries: lists deliveries ordered by create time.
- /deliveries/insights: aggregates operational state and emits decision recommendations.
- /deliveries/fleet-scale: adjusts virtual fleet capacity.
- /deliveries/disrupt: injects disruption scenario and escalates affected deliveries.
- /deliveries/what-if: simulates hypothetical scenarios without mutating live data.

## 6. Real-Time and ML Intelligence Model

Your system uses a layered intelligence pattern:
- Layer 1: Live operational state from Firestore.
- Layer 2: External routing/weather/traffic feeds for environment context.
- Layer 3: Delay and demand prediction models.
- Layer 4: Decision/risk synthesis and recommendation text.
- Layer 5: UI alerting, prioritization, and operator action tools.

This creates a closed feedback loop:
1. Delivery state changes.
2. Demand/load/risk recompute.
3. Alerts and recommendations update.
4. Operator takes action.
5. New state flows back into system.

## 7. Firestore Collections and Their Roles

- deliveries: source of truth for dispatch lifecycle, risk metadata, timeline, route metrics.
- inventory: SKU levels, reorder context, stock health.
- suppliers: supplier master data and ratings.
- purchase_orders: procurement actions (manual and automated).
- users: role metadata for authorization behavior.
- automation_rules: active trigger definitions.
- automation_logs: rule execution audit trail.

## 8. Operational Strengths

- Real-time multi-user synchronization.
- End-to-end logistics orchestration from planning through completion.
- Explainable route recommendations (not just black-box outputs).
- Risk-aware dispatch decisions under demand pressure.
- Integrated inventory and supplier workflows tied to logistics.
- Strong admin controls through RBAC and automation.

## 9. Current Runtime Status (As of Now)

Your project has been started with:
- Backend available on http://127.0.0.1:8000
- Frontend available on http://localhost:5173

So the full end-to-end stack is currently active and ready for live interaction.

## 10. Suggested Test Scenarios for Full E2E Validation

1. Login as admin and verify all nav modules are visible.
2. Create a new delivery in Logistics and confirm route recommendations appear.
3. Confirm delivery and verify it appears in waiting column and Dashboard tables.
4. Start then complete the same delivery and verify timeline/status updates.
5. Open AI Insights and confirm demand polling and risk table updates.
6. Add low-stock inventory item and verify Dashboard low-stock KPI and banner behavior.
7. Create supplier and PO, verify supplier card and PO table sync.
8. Change a user role and verify route access changes immediately.
9. Create and enable automation rule, trigger condition, and verify logs/action output.

This is the complete functional map of your system from authentication to real-time AI-assisted logistics operations.
