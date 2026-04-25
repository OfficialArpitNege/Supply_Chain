import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection,
  query,
  onSnapshot,
  orderBy,
  limit,
  where
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  MdLocalShipping,
  MdWarning,
  MdSchedule,
  MdCheckCircle,
  MdCancel,
  MdLayers,
  MdMap
} from 'react-icons/md';
import { useApp } from '../context/AppContext';
import toast from 'react-hot-toast';

// --- Assets ---
const driverIcon = new L.Icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/3063/3063822.png',
  iconSize: [32, 32],
  iconAnchor: [16, 32],
});

const warehouseIcon = new L.Icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/2271/2271068.png',
  iconSize: [36, 36],
  iconAnchor: [18, 36],
});

const customerIcon = new L.Icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/1067/1067555.png',
  iconSize: [32, 32],
  iconAnchor: [16, 32],
});

// Helper to auto-center map
const MapRefocuser = ({ center }) => {
  const map = useMap();
  useEffect(() => {
    if (center) map.flyTo(center, 13);
  }, [center, map]);
  return null;
};

// Helper to pick location on click
const LocationPicker = ({ onLocationSelect }) => {
  useMapEvents({
    click(e) {
      onLocationSelect(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
};

const StatusBadge = ({ status }) => {
  const colors = {
    pending: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
    accepted: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    assigned: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
    dispatched: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
    in_transit: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    nearing: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    delivered: 'bg-slate-700/10 text-slate-400 border-slate-700/20',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border ${colors[status] || 'bg-slate-700/10 text-slate-400 border-slate-700/20'}`}>
      {status?.replace('_', ' ')}
    </span>
  );
};

const Dashboard = () => {
  const { callApi } = useApp();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('orders');
  const [orders, setOrders] = useState([]);
  const [supplierRequests, setSupplierRequests] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [activityFeed, setActivityFeed] = useState([]);
  const [selectedDelivery, setSelectedDelivery] = useState(null);
  const [mapCenter, setMapCenter] = useState([19.0760, 72.8777]);
  const [showAssets, setShowAssets] = useState(false);
  const [newWh, setNewWh] = useState({ name: '', lat: 19.0760, lon: 72.8777, capacity: 1000 });

  const [activeDeliveryTab, setActiveDeliveryTab] = useState('active');

  useEffect(() => {
    // 1. Pending Orders
    const unsubOrders = onSnapshot(query(collection(db, 'orders'), where('status', '==', 'pending')), (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      data.sort((a, b) => (b.created_at?.seconds || 0) - (a.created_at?.seconds || 0));
      setOrders(data);
    });

    // 2. Pending Supplier Requests
    const unsubSuppliers = onSnapshot(query(collection(db, 'supplier_requests'), where('status', '==', 'pending')), (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      data.sort((a, b) => (b.created_at?.seconds || 0) - (a.created_at?.seconds || 0));
      setSupplierRequests(data);
    });

    // 3. Deliveries (Active and Completed)
    const unsubDeliveries = onSnapshot(collection(db, 'deliveries'), (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      data.sort((a, b) => (b.created_at?.seconds || 0) - (a.created_at?.seconds || 0));
      setDeliveries(data);
    });

    // 4. Warehouses & Drivers for reference
    onSnapshot(collection(db, 'warehouses'), (snap) => setWarehouses(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    onSnapshot(collection(db, 'drivers'), (snap) => setDrivers(snap.docs.map(d => ({ id: d.id, ...d.data() }))));

    // 5. Activity Feed
    const unsubNotifs = onSnapshot(query(collection(db, 'notifications'), orderBy('created_at', 'desc'), limit(20)), (snap) => {
      setActivityFeed(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => { unsubOrders(); unsubSuppliers(); unsubDeliveries(); unsubNotifs(); };
  }, []);

  const addWarehouse = async () => {
    if (!newWh.name) return toast.error("Name required");
    const tid = toast.loading("Deploying asset...");
    try {
      await callApi('/admin/warehouses', {
        method: 'POST',
        body: JSON.stringify({
          name: newWh.name,
          location: { lat: Number(newWh.lat), lon: Number(newWh.lon) },
          capacity: Number(newWh.capacity)
        })
      });
      setNewWh({ name: '', lat: 19.0760, lon: 72.8777, capacity: 1000 });
      toast.success("Asset initialized", { id: tid });
    } catch (e) {
      toast.error(e.message, { id: tid });
    }
  };

  const resetDrivers = async () => {
    if (!window.confirm("Make all drivers available? This clears active assignments.")) return;
    const tid = toast.loading("Resetting fleet...");
    try {
      await callApi('/admin/reset-drivers', { method: 'POST' });
      toast.success("All drivers are now available", { id: tid });
    } catch (e) {
      toast.error(e.message, { id: tid });
    }
  };

  const deleteWarehouse = async (id) => {
    if (!confirm("Delete this warehouse?")) return;
    const tid = toast.loading("Decommissioning asset...");
    try {
      await callApi(`/admin/warehouses/${id}`, { method: 'DELETE' });
      toast.success("Asset deleted", { id: tid });
    } catch (e) {
      toast.error(e.message, { id: tid });
    }
  };

  const handleAcceptOrder = async (orderId) => {
    const tid = toast.loading("Accepting order & selecting warehouse...");
    try {
      const res = await callApi(`/orders/${orderId}/accept`, { method: 'POST' });
      toast.success(res.message, { id: tid });
      navigate(`/logistics?orderId=${orderId}`);
    } catch (e) {
      toast.error(e.message, { id: tid });
    }
  };

  const handleDisruption = async (type) => {
    try {
      await callApi('/deliveries/disrupt', {
        method: 'POST',
        body: JSON.stringify({
          type,
          affected_route: 'route_1',
          severity: 'HIGH'
        })
      });
      toast.error(`System disrupted: ${type.replace('_', ' ').toUpperCase()}`);
    } catch (e) {
      toast.error(e.message);
    }
  };

  return (
    <div className="h-[calc(100vh-120px)] flex flex-col gap-6 overflow-hidden">
      
      {/* Header with Assets Toggle */}
      <div className="flex justify-between items-center bg-slate-800/30 p-4 rounded-3xl border border-slate-700">
         <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-900/20">
               <MdLayers className="text-white text-xl" />
            </div>
            <div>
               <h2 className="text-xl font-black text-white uppercase tracking-tighter">System <span className="text-blue-500">Dashboard</span></h2>
               <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Global Logistics Orchestration</p>
            </div>
         </div>
         <button 
           onClick={() => setShowAssets(!showAssets)}
           className={`px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${showAssets ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700'}`}
         >
           {showAssets ? 'Back to Tactical Map' : 'Manage Assets'}
         </button>
      </div>

      {/* --- Top Section --- */}
      <div className="flex-1 grid grid-cols-12 gap-6 min-h-0">

        {/* 1. Incoming Requests */}
        <div className="col-span-3 flex flex-col bg-[#1E293B] border border-slate-700 rounded-3xl shadow-xl overflow-hidden">
          <div className="flex border-b border-slate-700">
            <button
              onClick={() => setActiveTab('orders')}
              className={`flex-1 py-4 text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'orders' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}
            >
              Orders ({orders.length})
            </button>
            <button
              onClick={() => setActiveTab('suppliers')}
              className={`flex-1 py-4 text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'suppliers' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}
            >
              Suppliers ({supplierRequests.length})
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
            {activeTab === 'orders' ? (
              orders.length === 0 ? <p className="text-center text-slate-500 py-10 text-xs italic">No pending orders</p> :
                orders.map(o => (
                  <div key={o.id} className="bg-slate-900/50 p-4 rounded-2xl border border-slate-700 hover:border-blue-500/50 transition-all group">
                    <div className="flex justify-between items-start mb-2">
                      <p className="text-[10px] font-mono text-blue-400">#{o.order_id?.slice(-8)}</p>
                      <span className="text-[9px] font-black text-slate-500 uppercase">{new Date(o.created_at?.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <h4 className="text-sm font-black text-white truncate">{o.customer_name}</h4>
                    <p className="text-[10px] text-slate-400 mb-4">{o.items?.map(i => `${i.quantity}x ${i.name}`).join(', ')}</p>
                    <div className="flex gap-2">
                      <button onClick={() => handleAcceptOrder(o.id)} className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-2 rounded-xl text-[9px] font-black uppercase transition-all">Accept</button>
                      <button className="px-3 bg-slate-800 hover:bg-red-500/20 hover:text-red-400 text-slate-400 rounded-xl transition-all"><MdCancel /></button>
                    </div>
                  </div>
                ))
            ) : (
              supplierRequests.length === 0 ? <p className="text-center text-slate-500 py-10 text-xs italic">No pending requests</p> :
                supplierRequests.map(s => (
                  <div key={s.id} className="bg-slate-900/50 p-4 rounded-2xl border border-slate-700 hover:border-emerald-500/50 transition-all">
                    <p className="text-[10px] font-mono text-emerald-400 mb-1">#{s.request_id}</p>
                    <h4 className="text-sm font-black text-white">{s.product_name}</h4>
                    <div className="grid grid-cols-2 gap-2 my-3">
                      <div className="bg-slate-800 p-2 rounded-lg"><p className="text-[8px] text-slate-500 uppercase font-black">Qty</p><p className="text-xs font-black">{s.quantity}</p></div>
                      <div className="bg-slate-800 p-2 rounded-lg"><p className="text-[8px] text-slate-500 uppercase font-black">Price</p><p className="text-xs font-black">${s.price_per_unit}</p></div>
                    </div>
                    <button onClick={() => callApi(`/supplier/requests/${s.id}/approve`, { method: 'POST' })} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-2 rounded-xl text-[9px] font-black uppercase transition-all">Approve Stock</button>
                  </div>
                ))
            )}
          </div>
        </div>

        {/* 2. Map / Asset Management */}
        <div className="col-span-6 bg-[#1E293B] border border-slate-700 rounded-3xl shadow-xl overflow-hidden relative">
          {showAssets ? (
            <div className="p-8 h-full overflow-y-auto custom-scrollbar bg-slate-900/50">
               <div className="grid grid-cols-1 gap-8">
                  <div>
                    <h3 className="text-xs font-black text-slate-500 uppercase tracking-[0.2em] mb-6">Active Warehouses</h3>
                    <div className="grid grid-cols-1 gap-3">
                       {warehouses.map(w => (
                         <div key={w.id} className="bg-slate-800/50 border border-slate-700 p-4 rounded-2xl flex justify-between items-center group hover:border-blue-500/30 transition-all">
                            <div>
                               <p className="text-sm font-black text-white">{w.name}</p>
                               <p className="text-[9px] font-mono text-slate-500">{w.location?.lat?.toFixed(4)}, {w.location?.lon?.toFixed(4)}</p>
                            </div>
                            <button onClick={() => deleteWarehouse(w.id)} className="opacity-0 group-hover:opacity-100 p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-all">
                               <MdCancel />
                            </button>
                         </div>
                       ))}
                    </div>
                  </div>
                  {/* Add New Asset Form */}
                  <div className="bg-slate-800/80 border border-slate-700 p-6 rounded-[2rem]">
                     <h3 className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-6">Initialize New Asset</h3>
                     <div className="space-y-6">
                        <input 
                          value={newWh.name} 
                          onChange={e => setNewWh({...newWh, name: e.target.value})} 
                          className="w-full bg-slate-900 border border-slate-700 p-4 rounded-2xl text-xs outline-none focus:border-blue-500 transition-all" 
                          placeholder="Asset Name (e.g., Central Hub B)" 
                        />
                        
                        <div className="space-y-2">
                           <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-1">Pin Point Location</p>
                           <div className="h-48 rounded-2xl overflow-hidden border border-slate-700">
                              <MapContainer center={[newWh.lat, newWh.lon]} zoom={10} style={{ height: '100%', width: '100%' }}>
                                 <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
                                 <LocationPicker onLocationSelect={(lat, lon) => setNewWh({...newWh, lat, lon})} />
                                 <Marker position={[newWh.lat, newWh.lon]} icon={warehouseIcon} />
                              </MapContainer>
                           </div>
                           <p className="text-[8px] font-mono text-blue-400 text-right uppercase tracking-widest pr-1">
                              COORDS: {newWh.lat.toFixed(4)}, {newWh.lon.toFixed(4)}
                           </p>
                        </div>

                        <div className="flex gap-4 items-center">
                           <div className="flex-1">
                              <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-1 mb-2">Storage Cap.</p>
                              <input 
                                type="number" 
                                value={newWh.capacity} 
                                onChange={e => setNewWh({...newWh, capacity: e.target.value})} 
                                className="w-full bg-slate-900 border border-slate-700 p-4 rounded-2xl text-xs outline-none focus:border-blue-500 transition-all" 
                                placeholder="Capacity" 
                              />
                           </div>
                           <button onClick={addWarehouse} className="flex-[1.5] h-[52px] mt-6 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-blue-600/20 transition-all">
                              Deploy Asset
                           </button>
                        </div>
                     </div>
                  </div>
               </div>
            </div>
          ) : (
            <>
              <MapContainer center={[19.0760, 72.8777]} zoom={12} style={{ height: '100%', width: '100%', background: '#0F172A' }}>
                <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
                <MapRefocuser center={mapCenter} />

                {warehouses.map(w => {
                  if (!w.location?.lat || !w.location?.lon) return null;
                  return (
                    <Marker key={w.id} position={[w.location.lat, w.location.lon]} icon={warehouseIcon}>
                      <Popup><div className="text-xs font-black uppercase text-slate-900">{w.name}</div></Popup>
                    </Marker>
                  );
                })}

                {deliveries.map(d => {
                  const isSelected = selectedDelivery?.id === d.id;
                  const point = d.route?.[d.current_index || 0];
                  const validRoute = d.route?.filter(p => p && p.lat !== undefined && p.lon !== undefined) || [];

                  if (!point || point.lat === undefined || point.lon === undefined) return null;

                  return (
                    <React.Fragment key={d.id}>
                      {validRoute.length > 1 && (
                        <Polyline
                          positions={validRoute.map(p => [p.lat, p.lon])}
                          color={isSelected ? '#3B82F6' : (d.risk_level === 'HIGH' ? '#EF4444' : '#64748B')}
                          weight={isSelected ? 6 : 2}
                          opacity={isSelected ? 1 : 0.3}
                        />
                      )}
                      <Marker position={[point.lat, point.lon]} icon={driverIcon} eventHandlers={{ click: () => setSelectedDelivery(d) }}>
                        <Popup><div className="text-xs font-black uppercase text-slate-900">DELIVERY #{d.delivery_id?.slice(-4)}</div></Popup>
                      </Marker>
                      {d.end_location?.lat !== undefined && d.end_location?.lon !== undefined && (
                        <Marker position={[d.end_location.lat, d.end_location.lon]} icon={customerIcon} />
                      )}
                    </React.Fragment>
                  );
                })}
              </MapContainer>

              {selectedDelivery && (
                <div className="absolute top-6 left-6 z-[1000] w-72 bg-[#1E293B]/90 backdrop-blur-md border border-blue-500/50 rounded-2xl p-5 shadow-2xl animate-fadeIn">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <p className="text-[8px] font-black text-blue-400 uppercase tracking-widest">Selected Delivery</p>
                      <h3 className="text-xl font-black text-white">#{selectedDelivery.delivery_id?.slice(-8)}</h3>
                    </div>
                    <button onClick={() => setSelectedDelivery(null)} className="text-slate-400 hover:text-white">✕</button>
                  </div>
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="bg-slate-800 p-2 rounded-xl">
                      <p className="text-[7px] text-slate-500 uppercase font-black">Driver</p>
                      <p className="text-[10px] font-bold text-white truncate">{drivers.find(dr => dr.id === selectedDelivery.driver_id)?.name || 'Processing'}</p>
                    </div>
                    <div className="bg-slate-800 p-2 rounded-xl">
                      <p className="text-[7px] text-slate-500 uppercase font-black">ETA</p>
                      <p className="text-[10px] font-bold text-orange-400">{selectedDelivery.eta_remaining || '--'} min</p>
                    </div>
                  </div>
                  <div className={`p-3 rounded-xl text-[10px] italic border ${selectedDelivery.risk_level === 'HIGH' ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-blue-500/10 border-blue-500/20 text-blue-400'}`}>
                    {selectedDelivery.risk_level === 'HIGH' ? 'High risk disruption detected' : 'Optimal route conditions'}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* 3. Disruption Controls */}
        <div className="col-span-3 flex flex-col gap-6">
          <div className="flex-1 bg-[#1E293B] border border-slate-700 rounded-3xl shadow-xl p-8 flex flex-col justify-center text-center">
            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-8">System Disruption Controls</h3>
            <div className="space-y-4">
              <button onClick={() => handleDisruption('traffic_spike')} className="w-full group bg-slate-900 hover:bg-orange-500/10 border border-slate-700 hover:border-orange-500/50 p-5 rounded-2xl flex items-center justify-between transition-all">
                <span className="text-[10px] font-black text-slate-400 group-hover:text-orange-400 uppercase tracking-widest">Traffic Spike</span>
                <MdWarning className="text-slate-700 group-hover:text-orange-500 transition-colors" />
              </button>
              <button onClick={() => handleDisruption('road_closure')} className="w-full group bg-slate-900 hover:bg-red-500/10 border border-slate-700 hover:border-red-500/50 p-5 rounded-2xl flex items-center justify-between transition-all">
                <span className="text-[10px] font-black text-slate-400 group-hover:text-red-400 uppercase tracking-widest">Road Closure</span>
                <MdWarning className="text-slate-700 group-hover:text-red-500 transition-colors" />
              </button>
              <button onClick={() => handleDisruption('weather_event')} className="w-full group bg-slate-900 hover:bg-blue-500/10 border border-slate-700 hover:border-blue-500/50 p-5 rounded-2xl flex items-center justify-between transition-all">
                <span className="text-[10px] font-black text-slate-400 group-hover:text-blue-400 uppercase tracking-widest">Weather Event</span>
                <MdWarning className="text-slate-700 group-hover:text-blue-500 transition-colors" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* --- Bottom Section --- */}
      <div className="h-64 grid grid-cols-12 gap-6 min-h-0">
        
        {/* Active Deliveries / Order History */}
        <div className="col-span-8 bg-[#1E293B] border border-slate-700 rounded-3xl shadow-xl flex flex-col overflow-hidden">
          <div className="px-8 py-4 border-b border-slate-700 flex justify-between items-center bg-slate-800/30">
            <div className="flex gap-4">
              <button 
                onClick={() => setActiveDeliveryTab('active')}
                className={`text-[10px] font-black uppercase tracking-widest transition-all ${activeDeliveryTab === 'active' ? 'text-blue-400 border-b-2 border-blue-400 pb-1' : 'text-slate-500 hover:text-slate-300'}`}
              >
                Live Fleet
              </button>
              <button 
                onClick={() => setActiveDeliveryTab('completed')}
                className={`text-[10px] font-black uppercase tracking-widest transition-all ${activeDeliveryTab === 'completed' ? 'text-blue-400 border-b-2 border-blue-400 pb-1' : 'text-slate-500 hover:text-slate-300'}`}
              >
                Archive
              </button>
            </div>
            <span className="text-[8px] font-black text-blue-400 bg-blue-500/10 px-2 py-1 rounded-full border border-blue-500/20">
              {deliveries.filter(d => activeDeliveryTab === 'active' ? d.status !== 'completed' : d.status === 'completed').length} units
            </span>
          </div>
          <div className="flex-1 overflow-x-auto p-4 custom-scrollbar">
            <table className="w-full text-left">
              <thead className="text-[8px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-700/50">
                <tr>
                  <th className="px-4 py-3">Delivery ID</th>
                  <th className="px-4 py-3">Driver</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">{activeDeliveryTab === 'active' ? 'Progress' : 'Performance'}</th>
                  <th className="px-4 py-3">{activeDeliveryTab === 'active' ? 'ETA' : 'Completed At'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                {deliveries
                  .filter(d => activeDeliveryTab === 'active' ? d.status !== 'completed' : d.status === 'completed')
                  .map(d => (
                  <tr key={d.id} onClick={() => setSelectedDelivery(d)} className={`cursor-pointer transition-colors ${selectedDelivery?.id === d.id ? 'bg-blue-500/5' : 'hover:bg-slate-700/20'}`}>
                    <td className="px-4 py-3 font-mono text-[10px] text-blue-400">#{d.delivery_id?.slice(-8)}</td>
                    <td className="px-4 py-3 text-[10px] font-bold text-white">
                      {drivers.find(dr => dr.id === d.driver_id)?.name || 'Driver Assigned'}
                      {d.rerouted && (
                        <span className="ml-2 px-1.5 py-0.5 bg-red-500/20 text-red-400 border border-red-500/30 rounded text-[7px] font-black uppercase tracking-tighter" title={d.reroute_reason}>
                          Rerouted
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={d.status} /></td>
                    <td className="px-4 py-3">
                      {activeDeliveryTab === 'active' ? (
                        <div className="flex items-center gap-3">
                          <div className="flex-1 h-1 bg-slate-700 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500" style={{ width: `${d.progress || 0}%` }}></div>
                          </div>
                          <span className="text-[9px] font-mono text-slate-400">{d.progress || 0}%</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                           <span className="text-[10px] font-black text-emerald-400">{d.performance_score || '98'}%</span>
                           <div className="h-1 w-12 bg-slate-700 rounded-full overflow-hidden">
                              <div className="h-full bg-emerald-500" style={{ width: `${d.performance_score || 98}%` }}></div>
                           </div>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[10px] font-black text-orange-400">
                      {activeDeliveryTab === 'active' ? (d.eta_remaining || '--') + 'm' : new Date(d.end_time || d.updated_at).toLocaleTimeString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Activity Feed */}
        <div className="col-span-4 bg-[#1E293B] border border-slate-700 rounded-3xl shadow-xl flex flex-col overflow-hidden">
          <div className="px-8 py-4">
            <div className="flex justify-between items-center mb-6">
               <h3 className="text-xl font-black text-white uppercase tracking-tighter">Managed Assets</h3>
               <button 
                  onClick={resetDrivers}
                  className="px-4 py-2 bg-red-600/10 hover:bg-red-600 text-red-500 hover:text-white border border-red-500/30 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all"
               >
                 Reset Fleet Status
               </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar">
            {activityFeed.map((log, i) => (
              <div key={i} className="flex gap-3">
                <div className={`mt-1 h-1.5 w-1.5 rounded-full shrink-0 ${log.priority === 'HIGH' ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]' : 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]'}`}></div>
                <div>
                  <p className="text-[10px] font-medium text-slate-300 leading-tight">{log.message}</p>
                  <p className="text-[8px] font-black text-slate-600 uppercase mt-1">{new Date(log.created_at?.seconds * 1000).toLocaleTimeString()}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
};

export default Dashboard;
