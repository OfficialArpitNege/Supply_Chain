import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { db } from '../config/firebase';
import { collection, query, where, onSnapshot, orderBy, doc, updateDoc } from 'firebase/firestore';
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { 
  MdLocalShipping, 
  MdCheckCircle, 
  MdAccessTime, 
  MdLocationOn, 
  MdPerson, 
  MdHistory, 
  MdNotifications, 
  MdShoppingBag,
  MdStar,
  MdPhone,
  MdPlace,
  MdInfo
} from 'react-icons/md';
import { useApp } from '../context/AppContext';
import toast, { Toaster } from 'react-hot-toast';

// --- Icons ---
const driverIcon = new L.Icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/3063/3063822.png',
  iconSize: [32, 32],
  iconAnchor: [16, 32],
});

const destIcon = new L.Icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/1067/1067555.png',
  iconSize: [32, 32],
  iconAnchor: [16, 32],
});

const startIcon = new L.Icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/2271/2271068.png',
  iconSize: [34, 34],
  iconAnchor: [17, 34],
});

// --- Helpers ---
const MapRefocuser = ({ center }: { center: [number, number] }) => {
  const map = useMap();
  useEffect(() => {
    if (center) map.flyTo(center, 14);
  }, [center, map]);
  return null;
};

const StatusBadge = ({ status }: { status: string }) => {
  const configs: any = {
    pending: { color: 'bg-amber-500/10 text-amber-500', label: 'Processing' },
    accepted: { color: 'bg-blue-500/10 text-blue-500', label: 'Accepted' },
    dispatched: { color: 'bg-indigo-500/10 text-indigo-500', label: 'Dispatched' },
    in_transit: { color: 'bg-blue-500/10 text-blue-500', label: 'In Transit' },
    nearing: { color: 'bg-orange-500/10 text-orange-500', label: 'Arriving Soon' },
    delivered: { color: 'bg-emerald-500/10 text-emerald-500', label: 'Delivered' },
  };
  const config = configs[status] || { color: 'bg-slate-500/10 text-slate-500', label: status };
  return (
    <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border border-current ${config.color}`}>
      {config.label}
    </span>
  );
};

// --- Main Component ---
const CustomerDashboard: React.FC = () => {
  const { callApi, currentUser } = useApp();
  const navigate = useNavigate();
  const { orderId: urlOrderId } = useParams<{ orderId: string }>();
  const [view, setView] = useState<'track' | 'marketplace'>('track');
  const [orders, setOrders] = useState<any[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [activeDelivery, setActiveDelivery] = useState<any>(null);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [customerInfo, setCustomerInfo] = useState({
    name: 'Guest User',
    phone: '+91 98765 43210',
    address: 'Andheri West, Mumbai, Maharashtra'
  });
  const [orderFilter, setOrderFilter] = useState<'active' | 'history'>('active');

  // Handle URL Param
  useEffect(() => {
    if (urlOrderId) {
      setSelectedOrderId(urlOrderId);
      return;
    }

    setSelectedOrderId(null);
    setOrderFilter('active');
  }, [urlOrderId, currentUser?.uid]);

  // Real-time Listeners
  useEffect(() => {
    // 1. Orders Listener
    const qOrders = query(collection(db, 'orders'), orderBy('created_at', 'desc'));
    const unsubOrders = onSnapshot(qOrders, (snap) => {
      setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // 2. Drivers & Warehouses (for names)
    onSnapshot(collection(db, 'drivers'), s => setDrivers(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    onSnapshot(collection(db, 'warehouses'), s => setWarehouses(s.docs.map(d => ({ id: d.id, ...d.data() }))));

    return () => unsubOrders();
  }, []);

  // Sync selected delivery
  useEffect(() => {
    if (!selectedOrderId) return;
    const q = query(collection(db, 'deliveries'), where('order_id', '==', selectedOrderId));
    const unsub = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        setActiveDelivery({ id: snap.docs[0].id, ...snap.docs[0].data() });
      } else {
        setActiveDelivery(null);
      }
    });
    return () => unsub();
  }, [selectedOrderId]);

  const customerOrders = currentUser?.uid
    ? orders.filter(o => o.customer_id === currentUser.uid)
    : orders;
  const activeOrders = customerOrders.filter(o => o.status !== 'delivered');
  const historyOrders = customerOrders.filter(o => o.status === 'delivered');
  const displayOrders = orderFilter === 'active' ? activeOrders : historyOrders;
  const selectedOrder = customerOrders.find(o => o.id === selectedOrderId) || null;

  useEffect(() => {
    if (selectedOrderId && !customerOrders.some(o => o.id === selectedOrderId)) {
      setSelectedOrderId(null);
    }
  }, [customerOrders, selectedOrderId]);

  // Stats for the selected order
  const currentLoc = activeDelivery?.route?.[activeDelivery.current_index || 0];
  const isArrivingSoon = activeDelivery?.eta_remaining <= 10 && activeDelivery?.status !== 'delivered';

  return (
    <div className="h-[calc(100vh-100px)] flex flex-col bg-background text-slate-200 overflow-hidden rounded-[2.5rem] border border-slate-800 shadow-2xl">
      <Toaster position="top-right" />
      
      {/* Header */}
      <header className="px-8 py-4 bg-slate-900/50 border-b border-slate-800 flex justify-between items-center shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-900/20">
            <MdLocalShipping size={20} />
          </div>
          <div>
            <h1 className="text-lg font-black uppercase tracking-tighter">Logistics <span className="text-blue-500">Nexus</span></h1>
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Customer Tracking Console</p>
          </div>
        </div>

        <div className="flex items-center gap-8">
          <div className="flex items-center gap-3 bg-slate-800/50 px-4 py-2 rounded-2xl border border-slate-700">
             <MdPerson className="text-blue-400" />
             <div className="text-left">
               <p className="text-[10px] font-black text-white leading-none">{customerInfo.name}</p>
               <p className="text-[8px] font-medium text-slate-500">{customerInfo.phone}</p>
             </div>
          </div>
          <button
            onClick={() => navigate('/customer-orders-lifecycle')}
            className="px-4 py-2 border border-slate-700 bg-slate-800/70 hover:bg-slate-700 text-slate-200 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all"
          >
            Order Lifecycle
          </button>
          <button 
            onClick={() => setView(view === 'track' ? 'marketplace' : 'track')}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg shadow-blue-600/20"
          >
            {view === 'track' ? 'New Order' : 'Track Orders'}
          </button>
        </div>
      </header>

      {/* Main Grid */}
      <main className="flex-1 grid grid-cols-12 overflow-hidden">
        
        {/* LEFT: Orders List */}
        <aside className="col-span-3 border-r border-slate-800 flex flex-col bg-slate-900/20 overflow-hidden">
          <div className="p-6 border-b border-slate-800 flex gap-2">
            <button 
              onClick={() => setOrderFilter('active')}
              className={`flex-1 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${orderFilter === 'active' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-500 hover:text-slate-300'}`}
            >
              My Orders
            </button>
            <button 
              onClick={() => setOrderFilter('history')}
              className={`flex-1 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${orderFilter === 'history' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-500 hover:text-slate-300'}`}
            >
              History
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
            {displayOrders.length === 0 ? (
              <div className="text-center py-20">
                <MdShoppingBag size={40} className="mx-auto text-slate-700 mb-4" />
                <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">No {orderFilter} orders</p>
              </div>
            ) : (
              displayOrders.map(order => (
                <div 
                  key={order.id} 
                  onClick={() => { setSelectedOrderId(order.id); setView('track'); }}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer group ${selectedOrderId === order.id ? 'bg-blue-600/10 border-blue-500 shadow-lg' : 'bg-slate-800/30 border-slate-800 hover:border-slate-700'}`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <p className="text-[9px] font-mono text-blue-400">#{order.order_id?.slice(-8)}</p>
                    <StatusBadge status={order.status} />
                  </div>
                  <h4 className="text-sm font-black text-white truncate">{order.items?.[0]?.name || 'Industrial Supply'}</h4>
                  <div className="flex justify-between items-center mt-4">
                    <p className="text-[10px] font-bold text-slate-500">{order.items?.[0]?.quantity} Units</p>
                    <button className="text-[8px] font-black text-blue-400 uppercase tracking-widest group-hover:underline">View Details →</button>
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>

        {/* CENTER: Tracking / Marketplace */}
        <section className="col-span-6 relative bg-slate-950 overflow-hidden">
          {view === 'marketplace' ? (
             <div className="h-full flex flex-col items-center justify-center p-12 text-center">
                <MdShoppingBag size={64} className="text-blue-500/20 mb-6" />
                <h2 className="text-3xl font-black text-white uppercase tracking-tighter mb-4">Ready to expand?</h2>
                <p className="text-slate-400 max-w-md mb-8">Access our full industrial catalog and place new logistics requests instantly.</p>
                <button 
                  onClick={() => navigate('/marketplace')}
                  className="px-10 py-4 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest shadow-2xl shadow-blue-500/30 hover:scale-105 transition-all"
                >
                  Open Marketplace
                </button>
             </div>
          ) : !selectedOrder ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-12">
               <MdLocationOn size={64} className="text-slate-800 mb-6" />
               <h3 className="text-xl font-black text-slate-600 uppercase tracking-widest">Select an order to track</h3>
               <p className="text-slate-700 mt-2 text-sm">Real-time GPS tracking will initialize upon selection.</p>
            </div>
          ) : (
            <div className="h-full flex flex-col">
               {/* Map Area */}
               <div className="flex-1 relative">
                  <MapContainer 
                    center={currentLoc ? [currentLoc.lat, currentLoc.lon] : [19.076, 72.877]} 
                    zoom={13} 
                    style={{ height: '100%', width: '100%', background: '#0F172A' }}
                    zoomControl={false}
                  >
                    <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
                    {currentLoc && <MapRefocuser center={[currentLoc.lat, currentLoc.lon]} />}
                    {currentLoc && <Marker position={[currentLoc.lat, currentLoc.lon]} icon={driverIcon} />}
                    {activeDelivery?.start_location && (
                      <Marker position={[activeDelivery.start_location.lat, activeDelivery.start_location.lon]} icon={startIcon} />
                    )}
                    {activeDelivery?.end_location && (
                      <Marker position={[activeDelivery.end_location.lat, activeDelivery.end_location.lon]} icon={destIcon} />
                    )}
                    {activeDelivery?.rerouted && activeDelivery.old_route && (
                      <Polyline 
                        positions={activeDelivery.old_route.map((p: any) => [p.lat, p.lon])} 
                        color="#94A3B8" 
                        weight={2} 
                        opacity={0.15}
                        dashArray="5, 10"
                      />
                    )}
                    {activeDelivery?.route && (
                      <Polyline 
                        positions={activeDelivery.route.map((p: any) => [p.lat, p.lon])} 
                        color={activeDelivery.rerouted ? "#10B981" : "#3B82F6"} 
                        weight={5} 
                        opacity={0.7} 
                      />
                    )}
                  </MapContainer>

                  {/* Arriving Soon Overlay */}
                  {isArrivingSoon && (
                    <div className="absolute top-6 left-1/2 -translate-x-1/2 bg-orange-600 text-white px-8 py-3 rounded-2xl shadow-2xl z-1000 flex items-center gap-3 animate-bounce">
                      <MdAccessTime size={20} />
                      <p className="text-xs font-black uppercase tracking-widest">Driver is arriving in {Math.round(activeDelivery.eta_remaining)} mins!</p>
                    </div>
                  )}

                  {/* Bottom Stats Overlay */}
                  <div className="absolute bottom-6 left-6 right-6 z-1000 grid grid-cols-3 gap-4">
                    <div className="bg-slate-900/90 backdrop-blur-md p-4 rounded-2xl border border-slate-700 shadow-2xl">
                      <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Transit Progress</p>
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500 transition-all duration-1000" style={{ width: `${activeDelivery?.progress || 0}%` }}></div>
                        </div>
                        <span className="text-[10px] font-mono font-bold text-white">{activeDelivery?.progress || 0}%</span>
                      </div>
                    </div>
                    <div className="bg-slate-900/90 backdrop-blur-md p-4 rounded-2xl border border-slate-700 shadow-2xl text-center">
                      <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Remaining Dist.</p>
                      <p className="text-lg font-black text-white">{activeDelivery?.distance_remaining || '--'} <span className="text-[10px] text-slate-500">KM</span></p>
                    </div>
                    <div className="bg-slate-900/90 backdrop-blur-md p-4 rounded-2xl border border-slate-700 shadow-2xl text-center">
                      <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Live ETA</p>
                      <p className="text-lg font-black text-emerald-400">~{Math.round(activeDelivery?.eta_remaining || 0)} <span className="text-[10px] text-emerald-600">MIN</span></p>
                    </div>
                  </div>
               </div>
            </div>
          )}
        </section>

        {/* RIGHT: Details Panel */}
        <aside className="col-span-3 border-l border-slate-800 bg-slate-900/20 p-6 flex flex-col gap-6 overflow-y-auto custom-scrollbar">
          {!selectedOrder ? (
            <div className="h-full flex flex-col items-center justify-center text-center opacity-50">
               <MdInfo size={40} className="text-slate-700 mb-4" />
               <p className="text-[10px] font-black text-slate-600 uppercase tracking-[0.2em]">Select an asset for details</p>
            </div>
          ) : (
            <>
              {/* Order Context */}
              <div className="space-y-4">
                 <h3 className="text-[10px] font-black text-blue-500 uppercase tracking-[0.2em]">Delivery Details</h3>
                 <div className="bg-slate-800/40 border border-slate-700 p-5 rounded-2xl">
                    <div className="flex items-center gap-4 mb-4">
                      <div className="w-12 h-12 bg-blue-600/10 rounded-xl flex items-center justify-center text-blue-400">
                        <MdShoppingBag size={24} />
                      </div>
                      <div>
                        <p className="text-[9px] font-black text-slate-500 uppercase">Product</p>
                        <h4 className="text-sm font-black text-white">{selectedOrder.items?.[0]?.name}</h4>
                      </div>
                    </div>
                    
                    <div className="space-y-3">
                       <div className="flex justify-between text-[10px]">
                          <span className="text-slate-500 font-bold uppercase">Status</span>
                          <span className="text-white font-black uppercase">{selectedOrder.status.replace('_', ' ')}</span>
                       </div>
                       <div className="flex justify-between text-[10px]">
                          <span className="text-slate-500 font-bold uppercase">Warehouse</span>
                          <span className="text-blue-400 font-bold">{warehouses.find(w => w.id === selectedOrder.warehouse_id)?.name || 'Processing...'}</span>
                       </div>
                    </div>
                 </div>
              </div>

              {/* Driver Context */}
              <div className="space-y-4">
                 <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Assigned Personnel</h3>
                 <div className="bg-slate-800/40 border border-slate-700 p-5 rounded-2xl flex items-center gap-4">
                    <div className="w-12 h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-400">
                      <MdPerson size={24} />
                    </div>
                    <div className="flex-1">
                      <p className="text-[9px] font-black text-slate-500 uppercase">Field Agent</p>
                      <h4 className="text-sm font-black text-white">{drivers.find(d => d.id === activeDelivery?.driver_id)?.name || 'Assigning...'}</h4>
                      <p className="text-[9px] text-emerald-500 font-bold uppercase">● Online & Active</p>
                    </div>
                 </div>
              </div>

              {/* Activity Feed */}
              <div className="flex-1 space-y-4 min-h-0">
                 <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">System Log</h3>
                 <div className="bg-slate-900/50 rounded-2xl p-4 border border-slate-800/50 h-full overflow-y-auto space-y-4 custom-scrollbar">
                    {[
                      { msg: 'Order successfully placed', time: '10:45 AM', active: true },
                      { msg: 'Warehouse stock verified', time: '10:46 AM', active: selectedOrder.status !== 'pending' },
                      { msg: 'Driver dispatched to hub', time: '10:50 AM', active: !!activeDelivery },
                      { msg: 'Unit in transit to destination', time: '--:--', active: activeDelivery?.status === 'in_transit' || activeDelivery?.status === 'nearing' },
                      { msg: 'Final destination reached', time: '--:--', active: selectedOrder.status === 'delivered' }
                    ].map((step, i) => (
                      <div key={i} className={`flex gap-3 transition-opacity ${step.active ? 'opacity-100' : 'opacity-20'}`}>
                         <div className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${step.active ? 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]' : 'bg-slate-700'}`}></div>
                         <div>
                            <p className="text-[10px] font-medium text-slate-300 leading-tight">{step.msg}</p>
                            <p className="text-[8px] font-black text-slate-600 uppercase mt-1">{step.time}</p>
                         </div>
                      </div>
                    ))}
                 </div>
              </div>

              {/* Rating (Optional) */}
              {selectedOrder.status === 'delivered' && (
                <div className="bg-blue-600/10 border border-blue-500/30 p-5 rounded-2xl text-center">
                   <p className="text-[10px] font-black text-blue-400 uppercase mb-3">Rate Experience</p>
                   <div className="flex justify-center gap-2 mb-2">
                     {[1,2,3,4,5].map(s => <MdStar key={s} className="text-slate-600 hover:text-amber-400 cursor-pointer text-xl" />)}
                   </div>
                </div>
              )}
            </>
          )}
        </aside>
      </main>

      {/* Profile Footer */}
      <footer className="px-8 py-3 bg-slate-900/80 border-t border-slate-800 flex justify-between items-center text-[10px] font-medium text-slate-500">
         <div className="flex gap-6">
            <span className="flex items-center gap-2"><MdPhone className="text-blue-500" /> Support: +1 (800) LOGI-PRO</span>
            <span className="flex items-center gap-2"><MdPlace className="text-blue-500" /> {customerInfo.address}</span>
         </div>
         <p className="uppercase tracking-widest text-[8px] font-black">Powered by Antigravity OS v4.2</p>
      </footer>
    </div>
  );
};

export default CustomerDashboard;
