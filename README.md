# 🚚 Smart Supply Chain & Disruption Management System

A real-time, AI-driven logistics and supply chain dashboard. This system visualizes active deliveries, predicts supply chain shocks, and dynamically recalculates optimal driver routes when unexpected disruptions occur (traffic spikes, weather events, road closures).

## 🌟 Key Features

* **Real-time Tactical Map:** Live tracking of warehouses, deliveries, and route paths using Leaflet and Map Tiles.
* **Dynamic Disruption Engine:** Inject live supply chain shocks (e.g., severe weather, infrastructure failures) into the network.
* **Smart Rerouting:** Automatically detects high-risk deliveries and recalculates the optimal fallback route using live traffic/route data (OpenRouteService).
* **Live Firebase Integration:** Real-time state synchronization via Firestore; UI components instantly reflect changes in delivery ETAs, progress, and routing.
* **Role-Based Access Control:** Secure portal with Admin, Agent, and Viewer roles using Firebase Authentication.

## 🏗️ Tech Stack

### Frontend
* **Framework:** React.js powered by Vite
* **Styling:** Tailwind CSS & Glassmorphism UI
* **Maps:** React-Leaflet (`react-leaflet`)
* **State & DB:** Firebase Authentication & Firestore (Real-time listeners)
* **Hosting:** Firebase Hosting

### Backend
* **Framework:** FastAPI (Python)
* **Database Driver:** Firebase Admin SDK
* **Route Analysis:** OpenRouteService (ORS), OSRM, and TomTom integrations
* **Machine Learning Context:** Predictive Demand Modeling & Risk Analysis

## 🚀 Getting Started

### Prerequisites
* **Node.js** (v18+)
* **Python** (v3.11+)
* **Firebase Account** with a configured project (Firestore & Auth enabled)
* API Keys for **OpenRouteService** and **OpenWeather**

### 1. Backend Setup

1. Navigate to the project root and create a virtual environment:
   bash
   python -m venv .venv311
   source .venv311/bin/activate  # On Windows use: .venv311\Scripts\activate
   
2. Install Python dependencies:
   bash
   pip install -r requirements.txt
   
3. Set up environment variables:
   Create a `.env` file inside the `Backend/` directory and add your API keys:
   env
   OPENROUTESERVICE_API_KEY=your_ors_key_here
   OPENWEATHER_API_KEY=your_weather_key_here
   
4. Add your Firebase service account credentials as `firebase_key.json` inside the `Backend/` directory.
5. Start the FastAPI server:
   bash
   uvicorn Backend.main:app --reload
   
   *The backend will be available at `http://localhost:8000`.*

### 2. Frontend Setup

1. Navigate to the frontend directory:
   bash
   cd Frontend/app
   
2. Install NPM dependencies:
   bash
   npm install
   
3. Start the Vite development server:
   bash
   npm run dev
   
   *The frontend will be available at `http://localhost:5173`.*

## 🚢 Deployment

This project is configured to deploy the frontend to **Firebase Hosting**.

To build and deploy the production version:
bash
cd Frontend/app
npm run build
firebase deploy
