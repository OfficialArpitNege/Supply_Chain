import React, { useState, useEffect } from 'react';
import { db } from '../config/firebase';
import { collection, query, where, onSnapshot, doc, updateDoc, getDocs, setDoc } from 'firebase/firestore';
import { useApp } from '../context/AppContext';
import toast from 'react-hot-toast';

const DriverDashboard: React.FC = () => {
  const { currentUser, callApi } = useApp();
  const [driver, setDriver] = useState<any>(null);
  const [activeDelivery, setActiveDelivery] = useState<any>(null);
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
            // Create driver doc if missing
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

  useEffect(() => {
    if (!driver?.active_delivery_id) {
      setActiveDelivery(null);
      return;
    }
    const unsubDel = onSnapshot(doc(db, 'deliveries', driver.active_delivery_id), (snap) => {
      setActiveDelivery(snap.data());
    });
    return () => unsubDel();
  }, [driver?.active_delivery_id]);

  const toggleAvailability = async () => {
    if (!driver?.id) return;
    const newStatus = driver.status === 'available' ? 'offline' : 'available';
    await updateDoc(doc(db, 'drivers', driver.id), { status: newStatus });
    toast.success(`Status updated to ${newStatus}`);
  };

  const moveForward = async () => {
    if (!driver?.active_delivery_id) return;
    try {
      await callApi(`/deliveries/${driver.active_delivery_id}/move?step_size=3`, {
        method: 'POST'
      });
    } catch (e: any) {
      console.error(e);
      toast.error(e.message);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-gray-100 p-6">
      <div className="max-w-2xl mx-auto">
        <header className="flex justify-between items-center mb-8 bg-[#16161e] p-6 rounded-2xl border border-gray-800">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className={`w-2 h-2 rounded-full ${driver?.status === 'available' ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}></span>
              <h1 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                {driver?.status === 'available' ? 'System Online: Available' : 'System Offline: Busy/Resting'}
              </h1>
            </div>
            <h2 className="text-2xl font-black">{driver?.name || 'Driver'}</h2>
          </div>
          <button onClick={toggleAvailability} className={`px-4 py-2 rounded-xl font-bold text-[10px] uppercase transition-all ${driver?.status === 'available' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-900/40' : 'bg-red-500/20 text-red-400 border border-red-500'}`}>
            {driver?.status === 'available' ? 'GO OFFLINE' : 'GO ONLINE'}
          </button>
        </header>

        {activeDelivery ? (
          <div className="space-y-6">
            <div className="bg-gradient-to-br from-blue-600 to-blue-800 p-8 rounded-3xl shadow-2xl relative overflow-hidden group">
              <div className="relative z-10">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h3 className="text-xs font-bold uppercase text-blue-200 opacity-80 mb-1">Current Mission</h3>
                    <h4 className="text-3xl font-black tracking-tighter">#{activeDelivery.delivery_id?.slice(-8).toUpperCase()}</h4>
                  </div>
                  <div className="bg-white/10 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 text-[10px] font-bold uppercase">
                    ETA: {activeDelivery.eta_remaining}m
                  </div>
                </div>

                <div className="flex gap-4">
                  <a href={activeDelivery.navigation_link} target="_blank" className="flex-1 bg-white text-blue-700 px-6 py-4 rounded-2xl font-black text-xs text-center uppercase tracking-widest hover:scale-[1.02] transition-all shadow-xl">
                    🚀 Open NAV
                  </a>
                </div>
              </div>
              <div className="absolute -bottom-4 -right-4 opacity-10 text-[12rem] font-black italic tracking-tighter group-hover:translate-x-4 transition-transform pointer-events-none">DELIVERY</div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-[#16161e] p-6 rounded-2xl border border-gray-800 flex flex-col items-center">
                <p className="text-[10px] font-bold text-gray-500 uppercase mb-2">Progress</p>
                <div className="relative w-16 h-16 flex items-center justify-center">
                  <svg className="w-full h-full -rotate-90">
                    <circle cx="32" cy="32" r="28" stroke="currentColor" strokeWidth="4" fill="transparent" className="text-gray-800" />
                    <circle cx="32" cy="32" r="28" stroke="currentColor" strokeWidth="4" fill="transparent" strokeDasharray={175} strokeDashoffset={175 - (175 * activeDelivery.progress) / 100} className="text-blue-500 transition-all duration-1000" />
                  </svg>
                  <span className="absolute text-xs font-black">{Math.round(activeDelivery.progress)}%</span>
                </div>
              </div>
              <div className="bg-[#16161e] p-6 rounded-2xl border border-gray-800 flex flex-col items-center justify-center">
                <p className="text-[10px] font-bold text-gray-500 uppercase mb-2">Distance Left</p>
                <h5 className="text-2xl font-black text-white">{activeDelivery.distance_remaining} <span className="text-[10px] text-gray-500">km</span></h5>
              </div>
            </div>

            <div className="p-1 bg-gradient-to-r from-emerald-500/20 to-blue-500/20 rounded-[2.5rem]">
              <button onClick={moveForward} className="w-full bg-[#0a0a0f] hover:bg-[#16161e] text-white font-black py-8 rounded-[2.25rem] text-xl shadow-inner active:scale-[0.98] transition-all border border-gray-800/50">
                PROCEED TO NEXT WAYPOINT
              </button>
            </div>

            <div className="bg-[#16161e] p-6 rounded-2xl border border-gray-800">
              <p className="text-xs font-bold text-gray-500 uppercase mb-4">Route Summary</p>
              <div className="space-y-4">
                <div className="flex gap-4 items-center">
                  <div className="w-8 h-8 bg-gray-800 rounded-lg flex items-center justify-center text-sm">A</div>
                  <p className="text-sm">Warehouse (Pickup)</p>
                </div>
                <div className="w-0.5 h-6 bg-gray-800 ml-4"></div>
                <div className="flex gap-4 items-center">
                  <div className="w-8 h-8 bg-blue-500/20 text-blue-400 border border-blue-500/50 rounded-lg flex items-center justify-center text-sm">B</div>
                  <p className="text-sm">Customer Location (Drop-off)</p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-[#16161e] p-12 rounded-3xl border-2 border-dashed border-gray-800 text-center">
            <div className="text-6xl mb-4">😴</div>
            <h3 className="text-xl font-bold text-gray-400">No active deliveries</h3>
            <p className="text-gray-600 mt-2">Check back soon for new assignments.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default DriverDashboard;
