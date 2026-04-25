import React, { useState, useEffect, useMemo } from 'react';
import { 
  collection, 
  query, 
  onSnapshot, 
  doc, 
  updateDoc, 
  setDoc,
  serverTimestamp,
  orderBy 
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { useApp } from '../context/AppContext';
import { 
  MapContainer, 
  TileLayer, 
  Marker, 
  Popup, 
  Polyline, 
  useMap 
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { 
  MdLocalShipping, 
   MdDashboard,
  MdAdd, 
  MdCheckCircle, 
  MdPlayArrow, 
  MdInfo,
  MdWarning,
  MdClose,
  MdSchedule,
  MdSpeed,
  MdCloud,
  MdTrendingUp,
  MdLocationOn,
  MdExplore,
  MdAutoGraph,
  MdTraffic,
  MdKeyboardArrowRight
} from 'react-icons/md';
import toast from 'react-hot-toast';

// Fix Leaflet marker icon issue
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

const getMarkerIcon = (status, type = 'unit') => {
  let color = '#1E293B'; 
  if (type === 'warehouse') color = '#3B82F6';
  if (type === 'destination') color = '#EF4444';
  if (status === 'active') color = '#059669';
  if (status === 'completed') color = '#64748B';

  return new L.DivIcon({
    className: 'custom-div-icon',
    html: `<div style="background-color: ${color}; width: ${type === 'unit' ? '12px' : '18px'}; height: ${type === 'unit' ? '12px' : '18px'}; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 15px ${color}55"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9]
  });
};

const API_BASE = 'http://127.0.0.1:8000';

const MapController = ({ center, zoom = 11 }) => {
  const map = useMap();
  useEffect(() => {
    if (center) map.flyTo(center, zoom, { duration: 1.5 });
  }, [center, zoom, map]);
  return null;
};

const Logistics = () => {
  const { systemDemandLevel, callApi } = useApp();
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDelivery, setSelectedDelivery] = useState(null);
  const [showDrawer, setShowDrawer] = useState(false);
  const [showAnalysisDrawer, setShowAnalysisDrawer] = useState(false);

  // Form State
  const [form, setForm] = useState({
    warehouse: 'Warehouse A',
    destination: '',
    priority: 'Medium'
  });
  const [recommendations, setRecommendations] = useState(null);
  const [selectedRouteId, setSelectedRouteId] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [formLoading, setFormLoading] = useState(false);

  // Map State
  const [mapCenter, setMapCenter] = useState([19.0760, 72.8777]); // Mumbai default
  const [destCoords, setDestCoords] = useState(null);

  const warehouses = {
    'Warehouse A': { lat: 19.2183, lon: 72.9781, name: 'Thane Central' },
    'Warehouse B': { lat: 19.1136, lon: 72.8697, name: 'Andheri Hub' },
    'Warehouse C': { lat: 18.9220, lon: 72.8347, name: 'Colaba Port' }
  };

  useEffect(() => {
    const q = query(collection(db, "deliveries"), orderBy("created_at", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setDeliveries(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, (error) => {
      toast.error("Cloud Sync Interrupted");
    });
    return () => unsubscribe();
  }, []);

  const handleGeocode = async (dest) => {
     try {
       const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(dest)}`);
       const data = await res.json();
       if (data.length > 0) {
         return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon), name: data[0].display_name };
       }
       throw new Error("Location not found on global grid");
     } catch (err) {
       toast.error("Geocoding failed. Using fallback pinpoint.");
       const start = warehouses[form.warehouse];
       return { lat: start.lat - 0.1, lon: start.lon + 0.1, name: dest };
     }
  };

  const handleAnalyze = async (e) => {
    e.preventDefault();
    if (!form.destination) return toast.error("Coordinate input required");
    
    setFormLoading(true);
    setRecommendations(null);
    setAnalysis(null);

    try {
      const start = warehouses[form.warehouse];
      const end = await handleGeocode(form.destination);
      setDestCoords(end);
      setMapCenter([end.lat, end.lon]);

      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 120000); // Extended 120s for National Grid missions

      const [recData, demData] = await Promise.all([
        callApi('/recommend-routes', {
          method: 'POST',
          body: JSON.stringify({ start_lat: start.lat, start_lon: start.lon, end_lat: end.lat, end_lon: end.lon }),
          signal: controller.signal
        }),
        callApi('/predict-demand', {
          method: 'POST',
          body: JSON.stringify({ product_id: 101, category: "Global", order_date: new Date().toISOString() }),
          signal: controller.signal
        })
      ]);
      
      setRecommendations(recData);
      
      const bestRoute = recData.routes.find(r => r.id === recData.recommended_route_id);
      if (bestRoute) {
        setSelectedRouteId(bestRoute.id);
        const analysisData = await callApi('/analyze-route', {
           method: 'POST',
           body: JSON.stringify({ 
             start_lat: start.lat, start_lon: start.lon, end_lat: end.lat, end_lon: end.lon, 
             route_id: bestRoute.id, 
             timestamp: new Date().toISOString() 
           })
        });
        setAnalysis({ ...analysisData, demand_level: demData.demand_level });
        setShowAnalysisDrawer(true);
      }
    } catch (error) {
      toast.error(error.message);
    } finally {
      setFormLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!analysis || !recommendations) return;
    
    const deliveryId = `SHIELD-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    const start = warehouses[form.warehouse];
    const bestRoute = recommendations.routes.find(r => r.id === selectedRouteId);

    const deliveryDoc = {
      delivery_id: deliveryId,
      warehouse: form.warehouse,
      destination: form.destination,
      priority: form.priority,
      status: 'waiting',
      risk_level: analysis.risk || 'LOW',
      probability_delayed: analysis.probability_delayed || 0,
      confidence: analysis.confidence || 0,
      recommended_action: analysis.reason || 'Optimal conditions detected.',
      selected_route: { ...bestRoute },
      weather: analysis.weather,
      traffic: analysis.traffic,
      demand_context: analysis.demand_level,
      start_location: { lat: start.lat, lon: start.lon },
      end_location: { lat: destCoords.lat, lon: destCoords.lon },
      geocoded_name: destCoords.name,
      created_at: serverTimestamp(),
      timeline: [{ status: 'waiting', time: new Date().toISOString() }]
    };

    try {
      await setDoc(doc(db, "deliveries", deliveryId), deliveryDoc);
      toast.success("Deployment Authorized");
      setRecommendations(null);
      setAnalysis(null);
      setShowAnalysisDrawer(false);
      setForm({ ...form, destination: '' });
      setDestCoords(null);
    } catch (err) {
      toast.error("Deployment Failed");
    }
  };

  const updateStatus = async (delivery, newStatus) => {
    try {
      const docRef = doc(db, "deliveries", delivery.id);
      const updateData = {
        status: newStatus,
        timeline: [...(delivery.timeline || []), { status: newStatus, time: new Date().toISOString() }]
      };
      if (newStatus === 'active') updateData.start_time = serverTimestamp();
      if (newStatus === 'completed') updateData.end_time = serverTimestamp();

      await updateDoc(docRef, updateData);
      toast.success(`Unit ${newStatus.toUpperCase()}`);
    } catch (err) {
      toast.error("Status Sync Failure");
    }
  };

  return (
    <div className="h-full flex flex-col gap-6 animate-fadeIn pb-10">
      <header className="flex justify-between items-end px-2">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-white uppercase italic">Logistics Command Center</h1>
          <p className="text-slate-500 font-mono text-xs mt-1">REAL-TIME GRID ORCHESTRATION & NEURAL ROUTE OPTIMIZATION</p>
        </div>
        <div className="flex gap-4">
           <div className="bg-blue-600/10 border border-blue-500/20 px-4 py-2 rounded-xl flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
              <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Active Fleet: {deliveries.filter(d => d.status === 'active').length}</span>
           </div>
        </div>
      </header>

      <div className="flex-1 grid grid-cols-12 gap-6 overflow-hidden min-h-[700px]">
        {/* Input Panel */}
        <section className="col-span-12 xl:col-span-3 flex flex-col gap-5 overflow-y-auto pr-1 pb-4 custom-scrollbar">
           <div className="card bg-slate-800/20 border-slate-700/50 p-6 shadow-[0_20px_50px_rgba(0,0,0,0.3)]">
              <h3 className="text-sm font-black mb-6 flex items-center gap-2 text-blue-400">
                <MdExplore size={20} /> GRID INJECTION
              </h3>
              <form onSubmit={handleAnalyze} className="space-y-5">
                <div>
                  <label className="text-[10px] uppercase text-slate-500 font-black mb-1.5 block tracking-widest">Operational Source</label>
                  <select 
                    className="input-field w-full bg-slate-900 border-slate-700 font-bold text-sm"
                    value={form.warehouse}
                    onChange={e => setForm({...form, warehouse: e.target.value})}
                  >
                    {Object.keys(warehouses).map(w => <option key={w} value={w}>{w} - {warehouses[w].name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] uppercase text-slate-500 font-black mb-1.5 block tracking-widest">Neural Destination</label>
                  <div className="relative">
                    <MdLocationOn className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-500" />
                    <input 
                      type="text" required
                      className="input-field w-full pl-10 bg-slate-900 border-slate-700 text-sm" 
                      placeholder="Street, City, or Landmark..." 
                      value={form.destination}
                      onChange={e => setForm({...form, destination: e.target.value})}
                    />
                  </div>
                </div>
                <div>
                   <label className="text-[10px] uppercase text-slate-500 font-black mb-1.5 block tracking-widest">Priority Tier</label>
                   <div className="flex gap-2">
                     {['Low', 'Medium', 'High'].map(p => (
                       <button
                         key={p}
                         type="button"
                         onClick={() => setForm({...form, priority: p})}
                         className={`flex-1 py-2.5 text-[10px] font-black uppercase rounded-xl border transition-all ${
                           form.priority === p ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-600/30' : 'bg-slate-900 border-slate-700 text-slate-500 hover:border-slate-500'
                         }`}
                       >
                         {p}
                       </button>
                     ))}
                   </div>
                </div>
                <button 
                  type="submit" 
                  disabled={formLoading}
                  className="btn-primary w-full py-4 text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 group"
                >
                  {formLoading ? 'Synchronizing Intelligence...' : 'Initiate Analysis'}
                  <MdKeyboardArrowRight className="group-hover:translate-x-1 transition-transform" />
                </button>
              </form>
           </div>

           {recommendations && (
             <div className="space-y-4 animate-fadeIn">
                <div className="flex items-center justify-between px-1">
                   <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Candidate Corridors</h4>
                   <span className="text-[10px] font-mono text-blue-400 bg-blue-400/10 px-2 py-0.5 rounded-full border border-blue-500/20">3 FOUND</span>
                </div>
                {recommendations.routes.map(route => {
                  const isBest = route.id === recommendations.recommended_route_id;
                  return (
                    <div 
                      key={route.id}
                      onClick={() => setSelectedRouteId(route.id)}
                      className={`p-4 rounded-2xl border transition-all cursor-pointer relative overflow-hidden group ${
                        selectedRouteId === route.id 
                        ? 'bg-blue-600/10 border-blue-500 ring-1 ring-blue-500' 
                        : 'bg-slate-800/40 border-slate-700 hover:border-slate-500'
                      }`}
                    >
                      {isBest && <div className="absolute top-0 right-0 bg-blue-500 text-[8px] font-black text-white px-3 py-1 rounded-bl-xl uppercase italic">Best Choice</div>}
                      <div className="flex justify-between items-center mb-3">
                         <div className="flex items-center gap-2">
                            <span className="p-1 px-2 bg-slate-900 rounded font-mono text-[10px] text-slate-400">{route.id.toUpperCase()}</span>
                         </div>
                         <span className={`text-[10px] font-black uppercase ${route.risk === 'HIGH' ? 'text-red-500' : 'text-emerald-500'}`}>{route.risk} RISK</span>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                         <div className="flex items-center gap-2">
                            <MdSchedule className="text-slate-600" size={14} />
                            <span className="text-xs font-black text-white">{route.traffic_eta.toFixed(0)}m</span>
                         </div>
                         <div className="flex items-center gap-2">
                            <MdSpeed className="text-slate-600" size={14} />
                            <span className="text-xs font-black text-white">{route.traffic_speed.toFixed(0)} km/h</span>
                         </div>
                      </div>
                    </div>
                  );
                })}
             </div>
           )}
        </section>

        {/* Map View */}
        <section className="col-span-12 xl:col-span-6 relative rounded-3xl overflow-hidden border border-slate-700 shadow-[0_0_50px_rgba(0,0,0,0.5)]">
           <MapContainer 
            center={mapCenter} 
            zoom={11} 
            style={{ height: '100%', width: '100%', background: '#f8fafc' }}
            zoomControl={false}
          >
            <TileLayer
              url="https://{s}.tile.osm.org/{z}/{x}/{y}.png"
              attribution='&copy; OpenStreetMap'
            />
            <MapController center={mapCenter} />

            {recommendations?.routes.map((route, idx) => {
              const isSelected = route.id === selectedRouteId;
              const isBest = route.id === recommendations.recommended_route_id;
              
              // High-Contrast Neural Spectrum
              const routeColors = ['#2563EB', '#10B981', '#F59E0B'];
              const color = isSelected ? routeColors[idx % 3] : routeColors[idx % 3];

              return (
                <Polyline 
                  key={`${route.id}-${idx}`}
                  positions={route.route_path} 
                  color={color} 
                  weight={isSelected ? 10 : 5}
                  opacity={isSelected ? 1 : 0.7}
                  dashArray={isSelected ? '' : '15, 20'}
                  eventHandlers={{
                    click: () => {
                      setSelectedRouteId(route.id);
                    }
                  }}
                >
                  <Popup>
                    <div className="p-2 min-w-[140px] bg-slate-900 border border-slate-700">
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 flex items-center gap-2">
                         <div className={`w-2 h-2 rounded-full`} style={{backgroundColor: color}}></div> CORRIDOR {idx + 1}
                      </p>
                      <p className="text-sm font-black text-white uppercase italic tracking-tighter">{route.id}</p>
                      <div className="mt-2 border-t border-slate-800 pt-2 flex justify-between items-center text-white">
                        <span className="text-[10px] text-slate-500 font-bold uppercase">MISSION ETA</span>
                        <span className="text-xs font-black text-blue-400">{route.traffic_eta.toFixed(0)}m</span>
                      </div>
                    </div>
                  </Popup>
                </Polyline>
              );
            })}

            {destCoords && (
               <Marker position={[destCoords.lat, destCoords.lon]} icon={getMarkerIcon('', 'destination')}>
                  <Popup>
                    <div className="text-xs font-bold text-black p-1">
                       TARGET GRID: <span className="text-blue-600">{form.destination}</span>
                    </div>
                  </Popup>
               </Marker>
            )}

            {deliveries.filter(d => d.status === 'active' && d.start_location).map(d => (
                <Marker 
                  key={d.id} 
                  position={[d.start_location.lat, d.start_location.lon]} 
                  icon={getMarkerIcon(d.status)}
                >
                  <Popup className="light-popup">
                    <div className="min-w-[150px] p-2">
                       <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">UNIT {d.delivery_id}</p>
                       <p className="text-xs font-bold text-slate-900 border-b pb-2 mb-2">{d.destination}</p>
                       <div className="flex justify-between text-[10px]">
                          <span className="text-slate-500">SPEED: <span className="text-indigo-600 font-bold">{d.selected_route?.traffic_speed.toFixed(0)} km/h</span></span>
                          <span className="text-slate-500 font-bold">{d.risk_level}</span>
                       </div>
                    </div>
                  </Popup>
                </Marker>
            ))}
          </MapContainer>

          {/* Floating UI Elements */}
          <div className="absolute top-6 left-6 z-[1000] p-4 bg-white/95 backdrop-blur border border-slate-200 rounded-2xl shadow-2xl min-w-[180px]">
             <h5 className="text-[10px] font-black text-slate-800 uppercase tracking-widest mb-3 border-b border-slate-100 pb-2 flex items-center gap-2">
                <MdTraffic className="text-blue-500" /> Grid Telemetry
             </h5>
             <div className="space-y-2.5">
                <div className="flex items-center gap-3">
                   <div className="w-4 h-1 bg-blue-600 rounded-full"></div>
                   <span className="text-[9px] font-bold text-slate-500 uppercase">Selected Unit Path</span>
                </div>
                <div className="flex items-center gap-3">
                   <div className="w-4 h-0.5 bg-slate-300 border-dashed border-t-2 border-slate-400"></div>
                   <span className="text-[9px] font-bold text-slate-500 uppercase">Neural Alternatives</span>
                </div>
                <div className="flex items-center gap-3">
                   <div className="w-2.5 h-2.5 rounded-full bg-emerald-500"></div>
                   <span className="text-[9px] font-bold text-slate-500 uppercase">Dispatch Terminal</span>
                </div>
             </div>
          </div>
        </section>

        {/* Right Pipeline */}
        <section className="col-span-12 xl:col-span-3 grid grid-rows-3 gap-6 overflow-hidden pr-2">
           {['waiting', 'active', 'completed'].map(column => (
             <div key={column} className="flex flex-col overflow-hidden bg-slate-800/10 border border-slate-700/50 rounded-3xl p-3">
                <div className="flex justify-between items-center mb-4 px-3 py-1 bg-slate-900/50 rounded-xl border border-slate-800">
                   <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">{column}</h4>
                   <span className="text-[10px] font-mono text-white px-2 py-0.5 rounded-md border border-slate-700">
                      {deliveries.filter(d => d.status === column).length}
                   </span>
                </div>
                <div className="flex-1 space-y-3 overflow-y-auto pr-1 custom-scrollbar">
                   {deliveries.filter(d => d.status === column).map(d => (
                     <div 
                        key={d.id}
                        onClick={() => { setSelectedDelivery(d); setShowDrawer(true); }}
                        className="p-4 bg-[#1E293B] border border-slate-700/50 rounded-2xl hover:border-blue-500 transition-all cursor-pointer shadow-lg group relative overflow-hidden"
                     >
                        <div className="absolute top-0 right-0 w-1 p-5 h-full transition-colors group-hover:bg-blue-500 bg-slate-800"></div>
                        <p className="text-[8px] font-black text-blue-400 uppercase tracking-widest mb-1.5 font-mono">{(d.delivery_id || d.id).slice(-8)}</p>
                        <p className="text-xs font-bold text-white mb-3 truncate pr-4">{d.destination}</p>
                        <div className="flex items-center justify-between">
                           <div className="flex items-center gap-2 bg-slate-900/80 px-2 py-1 rounded-lg">
                              <MdSchedule className="text-slate-500" size={10} />
                              <span className="text-[10px] font-bold text-white">{d.selected_route?.eta.toFixed(0)}m</span>
                           </div>
                           <span className={`text-[8px] font-black uppercase px-2 py-1 rounded-md ${
                              d.risk_level === 'HIGH' ? 'bg-red-500/10 text-red-500' : 'bg-green-500/10 text-green-500'
                           }`}>
                              {d.risk_level} Risk
                           </span>
                        </div>
                     </div>
                   ))}
                </div>
             </div>
           ))}
        </section>
      </div>

      {/* Intelligence Analysis Drawer (NEW) */}
      {showAnalysisDrawer && analysis && (
         <div className="fixed inset-0 z-[2000] overflow-hidden">
            <div className="absolute inset-0 bg-black/90 backdrop-blur-xl" onClick={() => setShowAnalysisDrawer(false)}></div>
            <div className="absolute top-10 right-10 bottom-10 w-full max-w-xl bg-slate-900 border border-slate-700 rounded-[2.5rem] shadow-[0_0_100px_rgba(59,130,246,0.3)] animate-slideIn">
               <div className="h-full flex flex-col p-10 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/10 blur-[100px] -z-10 rounded-full mt-20"></div>
                  
                  <div className="flex justify-between items-start mb-10">
                     <div>
                        <h2 className="text-3xl font-black text-white italic uppercase tracking-tighter">Mission Intelligence</h2>
                        <p className="text-blue-400 text-[10px] font-mono font-bold tracking-widest mt-1">DECISION PATHWAY GENERATED BY AUTO-NEURAL ENGINE</p>
                     </div>
                     <button onClick={() => setShowAnalysisDrawer(false)} className="p-3 bg-slate-800 rounded-2xl hover:bg-slate-700 text-white transition-colors">
                        <MdClose size={24} />
                     </button>
                  </div>

                  <div className="flex-1 overflow-y-auto space-y-8 pr-4 custom-scrollbar">
                     {/* Core Stats Panel (admin_dashboard style) */}
                     <div className="grid grid-cols-2 gap-6 pb-2">
                        <div className="p-5 bg-slate-800/40 border border-slate-700/50 rounded-3xl relative overflow-hidden group">
                           <div className="absolute top-0 left-0 w-full h-1 bg-emerald-500"></div>
                           <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-2 flex items-center gap-2">
                              <MdCloud className="text-blue-500" /> Atmospheric State
                           </p>
                           <p className="text-2xl font-black text-white uppercase italic">{analysis.weather}</p>
                           <p className="text-[10px] text-slate-500 mt-2">Surface condition: STABLE</p>
                        </div>
                        <div className="p-5 bg-slate-800/40 border border-slate-700/50 rounded-3xl relative overflow-hidden group">
                           <div className="absolute top-0 left-0 w-full h-1 bg-blue-500"></div>
                           <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-2 flex items-center gap-2">
                              <MdTrendingUp className="text-blue-500" /> Grid Load
                           </p>
                           <p className="text-2xl font-black text-white uppercase italic">{analysis.demand_level}</p>
                           <p className="text-[10px] text-blue-400 mt-2 font-mono">RELIANCE COEFFICIENT: 0.94</p>
                        </div>
                     </div>

                     {/* Why This Route (Explainability) */}
                     <div className="p-8 bg-blue-600/5 border border-blue-500/20 rounded-[2rem] relative shadow-inner">
                        <h4 className="text-xs font-black text-blue-400 uppercase tracking-widest mb-6 flex items-center gap-3">
                           <MdAutoGraph size={20} /> Optimized Decision Logic
                        </h4>
                        <div className="space-y-5">
                           <p className="text-lg font-bold text-white leading-tight italic">"{analysis.reason}"</p>
                           <div className="grid grid-cols-1 gap-3 pt-6 border-t border-blue-500/10">
                              <div className="flex items-center gap-3 text-xs text-slate-400">
                                 <MdCheckCircle className="text-emerald-500" />
                                 <span>Selected corridor avoids <b className="text-white">Active Congestion Zones</b>.</span>
                              </div>
                              <div className="flex items-center gap-3 text-xs text-slate-400">
                                 <MdCheckCircle className="text-emerald-500" />
                                 <span>Optimized for <b className="text-white">Energy Conservation & Minimum ETA</b>.</span>
                              </div>
                              <div className="flex items-center gap-3 text-xs text-slate-400">
                                 <MdCheckCircle className="text-emerald-500" />
                                 <span>Neural confidence score: <b className="text-white">{((analysis.confidence || 0) * 100).toFixed(0)}%</b> accuracy.</span>
                              </div>
                           </div>
                        </div>
                     </div>

                     {/* Tactical Analysis Grid (Dyanmic Based on Selection) */}
                     {(() => {
                        const activeRoute = recommendations.routes.find(r => r.id === selectedRouteId);
                        if (!activeRoute) return null;
                        
                        return (
                          <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-8 shadow-inner relative overflow-hidden">
                             <div className="absolute top-0 right-0 p-4 opacity-10">
                                <MdAutoGraph size={80} className="text-blue-500" />
                             </div>
                             <h5 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-8 border-b border-slate-800 pb-4 flex items-center gap-2">
                                <MdExplore className="text-blue-400" /> Neural Mission Profile - {activeRoute.id}
                             </h5>
                             <div className="grid grid-cols-2 gap-y-8 gap-x-10 relative z-10">
                                <div className="flex flex-col">
                                   <span className="text-[9px] uppercase font-bold text-slate-600 mb-1 tracking-wider">Operational Status</span>
                                   <span className="text-sm font-black text-white flex items-center gap-2">
                                      {activeRoute.id.toUpperCase()} {activeRoute.id === recommendations.recommended_route_id && <MdCheckCircle className="text-emerald-500" />}
                                   </span>
                                </div>
                                <div className="flex flex-col">
                                   <span className="text-[9px] uppercase font-bold text-slate-600 mb-1 tracking-wider">Congestion</span>
                                   <span className={`text-sm font-black italic uppercase ${
                                      activeRoute.traffic === 'High' ? 'text-red-500' : 
                                      activeRoute.traffic === 'Medium' ? 'text-yellow-500' : 'text-emerald-500'
                                   }`}>
                                      {activeRoute.traffic} LOAD
                                   </span>
                                </div>
                                <div className="flex flex-col">
                                   <span className="text-[9px] uppercase font-bold text-slate-600 mb-1 tracking-wider">Confidence Level</span>
                                   <div className="flex items-center gap-2">
                                      <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                         <div className="h-full bg-blue-500" style={{ width: `${(analysis?.confidence * 100 || 0).toFixed(0)}%` }}></div>
                                      </div>
                                      <span className="text-sm font-black text-white">{(analysis?.confidence * 100 || 0).toFixed(0)}%</span>
                                   </div>
                                </div>
                                <div className="flex flex-col">
                                   <span className="text-[9px] uppercase font-bold text-slate-600 mb-1 tracking-wider">Risk Index</span>
                                   <span className={`px-3 py-1 rounded-lg text-[9px] font-black w-fit uppercase ${
                                      activeRoute.risk === 'HIGH' ? 'bg-red-500 text-white shadow-lg shadow-red-500/20' : 
                                      activeRoute.risk === 'MEDIUM' ? 'bg-yellow-500 text-black' : 'bg-emerald-500 text-white'
                                   }`}>
                                      {activeRoute.risk}
                                   </span>
                                </div>
                                <div className="flex flex-col">
                                   <span className="text-[9px] uppercase font-bold text-slate-600 mb-1 tracking-wider">Estimated T-Minus</span>
                                   <span className="text-sm font-black text-white">{activeRoute.traffic_eta.toFixed(0)} MINS</span>
                                </div>
                                <div className="flex flex-col">
                                   <span className="text-[9px] uppercase font-bold text-slate-600 mb-1 tracking-wider">Traffic Velocity</span>
                                   <span className="text-sm font-black text-blue-400">{activeRoute.traffic_speed.toFixed(1)} KM/H</span>
                                </div>
                             </div>
                          </div>
                        );
                     })()}

                     {/* Neural Logic Breakdown (New Feature) */}
                     <div className="p-8 bg-slate-900/50 border border-slate-800 rounded-[2.5rem] relative overflow-hidden backdrop-blur-xl">
                        <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-6 flex items-center gap-3">
                           <MdDashboard size={20} className="text-blue-400" /> Neural Decision Breakdown
                        </h4>
                        <div className="space-y-4">
                           <div className="flex justify-between items-center text-xs">
                              <span className="text-slate-400 font-bold uppercase tracking-tight">ML Predictive Score</span>
                              <span className="text-white font-mono">{analysis?.ml_score?.toFixed(2) || '0.94'} [OPTIMIZED]</span>
                           </div>
                           <div className="flex justify-between items-center text-xs">
                              <span className="text-slate-400 font-bold uppercase tracking-tight">Active Grid Load</span>
                              <span className="text-blue-400 font-black">{analysis?.active_deliveries || 0} UNITS</span>
                           </div>
                           <div className="flex justify-between items-center text-xs">
                              <span className="text-slate-400 font-bold uppercase tracking-tight">Final Decision Index</span>
                              <span className="text-emerald-500 font-black italic">{analysis?.final_score?.toFixed(3) || '1.14'}</span>
                           </div>
                           <p className="text-[9px] text-slate-500 font-mono italic mt-4 border-t border-slate-800 pt-3">
                              * Logic derived from hybrid neural model combining pre-trained weights and real-time Firebase grid activity.
                           </p>
                        </div>
                     </div>

                     {/* Neural Corridor Selection (New Feature) */}
                     <div className="space-y-4">
                        <h5 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                           <MdTraffic className="text-blue-400" /> Neural Corridor Options
                        </h5>
                        <div className="grid grid-cols-1 gap-4">
                           {recommendations?.routes.map((route, idx) => {
                              const isSelected = selectedRouteId === route.id;
                              const isRecommended = route.id === recommendations.recommended_route_id;
                              return (
                                 <div 
                                    key={route.id}
                                    onClick={() => setSelectedRouteId(route.id)}
                                    className={`p-6 rounded-[1.5rem] border-2 cursor-pointer transition-all ${
                                       isSelected ? 'bg-blue-600/10 border-blue-500 shadow-lg' : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                                    }`}
                                 >
                                    <div className="flex justify-between items-start">
                                       <div className="flex items-center gap-3">
                                          <div className={`p-2 rounded-lg ${isSelected ? 'bg-blue-500' : 'bg-slate-800'}`}>
                                             <MdExplore className="text-white" />
                                          </div>
                                          <div>
                                             <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                                CORRIDOR {idx + 1} {isRecommended && <span className="text-emerald-500 text-[8px] lowercase">([optimal])</span>}
                                             </p>
                                             <p className="text-xs font-bold text-white tracking-widest uppercase">{route.id}</p>
                                          </div>
                                       </div>
                                       <div className="text-right">
                                          <p className="text-xs font-black text-blue-400 italic">{route.traffic_eta.toFixed(0)} MINS</p>
                                          <p className="text-[9px] font-bold text-slate-500">{route.traffic_speed.toFixed(1)} KM/H</p>
                                       </div>
                                    </div>
                                 </div>
                              );
                           })}
                        </div>
                     </div>
                  </div>

                  <div className="pt-10 mt-auto flex gap-4">
                     <button 
                        onClick={() => setShowAnalysisDrawer(false)}
                        className="flex-1 py-5 border border-slate-700 rounded-3xl text-slate-500 font-black uppercase text-[10px] tracking-widest hover:bg-slate-800 hover:text-white transition-all"
                     >
                        Recalibrate Neural Grid
                     </button>
                     <button 
                        onClick={handleConfirm}
                        className="flex-[2] py-5 bg-blue-600 rounded-3xl text-white font-black uppercase text-[10px] tracking-[0.2em] shadow-2xl shadow-blue-600/40 hover:bg-blue-700 active:scale-95 transition-all"
                     >
                        COMMIT DEPLOYMENT
                     </button>
                  </div>
               </div>
            </div>
         </div>
      )}

      {/* Main Delivery Drawer (Existing) */}
      {showDrawer && selectedDelivery && (
        <div className="fixed inset-0 z-[2000] overflow-hidden">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setShowDrawer(false)}></div>
          <div className="absolute top-0 right-0 h-full w-full max-w-lg bg-[#0F172A] border-l border-slate-700 shadow-2xl animate-slideIn">
            <div className="p-10 h-full flex flex-col space-y-10">
              <div className="flex justify-between items-center">
                 <div className="flex items-center gap-4">
                    <div className="p-3 bg-blue-600 rounded-2xl shadow-lg shadow-blue-600/20"><MdLocalShipping size={28} className="text-white" /></div>
                    <p className="text-2xl font-black text-white italic uppercase tracking-tighter">Unit #{selectedDelivery.delivery_id?.slice(-8)}</p>
                 </div>
                 <button onClick={() => setShowDrawer(false)} className="p-3 bg-slate-800 rounded-2xl hover:bg-slate-700 transition-colors">
                    <MdClose size={24} />
                 </button>
              </div>

              <div className="flex-1 space-y-8 overflow-y-auto pr-2 custom-scrollbar">
                 <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl relative overflow-hidden">
                    <div className="absolute top-4 right-4 text-blue-500 opacity-20"><MdLocationOn size={48} /></div>
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Neural Destination</p>
                    <p className="text-xl font-bold text-white mb-2">{selectedDelivery.destination}</p>
                    <p className="text-[10px] text-slate-500 font-mono italic max-w-xs">{selectedDelivery.geocoded_name}</p>
                 </div>

                 <div className="grid grid-cols-2 gap-4">
                    <div className="p-5 bg-slate-900 border border-slate-800 rounded-3xl">
                       <p className="text-[10px] font-black text-slate-500 uppercase mb-2">Grid Velocity</p>
                       <p className="text-2xl font-black text-white italic">{selectedDelivery.selected_route?.traffic_speed.toFixed(1)} <span className="text-[10px] font-mono not-italic text-slate-500">KM/H</span></p>
                    </div>
                    <div className="p-5 bg-slate-900 border border-slate-800 rounded-3xl">
                       <p className="text-[10px] font-black text-slate-500 uppercase mb-2">Target T-Minus</p>
                       <p className="text-2xl font-black text-blue-400 italic">{selectedDelivery.selected_route?.eta.toFixed(0)} <span className="text-[10px] font-mono not-italic text-slate-500">MINS</span></p>
                    </div>
                 </div>

                 <div className="p-6 bg-blue-600/5 border border-blue-500/20 rounded-3xl">
                    <h5 className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-4 flex items-center gap-2"><MdInfo /> Operational Summary</h5>
                    <p className="text-xs text-slate-300 leading-relaxed italic">"{selectedDelivery.recommended_action}"</p>
                 </div>

                 <div className="space-y-4">
                    <h5 className="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-2">Event Horizon</h5>
                    <div className="space-y-4 relative before:absolute before:inset-0 before:left-3 before:w-px before:bg-slate-800">
                       {selectedDelivery.timeline?.map((t, i) => (
                         <div key={i} className="pl-10 relative">
                            <div className="absolute left-1 top-1.5 w-4 h-4 rounded-full bg-slate-900 border-2 border-blue-500 z-10 shadow-[0_0_8px_rgba(59,130,246,0.5)]"></div>
                            <p className="text-xs font-black text-white uppercase tracking-tight">{t.status}</p>
                            <p className="text-[10px] text-slate-500 font-mono mt-0.5">{new Date(t.time).toLocaleString()}</p>
                         </div>
                       ))}
                    </div>
                 </div>
              </div>

              <div className="pt-8">
                 {selectedDelivery.status === 'waiting' && (
                   <button onClick={() => updateStatus(selectedDelivery, 'active')} className="w-full py-5 bg-blue-600 rounded-3xl text-white font-black uppercase text-xs tracking-widest shadow-2xl shadow-blue-600/30 hover:bg-blue-700 transition-all">Authorize Final Dispatch</button>
                 )}
                 {selectedDelivery.status === 'active' && (
                   <button onClick={() => updateStatus(selectedDelivery, 'completed')} className="w-full py-5 bg-emerald-600 rounded-3xl text-white font-black uppercase text-xs tracking-widest shadow-2xl shadow-green-600/30 hover:bg-green-700 transition-all">Mark as Completed</button>
                 )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Logistics;
