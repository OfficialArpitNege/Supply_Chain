# 🚀 Smart Supply Chain - Quick Start Guide

This project is a high-impact, AI-driven logistics orchestrator with real-time tracking, ML-based routing, and a 4-sided ecosystem (Admin, Supplier, Customer, Driver).

## 🛠️ Prerequisites
- Python 3.11+
- Node.js 18+
- Firebase Project (Configured in `.env` and `firebase/config.js`)

## 🏗️ Backend Setup (FastAPI)
1. Navigate to `Backend/`
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Run the server:
   ```bash
   python main.py
   ```
   *The API will be live at `http://127.0.0.1:8000`*

## 🎨 Frontend Setup (Vite + React)
1. Navigate to `Frontend/app/`
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the development server:
   ```bash
   npm run dev
   ```
   *The UI will be live at `http://localhost:5173`*

## 🏁 The 4 Dashboards
- **Admin Control Tower**: `/control-tower` (Mission Control, Map, Overrides)
- **Supplier Portal**: `/supplier-portal` (Submit replenishment requests)
- **Customer Marketplace**: `/market` (Search products and place orders)
- **Driver Mobile App**: `/driver-app` (Navigation, Simulation, Delivery summary)

## 🏎️ How to Run the Live Demo
1. Open the **Admin Control Tower** (`/control-tower`).
2. Click **"START LIVE DEMO"** in the top-right.
3. **Observe**: 5 orders are automatically placed, matched to warehouses, assigned to drivers, and dispatched with ML routes.
4. **Live Tracking**: Open the **Driver App** (`/driver-app`) in another tab to manually move a driver, or watch the auto-simulation move them on the Admin map.
5. **Disruption Test**: Use the **"INJECT TRAFFIC"** button on the Admin dashboard to see real-time risk escalation and reroute recommendations.

---
*Created for the Advanced Agentic Coding Hackathon.*
