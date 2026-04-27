import React, { useState, useEffect } from 'react';
import { db } from '../config/firebase';
import { collection, query, where, onSnapshot, doc, updateDoc, getDocs, setDoc } from 'firebase/firestore';
import { useApp } from '../context/AppContext';
import toast from 'react-hot-toast';
import { MdLocalShipping, MdMap, MdPlayArrow, MdFastForward, MdCheckCircle } from 'react-icons/md';
import { MapContainer, TileLayer, Marker, Polyline, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
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

const destinationIcon = new L.Icon({
  iconUrl: destPin,
  iconSize: [40, 40],
  iconAnchor: [20, 40],
  popupAnchor: [0, -40],
  shadowUrl: null
});

const DriverDashboard: React.FC = () => {
  const { currentUser, callApi } = useApp();
  const [driver, setDriver] = useState<any>(null);
  const [activeDelivery, setActiveDelivery] = useState<any>(null);
  const [assignedOrder, setAssignedOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'active' | 'history'>('active');
  const [completedDeliveries, setCompletedDeliveries] = useState<any[]>([]);
  const [selectedHistoryOrder, setSelectedHistoryOrder] = useState<any>(null);

  useEffect(() => {
    if (!currentUser) return;

    let unsub: (() => void) | undefined;

    const fetchDriver = async () => {
      const q = query(collection(db, 'drivers'), where('email', '==', currentUser.email));
      const snap = await getDocs(q);

      let driverId = '';

      if (!snap.empty) {
        driverId = snap.docs[0].id;
      } else {
        const userSnap = await getDocs(query(collection(db, 'users'), where('email', '==', currentUser.email)));
        if (!userSnap.empty) {
          const udata = userSnap.docs[0].data();
          if (udata.role === 'driver') {
            driverId = userSnap.docs[0].id;
            const driverRef = doc(db, 'drivers', driverId);
            await setDoc(driverRef, {
              name: udata.name,
              email: udata.email,
              status: 'available',
              vehicle_type: udata.vehicle_type || 'van',
              license_plate: udata.license_plate || 'TBD'
            }, { merge: true });
          }
        }
      }

      if (driverId) {
        unsub = onSnapshot(doc(db, 'drivers', driverId), (docSnap) => {
          if (docSnap.exists()) {
            setDriver({ id: driverId, ...docSnap.data() });
          }
        });
      }
      setLoading(false);
    };

    fetchDriver();
    return () => {
      if (unsub) unsub();
    };
  }, [currentUser]);

  // Watch for Active Delivery
  useEffect(() => {
    if (!driver) return;
    
    if (!driver.active_delivery_id) {
      setActiveDelivery(null);
      return;
    }
    
    const unsubDel = onSnapshot(doc(db, 'deliveries', driver.active_delivery_id), (snap) => {
      if (snap.exists()) {
        const ddata = snap.data();
        setActiveDelivery({ id: snap.id, ...ddata });
      } else {
        setActiveDelivery(null);
      }
    });
    return () => unsubDel();
  }, [driver?.active_delivery_id, driver?.id]);

  // Watch for Assigned Order (Pre-Dispatch)
  useEffect(() => {
    if (!driver) return;
    
    const hasActiveDelivery = !!driver.active_delivery_id;
    const hasAssignedOrder = !!driver.active_order_id;

    if (!hasAssignedOrder || hasActiveDelivery) {
      setAssignedOrder(null);
      return;
    }

    const unsubOrder = onSnapshot(doc(db, 'orders', driver.active_order_id), (snap) => {
      if (snap.exists()) {
        const odata = snap.data();
        setAssignedOrder({ id: snap.id, ...odata });
      } else {
        setAssignedOrder(null);
      }
    });
    return () => unsubOrder();
  }, [driver?.active_order_id, driver?.active_delivery_id, driver?.id]);

  // Watch for Driver History
  useEffect(() => {
    if (!driver?.id) return;

    const q = query(
      collection(db, 'deliveries'), 
      where('driver_id', '==', driver.id),
      where('status', '==', 'delivered')
    );

    const unsub = onSnapshot(q, (snap) => {
      setCompletedDeliveries(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => unsub();
  }, [driver?.id]);

  const toggleAvailability = async () => {
    if (!driver?.id) return;
    const newStatus = driver.status === 'available' ? 'offline' : 'available';
    await updateDoc(doc(db, 'drivers', driver.id), { status: newStatus });
    toast.success(`Status updated to ${newStatus}`);
  };

  const startDelivery = async () => {
    if (!driver?.active_delivery_id) return;
    try {
      await callApi(`/deliveries/${driver.active_delivery_id}/move?step_size=0`, {
        method: 'POST'
      });
      toast.success("Delivery Started!");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const moveForward = async () => {
    if (!driver?.active_delivery_id) return;
    try {
      await callApi(`/deliveries/${driver.active_delivery_id}/move?step_percent=25`, {
        method: 'POST'
      });
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  if (loading) return (
    <div className="h-screen bg-background flex flex-col items-center justify-center gap-6">
      <div className="relative w-24 h-24">
        <div className="absolute inset-0 border-8 border-blue-600/20 rounded-full"></div>
        <div className="absolute inset-0 border-8 border-blue-600 rounded-full border-t-transparent animate-spin"></div>
      </div>
      <p className="text-[10px] font-black text-blue-500 uppercase tracking-[0.3em] animate-pulse">Initializing Neural Link...</p>
    </div>
  );

  const currentPoint = activeDelivery?.route ? activeDelivery.route[activeDelivery.current_index || 0] : null;

  const stats = {
    completed: completedDeliveries.length,
    total: completedDeliveries.length + (activeDelivery ? 1 : 0) + (assignedOrder ? 1 : 0),
    successRate: completedDeliveries.length > 0 
      ? 100 // Simplified for now, since we only fetch 'delivered'
      : 100
  };

  return (
    <div className="p-12 max-w-7xl mx-auto space-y-12 pb-24">
      {/* Dynamic Header */}
      <div className="flex justify-between items-end">
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-2xl shadow-blue-600/30">
              <MdLocalShipping size={32} />
            </div>
            <div>
              <p className="text-[10px] font-black text-blue-500 uppercase tracking-[0.3em]">Field Protocol v4.2</p>
              <h1 className="text-4xl font-black text-white tracking-tighter uppercase">{view === 'active' ? 'Active Duty' : 'Service Record'}</h1>
            </div>
          </div>
          
          <div className="flex gap-2">
             <button 
               onClick={() => setView('active')}
               className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${view === 'active' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'bg-slate-800 text-slate-500 hover:bg-slate-700'}`}
             >
               Active Mission
             </button>
             <button 
               onClick={() => setView('history')}
               className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${view === 'history' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'bg-slate-800 text-slate-500 hover:bg-slate-700'}`}
             >
               History
             </button>
          </div>
        </div>

        <div className="flex gap-4">
          <div className="text-right px-6 border-r border-slate-800">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Success Rate</p>
            <p className="text-3xl font-black text-emerald-400 font-mono">{stats.successRate}%</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Status</p>
            <button 
              onClick={toggleAvailability}
              className={`group flex items-center gap-3 px-6 py-3 rounded-2xl border transition-all ${driver?.status === 'available' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500' : 'bg-slate-800/50 border-slate-700 text-slate-500'}`}
            >
              <span className={`w-2 h-2 rounded-full ${driver?.status === 'available' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-600'}`}></span>
              <span className="text-xs font-black uppercase tracking-widest">{driver?.status || 'Offline'}</span>
            </button>
          </div>
        </div>
      </div>

      {view === 'active' ? (
        activeDelivery ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-6">
              {/* Active Task Card */}
              <div className="bg-blue-600 rounded-[3rem] p-10 shadow-2xl shadow-blue-500/20 relative overflow-hidden group">
                <div className="relative z-10">
                  <p className="text-blue-200 text-xs font-black uppercase tracking-[0.2em] mb-2 opacity-80">Active Task</p>
                  <h2 className="text-5xl font-black text-white tracking-tighter mb-8">#{activeDelivery.delivery_id?.slice(-8)}</h2>
                  
                  <div className="grid grid-cols-2 gap-6 mb-10">
                    <div className="bg-white/10 backdrop-blur-md rounded-3xl p-5 border border-white/10 relative overflow-hidden">
                      <p className="text-blue-100 text-[10px] font-black uppercase mb-1 opacity-60">Status</p>
                      <p className="text-xl font-black text-white uppercase truncate">
                        {activeDelivery.rerouted ? 'Rerouted' : activeDelivery.status?.replace('_', ' ')}
                      </p>
                      {activeDelivery.rerouted && (
                         <div className="absolute top-0 right-0 bg-red-500 text-white text-[7px] font-black px-2 py-1 uppercase rounded-bl-lg animate-pulse">
                           New Route
                         </div>
                      )}
                    </div>
                    <div className="bg-white/10 backdrop-blur-md rounded-3xl p-5 border border-white/10">
                      <p className="text-blue-100 text-[10px] font-black uppercase mb-1 opacity-60">ETA</p>
                      <p className="text-xl font-black text-white">{activeDelivery.eta_remaining || '--'} MIN</p>
                    </div>
                  </div>

                  {/* Reroute Alert */}
                  {activeDelivery.rerouted && (
                    <div className="bg-white/20 border border-white/30 p-4 rounded-2xl mb-8 animate-in slide-in-from-top duration-500">
                      <p className="text-[10px] font-black text-white uppercase tracking-widest mb-1 flex items-center gap-2">
                         <span className="w-2 h-2 bg-red-400 rounded-full animate-ping"></span>
                         Logistics Disruption Detected
                      </p>
                      <p className="text-[9px] text-blue-100 font-medium leading-relaxed italic opacity-90">
                        {activeDelivery.reroute_reason || 'Route updated automatically to avoid roadblocks.'}
                      </p>
                    </div>
                  )}

                  <div className="flex gap-4">
                    <button 
                      onClick={startDelivery}
                      disabled={activeDelivery.status !== 'dispatched'}
                      className={`flex-1 flex items-center justify-center gap-3 py-6 rounded-4xl font-black text-xs uppercase tracking-widest transition-all ${activeDelivery.status === 'dispatched' ? 'bg-white text-blue-600 shadow-2xl hover:scale-[1.02]' : 'bg-white/20 text-white/40 cursor-not-allowed'}`}
                    >
                      <MdPlayArrow size={24} /> Start
                    </button>
                    
                    {activeDelivery.status !== 'dispatched' && currentPoint && (
                      <button 
                        onClick={() => window.open(`https://www.google.com/maps/dir/${currentPoint.lat},${currentPoint.lon}/${activeDelivery.end_location?.lat},${activeDelivery.end_location?.lon}`, '_blank')}
                        className="flex-1 flex items-center justify-center gap-3 py-6 rounded-4xl font-black text-xs uppercase tracking-widest bg-emerald-500 text-white shadow-2xl hover:scale-[1.02] transition-all border border-emerald-400/30"
                      >
                        <MdMap size={24} /> Navigate
                      </button>
                    )}
                  </div>
                </div>
                <MdLocalShipping size={200} className="absolute -bottom-10 -right-10 text-white/5 -rotate-12 group-hover:rotate-0 transition-transform duration-700" />
              </div>

              {/* Movement Control */}
              <div className="bg-slate-800/50 border border-slate-700 rounded-[3rem] p-10 flex flex-col items-center gap-8 shadow-2xl">
                 <div className="w-full flex justify-between items-center px-4">
                    <div className="text-center">
                      <p className="text-[10px] font-black text-slate-500 uppercase mb-2">Distance</p>
                      <p className="text-2xl font-black text-white">{activeDelivery.distance_remaining || '--'} <span className="text-xs text-slate-500">KM</span></p>
                    </div>
                    <div className="w-24 h-24 relative flex items-center justify-center">
                      <svg className="w-full h-full -rotate-90">
                        <circle cx="48" cy="48" r="40" stroke="#334155" strokeWidth="8" fill="transparent" />
                        <circle cx="48" cy="48" r="40" stroke="#3B82F6" strokeWidth="8" fill="transparent" strokeDasharray={251} strokeDashoffset={251 - (251 * (activeDelivery.progress || 0)) / 100} className="transition-all duration-1000" />
                      </svg>
                      <span className="absolute text-sm font-black text-white">{Math.round(activeDelivery.progress || 0)}%</span>
                    </div>
                    <div className="text-center">
                       <p className="text-[10px] font-black text-slate-500 uppercase mb-2">Target</p>
                       <p className="text-2xl font-black text-emerald-400">0.0 <span className="text-xs text-slate-500">KM</span></p>
                    </div>
                 </div>

                 <button 
                   onClick={moveForward}
                   disabled={activeDelivery.status === 'delivered'}
                   className="w-full group bg-slate-900 hover:bg-blue-600 text-white py-10 rounded-[2.5rem] border border-slate-700 hover:border-blue-400 transition-all flex flex-col items-center gap-3 active:scale-95 disabled:opacity-30 disabled:hover:bg-slate-900"
                 >
                   <div className="flex items-center gap-4">
                      <MdFastForward size={32} className="group-hover:translate-x-2 transition-transform" />
                      <span className="text-xl font-black uppercase tracking-widest italic">Simulate Forward</span>
                   </div>
                   <p className="text-[10px] text-slate-500 uppercase font-bold group-hover:text-blue-200">Advance to next sector waypoint</p>
                 </button>
              </div>
            </div>

            {/* Map Column */}
            <div className="bg-slate-800/50 border border-slate-700 rounded-[3rem] overflow-hidden relative min-h-[500px] shadow-2xl">
              {currentPoint ? (
              <>
                <MapContainer center={[currentPoint.lat, currentPoint.lon]} zoom={14} style={{ height: '100%', width: '100%', background: '#0f172a' }}>
                  <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
                  
                  {/* Traversed/Historical Journey (Warehouse to Driver) */}
                  {activeDelivery.rerouted && activeDelivery.old_route && activeDelivery.old_route.length > 1 && (
                    <Polyline 
                      positions={activeDelivery.old_route.map((p: any) => [p.lat, p.lon])} 
                      color="#F59E0B" 
                      weight={3} 
                      opacity={0.3}
                    />
                  )}

                  {/* Main/Active Route (Driver to Destination) */}
                  {activeDelivery.route && (
                    <Polyline 
                      positions={activeDelivery.route.map((p: any) => [p.lat, p.lon])} 
                      color={activeDelivery.rerouted ? '#F59E0B' : '#3b82f6'}
                      weight={activeDelivery.rerouted ? 6 : 5}
                      opacity={0.8}
                    />
                  )}

                  {/* Driver Marker */}
                  <Marker position={[currentPoint.lat, currentPoint.lon]} icon={driverIcon}>
                    <Popup><div className="text-black font-black uppercase text-xs p-1">Current Location</div></Popup>
                  </Marker>

                  {/* Start Marker */}
                  {activeDelivery.start_location && (
                    <Marker
                      position={[activeDelivery.start_location.lat, activeDelivery.start_location.lon]}
                      icon={warehouseIcon}
                    >
                      <Popup><div className="text-black font-black uppercase text-xs p-1">Start</div></Popup>
                    </Marker>
                  )}

                  {/* Destination Marker */}
                  {activeDelivery.end_location && (
                    <Marker 
                      position={[activeDelivery.end_location.lat, activeDelivery.end_location.lon]} 
                      icon={destinationIcon}
                      zIndexOffset={1000}
                    >
                      <Popup><div className="text-black font-black uppercase text-xs p-1">Destination</div></Popup>
                    </Marker>
                  )}
                </MapContainer>

                {/* Route Status Label */}
                <div className={`absolute bottom-6 left-6 right-6 z-1000 p-3 rounded-2xl backdrop-blur-md border shadow-xl flex items-center gap-2 ${
                  activeDelivery.rerouted
                    ? 'bg-orange-500/10 border-orange-500/20'
                    : 'bg-slate-900/80 border-slate-700'
                }`}>
                  <span className="text-sm">{activeDelivery.rerouted ? '🔀' : '✅'}</span>
                  <p className={`text-[9px] font-black uppercase tracking-wider ${
                    activeDelivery.rerouted ? 'text-orange-400' : 'text-blue-400'
                  }`}>
                    {activeDelivery.rerouted
                      ? `Rerouted: ${(activeDelivery.reroute_reason || 'traffic congestion').replace('Dynamic Reroute: ', '').replace('Decision Reroute: ', '')}`
                      : 'Optimal route retained'
                    }
                  </p>
                  {activeDelivery.rerouted && (
                    <div className="ml-auto flex items-center gap-3">
                      <div className="flex items-center gap-1">
                        <div className="w-4 h-[2px] bg-slate-500 opacity-40" style={{ backgroundImage: 'repeating-linear-gradient(90deg, #94A3B8 0, #94A3B8 2px, transparent 2px, transparent 5px)' }} />
                        <span className="text-[7px] text-slate-500 font-bold">OLD</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-4 h-[3px] bg-blue-500 rounded-full" />
                        <span className="text-[7px] text-blue-400 font-bold">NEW</span>
                      </div>
                    </div>
                  )}
                </div>
              </>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-slate-600">
                  <MdMap size={48} className="mb-4 opacity-20" />
                  <p className="text-xs font-black uppercase tracking-widest italic">Acquiring Satellite Link...</p>
                </div>
              )}
            </div>
          </div>
        ) : assignedOrder ? (
          <div className="space-y-6 animate-fadeIn">
            {/* Assigned Order Card */}
            <div className="bg-indigo-600 rounded-[3rem] p-10 shadow-2xl shadow-indigo-500/20 relative overflow-hidden group">
              <div className="relative z-10">
                <p className="text-indigo-200 text-xs font-black uppercase tracking-[0.2em] mb-2 opacity-80">Assigned Order</p>
                <h2 className="text-5xl font-black text-white tracking-tighter mb-8">#{assignedOrder.order_id?.slice(-8)}</h2>
                
                <div className="space-y-4 mb-10">
                  <div className="bg-white/10 backdrop-blur-md rounded-3xl p-6 border border-white/10">
                    <p className="text-indigo-100 text-[10px] font-black uppercase mb-2 opacity-60">Customer</p>
                    <p className="text-xl font-black text-white">{assignedOrder.customer_name}</p>
                    <p className="text-sm text-indigo-200 mt-1">{assignedOrder.customer_address}</p>
                  </div>
                  <div className="bg-white/10 backdrop-blur-md rounded-3xl p-6 border border-white/10">
                    <p className="text-indigo-100 text-[10px] font-black uppercase mb-2 opacity-60">Items</p>
                    <p className="text-sm font-bold text-white">
                      {assignedOrder.items?.map((i: any) => `${i.quantity}x ${i.name}`).join(', ')}
                    </p>
                  </div>
                </div>

                <div className="bg-black/20 p-6 rounded-2xl border border-white/5 flex items-center gap-4">
                  <div className="animate-pulse bg-white/20 h-4 w-4 rounded-full"></div>
                  <p className="text-white/80 text-xs font-black uppercase tracking-widest">Awaiting Dispatch from HQ</p>
                </div>
              </div>
              <MdLocalShipping size={300} className="absolute -bottom-20 -right-20 text-white/5 -rotate-12" />
            </div>
          </div>
        ) : (
          <div className="bg-slate-800/30 border-4 border-dashed border-slate-700 rounded-[3rem] p-20 text-center space-y-4">
            <div className="w-24 h-24 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
              <MdLocalShipping size={40} className="text-slate-600" />
            </div>
            <h3 className="text-2xl font-black text-slate-400 uppercase tracking-widest">Fleet Idle</h3>
            <p className="text-sm text-slate-600 font-medium max-w-xs mx-auto italic">Waiting for Command Center to assign next delivery protocol...</p>
          </div>
        )
      ) : (
        <div className="space-y-6">
          {/* History View */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {completedDeliveries.length === 0 ? (
              <div className="col-span-full py-32 text-center bg-slate-900/20 border border-slate-800 border-dashed rounded-[3rem]">
                <MdCheckCircle size={64} className="mx-auto text-slate-800 mb-6" />
                <p className="text-sm font-black text-slate-600 uppercase tracking-widest">No service records found</p>
              </div>
            ) : (
              completedDeliveries.map((delivery) => (
                <div key={delivery.id} className="bg-slate-800/40 border border-slate-700 p-8 rounded-[2.5rem] hover:border-blue-500/50 transition-all group">
                   <div className="flex justify-between items-start mb-6">
                      <div>
                        <p className="text-[10px] font-mono text-blue-400 mb-1">#{delivery.delivery_id?.slice(-8)}</p>
                        <h4 className="text-lg font-black text-white">Success Delivery</h4>
                      </div>
                      <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-500">
                        <MdCheckCircle size={20} />
                      </div>
                   </div>
                   
                   <div className="space-y-3 mb-8">
                      <div className="flex justify-between text-[10px]">
                        <span className="text-slate-500 font-bold uppercase">Distance</span>
                        <span className="text-white font-black">{delivery.selected_route?.distance || '--'} KM</span>
                      </div>
                      <div className="flex justify-between text-[10px]">
                        <span className="text-slate-500 font-bold uppercase">Time</span>
                        <span className="text-white font-black">{delivery.selected_route?.eta || '--'} MIN</span>
                      </div>
                      <div className="flex justify-between text-[10px]">
                        <span className="text-slate-500 font-bold uppercase">Status</span>
                        <span className="text-emerald-400 font-black uppercase tracking-widest">COMPLETED</span>
                      </div>
                   </div>

                   <button 
                    onClick={() => setSelectedHistoryOrder(delivery)}
                    className="w-full py-4 rounded-2xl bg-slate-800 text-white text-[10px] font-black uppercase tracking-widest group-hover:bg-blue-600 transition-all shadow-lg"
                   >
                     View Intelligence →
                   </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Detail Overlay */}
      {selectedHistoryOrder && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-2xl rounded-[3rem] p-12 relative shadow-2xl overflow-hidden">
            <button 
              onClick={() => setSelectedHistoryOrder(null)}
              className="absolute top-8 right-8 w-12 h-12 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-white transition-all"
            >
              ✕
            </button>

            <div className="relative z-10">
              <p className="text-[10px] font-black text-blue-500 uppercase tracking-[0.3em] mb-4">Intelligence Report</p>
              <h2 className="text-4xl font-black text-white tracking-tighter mb-10">MISSION #{selectedHistoryOrder.delivery_id?.slice(-8)}</h2>

              <div className="grid grid-cols-2 gap-6 mb-10">
                <div className="bg-slate-800/50 p-6 rounded-3xl border border-slate-700">
                  <p className="text-[9px] font-black text-slate-500 uppercase mb-2">Distance Traversed</p>
                  <p className="text-sm font-bold text-white">{selectedHistoryOrder.selected_route?.distance || '--'} KM</p>
                </div>
                <div className="bg-slate-800/50 p-6 rounded-3xl border border-slate-700">
                  <p className="text-[9px] font-black text-slate-500 uppercase mb-2">Estimated Time</p>
                  <p className="text-sm font-bold text-white">{selectedHistoryOrder.selected_route?.eta || '--'} MIN</p>
                </div>
              </div>

              <div className="bg-slate-800/50 p-8 rounded-3xl border border-slate-700 mb-10">
                <div className="flex justify-between items-center mb-6">
                   <h5 className="text-[10px] font-black text-slate-500 uppercase">Mission Logistics</h5>
                   {selectedHistoryOrder.rerouted && (
                     <span className="px-3 py-1 bg-orange-500/10 text-orange-400 text-[8px] font-black uppercase rounded-lg border border-orange-500/20">Reroute Applied</span>
                   )}
                </div>
                <div className="space-y-4">
                  <div className="flex justify-between">
                    <span className="text-xs text-slate-400 font-medium">System Risk Score</span>
                    <span className="text-xs text-emerald-400 font-black">OPTIMAL (98/100)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-slate-400 font-medium">Path Deviation</span>
                    <span className="text-xs text-white font-black">{selectedHistoryOrder.rerouted ? 'DETECTED' : 'MINIMAL'}</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-700 pt-4">
                    <span className="text-xs text-slate-300 font-black uppercase">Final Outcome</span>
                    <span className="text-xs text-emerald-500 font-black uppercase tracking-widest">SUCCESSFUL DELIVERY</span>
                  </div>
                </div>
              </div>

              <button 
                onClick={() => setSelectedHistoryOrder(null)}
                className="w-full py-6 rounded-3xl bg-blue-600 text-white font-black uppercase tracking-widest text-xs shadow-xl shadow-blue-600/20 hover:scale-[1.02] transition-all"
              >
                Close Record
              </button>
            </div>
            
            <MdLocalShipping size={400} className="absolute -bottom-40 -right-40 text-white/[0.02] -rotate-12" />
          </div>
        </div>
      )}
    </div>
  );
};

export default DriverDashboard;
