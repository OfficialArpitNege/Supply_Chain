import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { db } from '../config/firebase';
import { collection, onSnapshot, query, orderBy, limit, where } from 'firebase/firestore';
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

// --- Components ---
const StatusBadge = ({ status }: { status: string }) => {
  const colors: any = {
    pending: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    accepted: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    assigned: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
    dispatched: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
    in_transit: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    delivered: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
    available: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  };
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border ${colors[status] || 'bg-gray-500/20 text-gray-400 border-gray-500/30'}`}>
      {status.replace('_', ' ')}
    </span>
  );
};

const ControlTower: React.FC = () => {
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [health, setHealth] = useState<any>({ status: 'OPTIMAL', score: 100, active_deliveries: 0 });
  const [selectedDelivery, setSelectedDelivery] = useState<any>(null);
  const { callApi } = useApp();

  // --- Real-time Sync ---
  useEffect(() => {
    const unsubDeliveries = onSnapshot(collection(db, 'deliveries'), (snap) => {
      setDeliveries(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const unsubOrders = onSnapshot(query(collection(db, 'orders'), orderBy('created_at', 'desc'), limit(50)), (snap) => {
      setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const unsubNotifs = onSnapshot(query(collection(db, 'notifications'), orderBy('created_at', 'desc'), limit(30)), (snap) => {
      setNotifications(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const unsubWarehouses = onSnapshot(collection(db, 'warehouses'), (snap) => {
      setWarehouses(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const unsubDrivers = onSnapshot(collection(db, 'drivers'), (snap) => {
      setDrivers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const fetchHealth = async () => {
      try {
        const data = await callApi('/demo/health');
        setHealth(data);
      } catch (e) {}
    };
    fetchHealth();
    const interval = setInterval(fetchHealth, 5000);

    return () => {
      unsubDeliveries(); unsubOrders(); unsubNotifs(); 
      unsubWarehouses(); unsubDrivers(); clearInterval(interval);
    };
  }, []);

  // --- Actions ---
  const triggerAction = async (endpoint: string, method = 'POST', body: any = null) => {
    try {
      const res = await callApi(endpoint, {
        method,
        body: body ? JSON.stringify(body) : null
      });
      toast.success(res.message || "Command executed");
      return res;
    } catch (e: any) {
      toast.error(e.message);
      throw e;
    }
  };

  const injectDisruption = async (type: string) => {
    try {
      const res = await triggerAction('/admin/disruptions/inject', 'POST', {
        type, route_id: 'route_1', severity: 'HIGH', duration_minutes: 15
      });
      
      // Feedback Overlay
      toast.custom((t) => (
        <div className={`${t.visible ? 'animate-enter' : 'animate-leave'} max-w-md w-full bg-[#0a0a0f]/90 backdrop-blur-2xl border-2 border-red-500 shadow-[0_0_40px_rgba(239,68,68,0.3)] rounded-3xl p-6 pointer-events-auto`}>
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-red-500/20 flex items-center justify-center text-red-500 text-2xl font-black">!</div>
            <div>
              <p className="text-[10px] font-black text-red-500 uppercase tracking-widest">Disruption Detected</p>
              <h3 className="text-xl font-black text-white">{type.replace('_', ' ').toUpperCase()}</h3>
            </div>
          </div>
          <p className="text-xs text-gray-400 mb-4 leading-relaxed font-medium">
            System has identified {res.deliveries_affected} affected deliveries. Automatic rerouting protocols are now engaged to minimize delays.
          </p>
          <div className="flex gap-2">
            <div className="flex-1 h-1 bg-red-500/20 rounded-full overflow-hidden">
              <div className="h-full bg-red-500 animate-pulse w-full"></div>
            </div>
          </div>
        </div>
      ), { duration: 6000 });
    } catch (e) {}
  };

  return (
    <div className="min-h-screen bg-[#06060a] text-gray-100 font-sans selection:bg-blue-500/30">
      {/* 🌌 Atmospheric Backdrop */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden opacity-20">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600 rounded-full blur-[150px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-900 rounded-full blur-[150px]"></div>
      </div>

      <div className="relative z-10 p-6 flex flex-col gap-6 max-w-[1800px] mx-auto h-screen">
        
        {/* 🔝 Global HUD Bar */}
        <header className="flex justify-between items-center bg-[#0d0d14]/80 backdrop-blur-md border border-white/5 p-6 rounded-[2rem] shadow-2xl">
          <div className="flex items-center gap-6">
            <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center shadow-[0_0_20px_rgba(37,99,235,0.4)]">
              <span className="text-2xl font-black text-white">CT</span>
            </div>
            <div>
              <h1 className="text-3xl font-black tracking-tighter uppercase leading-none mb-1">Control <span className="text-blue-500">Tower</span></h1>
              <p className="text-gray-500 font-bold text-[9px] uppercase tracking-[0.3em]">Advanced Logistics Intelligence Center</p>
            </div>
          </div>

          <div className="flex gap-10 items-center">
            {[
              { label: 'Active Orders', value: orders.filter(o => o.status === 'pending').length, color: 'text-orange-400' },
              { label: 'Live Deliveries', value: deliveries.filter(d => d.status !== 'delivered').length, color: 'text-blue-400' },
              { label: 'Fleet Ready', value: drivers.filter(d => d.status === 'available').length, color: 'text-emerald-400' },
              { label: 'System Health', value: `${health.score}%`, color: health.status === 'RED' ? 'text-red-500' : 'text-blue-400' },
              { label: 'Active Risk', value: deliveries.filter(d => d.risk_level === 'HIGH').length, color: 'text-red-500', isAlert: true },
            ].map((m, i) => (
              <div key={i} className={`text-center ${m.isAlert && m.value > 0 ? 'animate-pulse' : ''}`}>
                <p className="text-gray-500 text-[9px] font-black uppercase tracking-widest mb-1">{m.label}</p>
                <h2 className={`text-2xl font-black ${m.color}`}>{m.value}</h2>
              </div>
            ))}
          </div>
        </header>

        {/* 🌍 Core Orchestration Area */}
        <main className="flex-1 grid grid-cols-12 gap-6 min-h-0">
          
          {/* 🗺️ Tactical Map Center */}
          <section className="col-span-9 bg-[#0d0d14]/80 backdrop-blur-md border border-white/5 rounded-[2.5rem] overflow-hidden relative shadow-2xl group">
            <MapContainer center={[19.0760, 72.8777]} zoom={12} style={{ height: '100%', width: '100%', background: '#06060a' }}>
              <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
              
              {warehouses.map(w => {
                if (!w.location?.lat || !w.location?.lon) return null;
                return (
                  <Marker key={w.id} position={[w.location.lat, w.location.lon]} icon={warehouseIcon}>
                    <Popup><div className="text-black font-black uppercase text-xs p-1">{w.name}</div></Popup>
                  </Marker>
                );
              })}

              {deliveries.filter(d => d.status !== 'delivered' && d.route).map(d => {
                const isSelected = selectedDelivery?.id === d.id;
                const point = d.route[d.current_index || 0];
                const validRoute = d.route.filter((p: any) => p && p.lat !== undefined && p.lon !== undefined);

                if (!point || point.lat === undefined || point.lon === undefined) return null;

                return (
                  <React.Fragment key={d.id}>
                    {validRoute.length > 1 && (
                      <Polyline 
                        positions={validRoute.map((p: any) => [p.lat, p.lon])} 
                        color={isSelected ? '#3b82f6' : (d.risk_level === 'HIGH' ? '#ef4444' : '#1e3a8a')} 
                        weight={isSelected ? 6 : 3} 
                        opacity={isSelected ? 1 : 0.2}
                        dashArray={isSelected ? '' : '10, 10'}
                      />
                    )}
                    <Marker position={[point.lat, point.lon]} icon={driverIcon} eventHandlers={{ click: () => setSelectedDelivery(d) }}>
                      <Popup><div className="text-black font-bold">DEL-{d.delivery_id?.slice(-4)}</div></Popup>
                    </Marker>
                  </React.Fragment>
                );
              })}
            </MapContainer>

            {/* 🎯 Focus Mode Overlay */}
            {selectedDelivery && (
              <div className="absolute top-8 left-8 z-[1000] w-96 animate-in fade-in slide-in-from-left-8 duration-500">
                <div className="bg-[#0a0a0f]/90 backdrop-blur-2xl border border-blue-500/30 rounded-[2rem] p-8 shadow-[0_0_50px_rgba(59,130,246,0.2)]">
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="w-2 h-2 rounded-full bg-blue-500 animate-ping"></span>
                        <p className="text-blue-400 text-[10px] font-black uppercase tracking-widest">Selected Delivery Focus</p>
                      </div>
                      <h3 className="text-3xl font-black text-white">#{selectedDelivery.delivery_id?.slice(-8)}</h3>
                    </div>
                    <button onClick={() => setSelectedDelivery(null)} className="text-gray-600 hover:text-white text-xl">✕</button>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-8">
                    {[
                      { l: 'Driver', v: drivers.find(dr => dr.id === selectedDelivery.driver_id)?.name || 'Deploying' },
                      { l: 'ETA', v: `${selectedDelivery.eta_remaining || '--'}m`, c: 'text-blue-400' },
                      { l: 'Status', v: selectedDelivery.status, isBadge: true },
                      { l: 'Risk', v: selectedDelivery.risk_level, c: selectedDelivery.risk_level === 'HIGH' ? 'text-red-500' : 'text-emerald-500' }
                    ].map((it, i) => (
                      <div key={i} className="bg-white/5 p-4 rounded-2xl border border-white/5">
                        <p className="text-[8px] text-gray-500 font-black uppercase mb-1">{it.l}</p>
                        {it.isBadge ? <StatusBadge status={it.v} /> : <p className={`text-xs font-black truncate ${it.c || 'text-white'}`}>{it.v}</p>}
                      </div>
                    ))}
                  </div>

                  <div className="bg-blue-600/10 border border-blue-500/20 p-5 rounded-2xl mb-8">
                    <p className="text-blue-400 text-[9px] font-black uppercase tracking-widest mb-3 italic">AI Context Engine</p>
                    <p className="text-xs text-gray-400 font-medium leading-relaxed italic">"{selectedDelivery.explanation}"</p>
                  </div>

                  <button onClick={() => triggerAction('/admin/override', 'POST', { delivery_id: selectedDelivery.id, action: 'force_reroute', reason: 'Strategic Override' })} className="w-full bg-blue-600 hover:bg-blue-500 text-white py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg shadow-blue-600/30 active:scale-95">
                    Manual Intelligence Override
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* ⚡ Command Actions Side Panel */}
          <aside className="col-span-3 flex flex-col gap-6">
            <div className="flex-1 bg-[#0d0d14]/80 backdrop-blur-md border border-white/5 rounded-[2.5rem] p-8 flex flex-col justify-center shadow-2xl">
              <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-8 text-center font-bold">Execution Protocols</h3>
              <div className="space-y-4">
                <button onClick={() => triggerAction('/orders/batch-accept')} className="w-full group relative overflow-hidden bg-white text-black py-5 rounded-[1.5rem] font-black text-xs uppercase tracking-widest transition-all active:scale-95">
                  <div className="absolute inset-0 bg-blue-500 translate-x-[-100%] group-hover:translate-x-0 transition-transform duration-500 opacity-10"></div>
                  Accept Orders
                </button>
                <button onClick={() => triggerAction('/orders/batch-dispatch')} className="w-full border border-white/10 hover:border-blue-500/50 hover:bg-blue-500/5 py-5 rounded-[1.5rem] font-black text-xs uppercase tracking-widest text-gray-400 hover:text-blue-400 transition-all">
                  Start Smart Dispatch
                </button>
                <button onClick={() => triggerAction('/admin/evaluate-system')} className="w-full bg-blue-600 hover:bg-blue-500 text-white py-5 rounded-[1.5rem] font-black text-xs uppercase tracking-widest shadow-[0_0_30px_rgba(37,99,235,0.3)] transition-all active:scale-95">
                  Run System Evaluation
                </button>
              </div>
            </div>

            <div className="flex-1 bg-[#1a0a0a]/40 backdrop-blur-md border border-red-500/10 rounded-[2.5rem] p-8 flex flex-col justify-center shadow-2xl">
              <h3 className="text-[10px] font-black text-red-500/50 uppercase tracking-widest mb-8 flex items-center gap-2 justify-center font-bold">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span> Disruption Injected
              </h3>
              <div className="space-y-4">
                <button onClick={() => injectDisruption('traffic_spike')} className="w-full bg-red-900/10 border border-red-500/20 text-red-500 hover:bg-red-500 hover:text-white py-5 rounded-[1.5rem] font-black text-xs uppercase tracking-widest transition-all">
                  Traffic Spike
                </button>
                <button onClick={() => injectDisruption('road_block')} className="w-full bg-orange-900/10 border border-orange-500/20 text-orange-500 hover:bg-orange-500 hover:text-white py-5 rounded-[1.5rem] font-black text-xs uppercase tracking-widest transition-all">
                  Road Closure
                </button>
                <button onClick={() => injectDisruption('weather')} className="w-full bg-slate-800/50 border border-white/5 text-gray-500 hover:bg-white hover:text-black py-5 rounded-[1.5rem] font-black text-xs uppercase tracking-widest transition-all">
                  Weather Event
                </button>
              </div>
            </div>
          </aside>
        </main>

        {/* 📊 High-Density Operations Center */}
        <footer className="h-80 grid grid-cols-12 gap-6">
          
          {/* Orders Queue */}
          <div className="col-span-4 bg-[#0d0d14]/80 backdrop-blur-md border border-white/5 rounded-[2.5rem] flex flex-col overflow-hidden shadow-2xl">
            <div className="px-8 py-5 border-b border-white/5 bg-white/2 flex justify-between items-center">
              <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-widest font-bold">Orders Queue</h4>
              <span className="bg-orange-500/10 text-orange-400 border border-orange-500/20 px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest">
                {orders.filter(o => o.status === 'pending').length} Priority Items
              </span>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
              {orders.map(o => (
                <div key={o.id} className="bg-white/2 border border-white/5 p-4 rounded-2xl flex items-center justify-between group hover:bg-white/5 transition-all">
                  <div>
                    <p className="text-[10px] font-mono text-blue-400 mb-1">#{o.order_id?.slice(-8)}</p>
                    <p className="text-sm font-black text-white">{o.customer_name}</p>
                  </div>
                  <div className="flex gap-4 items-center">
                    {o.status === 'pending' ? (
                      <div className="flex gap-2">
                        <button onClick={() => triggerAction(`/orders/${o.id}/accept`)} className="text-emerald-500 text-[10px] font-black uppercase tracking-widest hover:underline">Accept</button>
                        <button onClick={() => triggerAction(`/orders/${o.id}/reject`)} className="text-red-500 text-[10px] font-black uppercase tracking-widest hover:underline">Deny</button>
                      </div>
                    ) : (
                      <StatusBadge status={o.status} />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Active Deliveries */}
          <div className="col-span-4 bg-[#0d0d14]/80 backdrop-blur-md border border-white/5 rounded-[2.5rem] flex flex-col overflow-hidden shadow-2xl">
            <div className="px-8 py-5 border-b border-white/5 bg-white/2 flex justify-between items-center">
              <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-widest font-bold">Live Fleet Status</h4>
              <span className="bg-blue-500/10 text-blue-400 border border-blue-500/20 px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest">
                {deliveries.filter(d => d.status !== 'delivered').length} Units Active
              </span>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
              {deliveries.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full opacity-30">
                  <p className="text-[10px] font-black uppercase tracking-[0.3em]">Fleet Idle</p>
                </div>
              ) : (
                deliveries.map(d => (
                  <div key={d.id} onClick={() => setSelectedDelivery(d)} className={`bg-white/2 border p-4 rounded-2xl flex items-center justify-between cursor-pointer transition-all ${selectedDelivery?.id === d.id ? 'border-blue-500/50 bg-blue-500/5' : 'border-white/5 hover:bg-white/5'}`}>
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <p className="text-[10px] font-mono text-gray-500">#{d.delivery_id?.slice(-6)}</p>
                        <StatusBadge status={d.status} />
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500 transition-all duration-1000 shadow-[0_0_10px_rgba(59,130,246,0.5)]" style={{ width: `${d.progress}%` }}></div>
                        </div>
                        <span className="text-[10px] font-black text-orange-400 min-w-[2.5rem] text-right">{d.eta_remaining || '--'}m</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Neural Activity Feed */}
          <div className="col-span-4 bg-[#0d0d14]/80 backdrop-blur-md border border-white/5 rounded-[2.5rem] flex flex-col overflow-hidden shadow-2xl">
            <div className="px-8 py-5 border-b border-white/5 bg-white/2 flex justify-between items-center">
              <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-widest font-bold">Intelligence Feed</h4>
              <div className="flex gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse delay-75"></div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
              {notifications.map((n, i) => (
                <div key={i} className={`relative pl-6 before:absolute before:left-0 before:top-2 before:w-1.5 before:h-1.5 before:rounded-full ${n.priority === 'HIGH' || n.priority === 'CRITICAL' ? 'before:bg-red-500' : 'before:bg-blue-500'}`}>
                  <p className="text-[11px] font-bold text-gray-300 leading-snug mb-1">{n.message}</p>
                  <p className="text-[9px] font-black text-gray-600 uppercase tracking-widest">{new Date(n.created_at?.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                </div>
              ))}
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default ControlTower;
