import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection,
  query,
  onSnapshot,
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
  MdMap,
  MdSecurity
} from 'react-icons/md';
import { useApp } from '../context/AppContext';
import toast from 'react-hot-toast';
import destPin from '../assets/destination_pin_v2.png';

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
  iconUrl: destPin,
  iconSize: [40, 40],
  iconAnchor: [20, 40],
  popupAnchor: [0, -40],
  shadowUrl: null
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
  const [selectedDeliveryId, setSelectedDeliveryId] = useState(null);
  const [mapCenter] = useState([19.0760, 72.8777]);
  const [showAssets, setShowAssets] = useState(false);
  const [newWh, setNewWh] = useState({ name: '', lat: 19.0760, lon: 72.8777, capacity: 1000 });
  const [approvingRequestIds, setApprovingRequestIds] = useState(new Set());
  const [lastDisruption, setLastDisruption] = useState(null);
  const [reroutingId, setReroutingId] = useState(null);

  const selectedDelivery = deliveries.find(d => d.id === selectedDeliveryId) || null;

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

    return () => { unsubOrders(); unsubSuppliers(); unsubDeliveries(); };
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

  const handleCancelOrder = async (orderId) => {
    if (!window.confirm("Cancel this order? Stock will be restored.")) return;
    const tid = toast.loading("Cancelling order...");
    try {
      await callApi(`/orders/${orderId}/cancel`, { method: 'POST' });
      toast.success("Order cancelled", { id: tid });
    } catch (e) {
      toast.error(e.message, { id: tid });
    }
  };

  const handleDisruption = async (type) => {
    try {
      const res = await callApi('/deliveries/disrupt', {
        method: 'POST',
        body: JSON.stringify({
          type,
          affected_route: 'route_1',
          severity: 'HIGH'
        })
      });
      setLastDisruption({
        type,
        affected_count: res.affected_count || 0,
        system_risk: res.system_risk_level || 'UNKNOWN',
        timestamp: Date.now()
      });
      if (res.affected_count > 0) {
        toast.error(`⚠️ ${res.affected_count} deliveries affected by ${type.replace('_', ' ')}`);
      } else {
        toast(`Disruption injected — no active deliveries affected`, { icon: '📡' });
      }
    } catch (e) {
      toast.error(e.message);
    }
  };

  const handleReroute = async (deliveryId) => {
    if (reroutingId) return;
    setReroutingId(deliveryId);
    const tid = toast.loading('Calculating new route...');
    try {
      const res = await callApi(`/deliveries/${deliveryId}/reroute`, {
        method: 'POST',
        body: JSON.stringify({})
      });
      if (res.decision === 'REROUTE') {
        toast.success(res.message, { id: tid });
      } else {
        toast(res.message, { id: tid, icon: 'ℹ️' });
      }
    } catch (e) {
      toast.error(e.message, { id: tid });
    } finally {
      setReroutingId(null);
    }
  };

  const handleApproveSupplierRequest = async (requestId) => {
    if (approvingRequestIds.has(requestId)) return;

    setApprovingRequestIds((prev) => {
      const next = new Set(prev);
      next.add(requestId);
      return next;
    });

    const tid = toast.loading('Approving stock request...');
    try {
      const res = await callApi(`/supplier/requests/${requestId}/approve`, { method: 'POST' });
      toast.success(res.message || 'Stock approved', { id: tid });
    } catch (e) {
      toast.error(e.message, { id: tid });
    } finally {
      setApprovingRequestIds((prev) => {
        const next = new Set(prev);
        next.delete(requestId);
        return next;
      });
    }
  };

  return (
    <div className="flex flex-col gap-6 h-full min-h-0 overflow-hidden">

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

      {/* Dashboard Grid */}
      <div className="flex-1 min-h-0 grid grid-cols-12 gap-6">

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
                    <div className="flex items-center gap-2 mt-1 mb-4">
                      <span className="text-[10px] font-black text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20 uppercase tracking-tighter">
                        {o.items?.map(i => `${i.quantity} units`).join(', ')}
                      </span>
                      <p className="text-[10px] text-slate-400 truncate">{o.items?.map(i => i.name).join(', ')}</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => handleAcceptOrder(o.id)} className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-2 rounded-xl text-[9px] font-black uppercase transition-all shadow-lg shadow-blue-900/20">Accept</button>
                      <button onClick={() => handleCancelOrder(o.id)} className="px-3 bg-slate-800 hover:bg-red-500/20 hover:text-red-400 text-slate-400 rounded-xl transition-all border border-slate-700"><MdCancel /></button>
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
                    <button
                      onClick={() => handleApproveSupplierRequest(s.id)}
                      disabled={approvingRequestIds.has(s.id)}
                      className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-400 text-white py-2 rounded-xl text-[9px] font-black uppercase transition-all"
                    >
                      {approvingRequestIds.has(s.id) ? 'Approving...' : 'Approve Stock'}
                    </button>
                  </div>
                ))
            )}
          </div>
        </div>

        {/* 2. Map / Asset Management */}
        <div className="col-span-6 bg-slate-900/50 border border-slate-700 rounded-[2.5rem] shadow-2xl overflow-hidden relative flex flex-col min-h-112.5">
          <div className="absolute top-6 left-6 z-1000 bg-slate-950/80 backdrop-blur-md px-4 py-2 rounded-xl border border-white/10 flex items-center gap-2">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(59,130,246,0.8)]"></div>
            <p className="text-[10px] font-black text-white uppercase tracking-widest">Tactical Asset Map</p>
          </div>
          <div className="flex-1 relative">
            {showAssets ? (
              <div className="absolute inset-0 overflow-y-auto custom-scrollbar p-8 bg-slate-900/20">
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
                  <div className="bg-slate-800/80 border border-slate-700 p-6 rounded-4xl">
                    <h3 className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-6">Initialize New Asset</h3>
                    <div className="space-y-6">
                      <input
                        value={newWh.name}
                        onChange={e => setNewWh({ ...newWh, name: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-700 p-4 rounded-2xl text-xs outline-none focus:border-blue-500 transition-all"
                        placeholder="Asset Name (e.g., Central Hub B)"
                      />

                      <div className="space-y-2">
                        <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-1">Pin Point Location</p>
                        <div className="h-48 rounded-2xl overflow-hidden border border-slate-700">
                          <MapContainer center={[newWh.lat, newWh.lon]} zoom={10} style={{ height: '100%', width: '100%' }}>
                            <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
                            <LocationPicker onLocationSelect={(lat, lon) => setNewWh({ ...newWh, lat, lon })} />
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
                            onChange={e => setNewWh({ ...newWh, capacity: e.target.value })}
                            className="w-full bg-slate-900 border border-slate-700 p-4 rounded-2xl text-xs outline-none focus:border-blue-500 transition-all"
                            placeholder="Capacity"
                          />
                        </div>
                        <button onClick={addWarehouse} className="flex-[1.5] h-13 mt-6 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-blue-600/20 transition-all">
                          Deploy Asset
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="absolute inset-0">
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
                    const isSelected = selectedDeliveryId === d.id;
                    const point = d.route?.[d.current_index || 0];
                    const validRoute = d.route?.filter(p => p && p.lat !== undefined && p.lon !== undefined) || [];

                    if (!point || point.lat === undefined || point.lon === undefined) return null;

                    return (
                      <React.Fragment key={d.id}>
                        {/* Old Route (Faded) if rerouted */}
                        {d.rerouted && d.old_route && d.old_route.length > 1 && (
                          <Polyline
                            positions={d.old_route.map(p => [p.lat, p.lon])}
                            color="#94A3B8"
                            weight={2}
                            opacity={0.2}
                            dashArray="5, 10"
                          />
                        )}

                        {validRoute.length > 1 && (
                          <Polyline
                            positions={validRoute.map(p => [p.lat, p.lon])}
                            color={isSelected ? '#F59E0B' : (d.rerouted ? '#F59E0B' : (d.risk_level === 'HIGH' ? '#EF4444' : '#3B82F6'))}
                            weight={isSelected ? 6 : (d.rerouted ? 5 : 3)}
                            opacity={isSelected ? 1 : (d.rerouted ? 0.9 : 0.6)}
                          />
                        )}
                        <Marker position={[point.lat, point.lon]} icon={driverIcon} eventHandlers={{ click: () => setSelectedDeliveryId(d.id) }}>
                          <Popup><div className="text-xs font-black uppercase text-slate-900">DELIVERY #{d.delivery_id?.slice(-4)}</div></Popup>
                        </Marker>
                        {d.end_location?.lat !== undefined && d.end_location?.lon !== undefined && (
                          <Marker 
                            position={[d.end_location.lat, d.end_location.lon]} 
                            icon={customerIcon}
                            zIndexOffset={1000}
                          >
                            <Popup><div className="text-xs font-black uppercase text-slate-900">Destination</div></Popup>
                          </Marker>
                        )}
                      </React.Fragment>
                    );
                  })}
                </MapContainer>

                {selectedDelivery && (
                  <div className="absolute top-6 left-6 z-1000 w-72 bg-[#1E293B]/90 backdrop-blur-md border border-orange-500/50 rounded-2xl p-5 shadow-2xl animate-fadeIn">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <p className="text-[8px] font-black text-orange-400 uppercase tracking-widest">Selected Delivery</p>
                        <h3 className="text-xl font-black text-white">#{selectedDelivery.delivery_id?.slice(-8)}</h3>
                      </div>
                      <button onClick={() => setSelectedDeliveryId(null)} className="text-slate-400 hover:text-white">✕</button>
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

                    {/* Route Status Label */}
                    <div className={`p-3 rounded-xl text-[10px] font-bold border flex items-center gap-2 mb-3 ${
                      selectedDelivery.rerouted
                        ? 'bg-orange-500/10 border-orange-500/20 text-orange-400'
                        : 'bg-blue-500/10 border-blue-500/20 text-blue-400'
                    }`}>
                      <span>{selectedDelivery.rerouted ? '🔀' : '✅'}</span>
                      <span>
                        {selectedDelivery.rerouted
                          ? `Rerouted: ${(selectedDelivery.reroute_reason || 'traffic congestion').replace('Dynamic Reroute: ', '').replace('Decision Reroute: ', '')}`
                          : 'Optimal route retained'
                        }
                      </span>
                    </div>
                    {selectedDelivery.rerouted && (
                      <div className="flex items-center gap-4 mb-3 px-1">
                        <div className="flex items-center gap-1.5">
                          <div className="w-6 h-[2px] bg-slate-500 opacity-40" style={{ backgroundImage: 'repeating-linear-gradient(90deg, #94A3B8 0, #94A3B8 3px, transparent 3px, transparent 6px)' }} />
                          <span className="text-[8px] text-slate-500 font-bold uppercase">Old</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="w-6 h-[3px] bg-blue-500 rounded-full" />
                          <span className="text-[8px] text-blue-400 font-bold uppercase">New</span>
                        </div>
                      </div>
                    )}
                    <div className={`p-3 rounded-xl text-[10px] italic border ${selectedDelivery.risk_level === 'HIGH' ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-blue-500/10 border-blue-500/20 text-blue-400'}`}>
                      {selectedDelivery.rerouted
                        ? `⚠️ ${selectedDelivery.reroute_reason || 'Rerouted due to disruption'}`
                        : selectedDelivery.risk_level === 'HIGH'
                          ? 'High risk disruption detected'
                          : 'Optimal route conditions'
                      }
                    </div>
                    {selectedDelivery.rerouted && (
                      <div className="mt-3 flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                        <p className="text-[8px] font-black text-emerald-400 uppercase tracking-widest">Rerouted — New Path Active</p>
                      </div>
                    )}
                    {/* Reroute Button — shown for HIGH risk, in-transit deliveries */}
                    {selectedDelivery.risk_level === 'HIGH' && 
                     ['dispatched', 'in_transit', 'nearing', 'active'].includes(selectedDelivery.status) && (
                      <button
                        onClick={() => handleReroute(selectedDelivery.delivery_id || selectedDelivery.id)}
                        disabled={reroutingId === (selectedDelivery.delivery_id || selectedDelivery.id)}
                        className="mt-4 w-full bg-orange-600 hover:bg-orange-500 disabled:bg-slate-700 disabled:text-slate-500 text-white py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all shadow-lg shadow-orange-900/20"
                      >
                        {reroutingId === (selectedDelivery.delivery_id || selectedDelivery.id) ? 'Calculating...' : '🔀 Reroute Delivery'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 3. Operational Awareness */}
        <div className="col-span-3 flex flex-col gap-6">
          {/* Disruption Alert Banner */}
          {lastDisruption && lastDisruption.affected_count > 0 && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-5 animate-pulse shadow-lg shadow-red-900/10">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-ping" />
                <p className="text-[10px] font-black text-red-400 uppercase tracking-widest">Disruption Active</p>
              </div>
              <p className="text-2xl font-black text-white mb-1">⚠️ {lastDisruption.affected_count} <span className="text-sm text-red-400">deliveries affected</span></p>
              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">
                {lastDisruption.type.replace('_', ' ')} • Risk Level: <span className={`${lastDisruption.system_risk === 'CRITICAL' ? 'text-red-400' : 'text-orange-400'}`}>{lastDisruption.system_risk}</span>
              </p>
              <button
                onClick={() => setLastDisruption(null)}
                className="mt-3 text-[8px] font-black text-slate-500 hover:text-slate-300 uppercase tracking-widest transition-colors"
              >
                Dismiss ✕
              </button>
            </div>
          )}

          <div className="flex-1 bg-[#1E293B] border border-slate-700 rounded-3xl shadow-xl p-8 flex flex-col items-center justify-center text-center">
             <MdSecurity size={48} className="text-slate-700 mb-4" />
             <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Security Protocol Active</h3>
             <p className="text-[10px] text-slate-600 font-medium leading-relaxed">
               All operational disruptions are now managed via the dedicated <span className="text-blue-500 font-bold">Disruption Hub</span>.
             </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
