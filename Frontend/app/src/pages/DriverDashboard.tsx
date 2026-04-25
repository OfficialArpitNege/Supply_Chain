import React, { useState, useEffect } from 'react';
import { db } from '../config/firebase';
import { collection, query, where, onSnapshot, doc, updateDoc, getDocs, setDoc } from 'firebase/firestore';
import { useApp } from '../context/AppContext';
import toast from 'react-hot-toast';
import { MdLocalShipping, MdMap, MdPlayArrow, MdFastForward, MdCheckCircle } from 'react-icons/md';

const DriverDashboard: React.FC = () => {
  const { currentUser, callApi } = useApp();
  const [driver, setDriver] = useState<any>(null);
  const [activeDelivery, setActiveDelivery] = useState<any>(null);
  const [assignedOrder, setAssignedOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);

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
    console.log(">>> [DRIVER UPDATE]:", JSON.stringify(driver, null, 2));
    
    if (!driver.active_delivery_id) {
      setActiveDelivery(null);
      return;
    }
    
    console.log(">>> [FETCHING DELIVERY]:", driver.active_delivery_id);
    const unsubDel = onSnapshot(doc(db, 'deliveries', driver.active_delivery_id), (snap) => {
      if (snap.exists()) {
        const ddata = snap.data();
        console.log(">>> [DELIVERY DATA]:", JSON.stringify(ddata, null, 2));
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
    
    console.log(">>> [STATUS CHECK]:", JSON.stringify({ 
      hasActiveDelivery, 
      hasAssignedOrder, 
      active_order_id: driver.active_order_id,
      active_delivery_id: driver.active_delivery_id
    }, null, 2));

    if (!hasAssignedOrder || hasActiveDelivery) {
      setAssignedOrder(null);
      return;
    }

    console.log(">>> [FETCHING ORDER]:", driver.active_order_id);
    const unsubOrder = onSnapshot(doc(db, 'orders', driver.active_order_id), (snap) => {
      if (snap.exists()) {
        const odata = snap.data();
        console.log(">>> [ORDER DATA]:", JSON.stringify(odata, null, 2));
        setAssignedOrder({ id: snap.id, ...odata });
      } else {
        setAssignedOrder(null);
      }
    });
    return () => unsubOrder();
  }, [driver?.active_order_id, driver?.active_delivery_id, driver?.id]);

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
      await callApi(`/deliveries/${driver.active_delivery_id}/move?step_size=5`, {
        method: 'POST'
      });
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-screen text-blue-500 font-black uppercase tracking-widest">Initialising Fleet...</div>;

  return (
    <div className="max-w-xl mx-auto space-y-6">
      {/* Header Info */}
      <header className="bg-slate-800/50 border border-slate-700 rounded-[2.5rem] p-8 flex justify-between items-center shadow-2xl">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className={`h-2 w-2 rounded-full ${driver?.status === 'available' ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}></span>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{driver?.status}</p>
          </div>
          <h1 className="text-3xl font-black text-white">{driver?.name}</h1>
        </div>
        <button 
          onClick={toggleAvailability}
          className={`px-6 py-3 rounded-2xl font-black text-[10px] uppercase transition-all shadow-xl ${driver?.status === 'available' ? 'bg-red-500/10 text-red-400 border border-red-500/30' : 'bg-emerald-600 text-white shadow-emerald-500/20'}`}
        >
          {driver?.status === 'available' ? 'Go Offline' : 'Go Online'}
        </button>
      </header>

      {activeDelivery ? (
        <div className="space-y-6">
          {/* Active Task Card */}
          <div className="bg-blue-600 rounded-[3rem] p-10 shadow-2xl shadow-blue-500/20 relative overflow-hidden group">
            <div className="relative z-10">
              <p className="text-blue-200 text-xs font-black uppercase tracking-[0.2em] mb-2 opacity-80">Active Task</p>
              <h2 className="text-5xl font-black text-white tracking-tighter mb-8">#{activeDelivery.delivery_id?.slice(-8)}</h2>
              
              <div className="grid grid-cols-2 gap-6 mb-10">
                <div className="bg-white/10 backdrop-blur-md rounded-3xl p-5 border border-white/10">
                  <p className="text-blue-100 text-[10px] font-black uppercase mb-1 opacity-60">Status</p>
                  <p className="text-xl font-black text-white uppercase">{activeDelivery.status?.replace('_', ' ')}</p>
                </div>
                <div className="bg-white/10 backdrop-blur-md rounded-3xl p-5 border border-white/10">
                  <p className="text-blue-100 text-[10px] font-black uppercase mb-1 opacity-60">ETA</p>
                  <p className="text-xl font-black text-white">{activeDelivery.eta_remaining || '--'} MIN</p>
                </div>
              </div>

              <div className="flex gap-4">
                <button 
                  onClick={startDelivery}
                  disabled={activeDelivery.status !== 'dispatched'}
                  className={`flex-1 flex items-center justify-center gap-3 py-6 rounded-[2rem] font-black text-xs uppercase tracking-widest transition-all ${activeDelivery.status === 'dispatched' ? 'bg-white text-blue-600 shadow-2xl hover:scale-[1.02]' : 'bg-white/20 text-white/40 cursor-not-allowed'}`}
                >
                  <MdPlayArrow size={24} /> Start Delivery
                </button>
                <button 
                   onClick={() => window.open(activeDelivery.navigation_link, '_blank')}
                   className="p-6 bg-white/10 hover:bg-white/20 text-white rounded-[2rem] transition-all"
                >
                  <MdMap size={24} />
                </button>
              </div>
            </div>
            <MdLocalShipping size={300} className="absolute -bottom-20 -right-20 text-white/5 -rotate-12 group-hover:rotate-0 transition-transform duration-700" />
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
               disabled={activeDelivery.status === 'delivered' || activeDelivery.status === 'dispatched'}
               className="w-full group bg-slate-900 hover:bg-blue-600 text-white py-10 rounded-[2.5rem] border border-slate-700 hover:border-blue-400 transition-all flex flex-col items-center gap-3 active:scale-95 disabled:opacity-30 disabled:hover:bg-slate-900"
             >
                <MdFastForward size={32} className="group-hover:translate-x-2 transition-transform" />
                <span className="text-[10px] font-black uppercase tracking-[0.3em]">Move Forward</span>
             </button>
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
      )}
    </div>
  );
};

export default DriverDashboard;
