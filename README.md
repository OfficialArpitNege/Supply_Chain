# 🚀 Smart Supply Chain Monitor

[![React](https://img.shields.io/badge/React-19.0-61DAFB?style=for-the-badge&logo=react)](https://reactjs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.128-009688?style=for-the-badge&logo=fastapi)](https://fastapi.tiangolo.com/)
[![Firebase](https://img.shields.io/badge/Firebase-v12-FFCA28?style=for-the-badge&logo=firebase)](https://firebase.google.com/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-v4-38B2AC?style=for-the-badge&logo=tailwind-css)](https://tailwindcss.com/)
[![Scikit-Learn](https://img.shields.io/badge/scikit--learn-v1.8-F7931E?style=for-the-badge&logo=scikit-learn)](https://scikit-learn.org/)

**Smart Supply Chain Monitor** is a real-time, ML-powered logistics platform that predicts delivery delays, estimates system demand dynamically, and guides operational decisions. It combines Firebase live state syncing, FastAPI ML endpoints, and an admin-controlled delivery lifecycle into a resilient, production-ready supply chain system.

---

## ✨ Key Features

### 📊 Dynamic Dashboard
- **Real-Time KPIs**: Monitor active deliveries, system demand levels, and inventory alerts instantly.
- **Interactive Charts**: Visualize delivery status distributions and demand trends over time using Recharts.
- **System Alerts Feed**: Automated high-risk flags with AI-recommended mitigation actions.

### 🚚 Logistics Command Center
- **IntelliRoute Mapping**: Interactive Leaflet.js map showing real-time delivery progress.
- **Smart Dispatch**: Route recommendation engine with sub-second delay and demand predictions.
- **Kanban Pipeline**: Manage delivery lifecycles from `Waiting` to `Completed` with a drag-and-drop feel.

### 📦 Inventory & Supplier Intelligence
- **Automated Restocking**: Visual cues for low-stock items based on dynamic reorder levels.
- **Supplier Performance**: Track lead times, ratings, and active purchase orders in one unified directory.
- **Bulk Actions**: Export inventory data to CSV and manage stocks efficiently.

### 🤖 AI-Driven Insights
- **Predictive Heatmaps**: Identify delayed deliveries before they happen with probability-based color coding.
- **Demand Forecasting**: Automated demand estimation every 30 seconds based on live system load.
- **Decision Engine**: Explainable AI recommending specific actions for every logistics risk.

### ⚙️ Automation & RBAC
- **Rule Engine**: Create custom "If-This-Then-That" rules (e.g., *If demand > High → Notify Admin*).
- **Role-Based Access**: Secure environment for Admin, Manager, Staff, and Viewer roles.

---

## 🛠️ Tech Stack

- **Frontend**: `React 19`, `Vite`, `Tailwind CSS 4`, `Leaflet.js`, `Recharts`, `React Hot Toast`.
- **Backend**: `FastAPI`, `Python 3.11`, `Scikit-Learn`, `Joblib`.
- **Real-time Engine**: `Firebase Firestore`, `Firebase Auth`.
- **Infrastructure**: `Firebase Admin SDK`.

---

## 🚀 Getting Started

### Prerequisites
- Python 3.11+
- Node.js 18+
- Firebase Project (Firestore + Auth)

### 1. Backend Setup
```bash
# Navigate to backend
cd Backend

# Create virtual environment
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Start the API
python main.py
```

### 2. Frontend Setup
```bash
# Navigate to frontend
cd Frontend/app

# Install dependencies
npm install

# Start development server
npm run dev
```

---

## 🔑 Environment Variables

### Backend (`/Backend/.env`)
```ini
FIREBASE_PROJECT_ID=your-project-id
# Add other Firebase credentials as needed
```

### Frontend (`/Frontend/app/.env`)
```ini
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-auth-domain
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-storage-bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
VITE_FIREBASE_APP_ID=your-app-id
```

---

## 📂 Project Structure

```text
├── Backend/                # FastAPI application
│   ├── routes/             # API endpoints
│   ├── services/           # ML agents & Simulation logic
│   └── main.py             # Server entry point
├── Frontend/app/           # React dashboard
│   ├── src/pages/          # Functional modules
│   └── src/components/     # UI elements
├── ML_Model/               # Trained prediction models
└── Datasets/               # Training & Testing data
```

---

## 🏆 Project Philosophy
Built to solve the "last-mile uncertainty" in modern logistics. By merging real-time data with predictive intelligence, **Smart Supply Chain Monitor** transforms reactive shipping into proactive orchestration.

---
Created with ❤️ by the Supply Chain Lab Team.