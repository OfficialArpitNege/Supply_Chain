import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { db } from '../config/firebase';
import { doc, getDoc, collection, query, where, onSnapshot } from 'firebase/firestore';
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useApp } from '../context/AppContext';
import toast from 'react-hot-toast';
import { 
  MdLocalShipping, 
  MdCheckCircle, 
  MdWarning, 
  MdMap, 
  MdPerson, 
  MdTimeline 
} from 'react-icons/md';

// --- Map Icons ---
const warehouseIcon = new L.Icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/2271/2271068.png',
  iconSize: [40, 40],
  iconAnchor: [20, 40],
});

const customerIcon = new L.Icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/1067/1067555.png',
  iconSize: [36, 36],
  iconAnchor: [18, 36],
});

const driverIcon = new L.Icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/3063/3063822.png',
  iconSize: [32, 32],
  iconAnchor: [16, 32],
});

// Helper component to auto-fit map bounds
const ChangeView = ({ bounds }) => {
    const map = useMap();
    if (bounds) map.fitBounds(bounds, { padding: [50, 50] });
    return null;
};

const Logistics = () => {
  const [searchParams] = useSearchParams();
  const orderId = searchParams.get('orderId');
  const { callApi } = useApp();
  const navigate = useNavigate();

  const [order, setOrder] = useState(null);
  const [warehouse, setWarehouse] = useState(null);
  const [drivers, setDrivers] = useState([]);
  const [selectedDriverId, setSelectedDriverId] = useState('');
  const [routeData, setRouteData] = useState(null);
  const [delivery, setDelivery] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orderId) {
        setLoading(false);
        return;
    }

    const fetchData = async () => {
      try {
        // 1. Fetch Order
        const orderSnap = await getDoc(doc(db, 'orders', orderId));
        if (orderSnap.exists()) {
          const odata = orderSnap.data();
          setOrder({ id: orderSnap.id, ...odata });

          // 2. Fetch Warehouse
          if (odata.warehouse_id) {
            const whSnap = await getDoc(doc(db, 'warehouses', odata.warehouse_id));
            if (whSnap.exists()) setWarehouse({ id: whSnap.id, ...whSnap.data() });
          }
        }

        // 3. Fetch Available Drivers
        const qDrivers = query(collection(db, 'drivers'), where('status', '==', 'available'));
        const unsubDrivers = onSnapshot(qDrivers, (snap) => {
          setDrivers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        // 4. Track Active Delivery (if already dispatched)
        const qDel = query(collection(db, 'deliveries'), where('order_id', '==', orderId));
        const unsubDel = onSnapshot(qDel, (snap) => {
          if (!snap.empty) {
            const ddata = snap.docs[0].data();
            setDelivery({ id: snap.docs[0].id, ...ddata });
            if (ddata.route) {
              setRouteData({ route: ddata.route, selected_route: ddata.selected_route });
            }
          }
        });

        return () => {
            unsubDrivers();
            unsubDel();
        };

      } catch (e) {
        toast.error(e.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [orderId]);

  // Fetch route when order and warehouse are ready (for preview)
  useEffect(() => {
    if (order && warehouse && !routeData) {
        const fetchRoute = async () => {
            try {
                // Use recommend-routes for preview instead of dispatch
                const res = await callApi(`/recommend-routes`, { 
                    method: 'POST',
                    body: JSON.stringify({
                        start_lat: warehouse.location.lat,
                        start_lon: warehouse.location.lon,
                        end_lat: order.customer_location.lat,
                        end_lon: order.customer_location.lon
                    })
                });

                if (res.routes && res.routes.length > 0) {
                    const best = res.routes.find(r => r.id === res.recommended_route_id) || res.routes[0];
                    setRouteData({
                        route: best.route_path.map(p => ({ lat: p[0], lon: p[1] })),
                        selected_route: {
                            distance: best.distance,
                            eta: best.traffic_eta,
                            traffic_speed: best.traffic_speed
                        }
                    });
                }
            } catch (e) {
                console.error("Route Preview Error:", e);
                toast.error("Failed to generate route preview");
            }
        };
        fetchRoute();
    }
  }, [order, warehouse]);

  const handleAssignDriver = async () => {
    if (!selectedDriverId) return toast.error("Please select a driver");
    const tid = toast.loading("Assigning driver...");
    try {
      await callApi(`/orders/${orderId}/assign`, {
        method: 'POST',
        body: JSON.stringify({ driver_id: selectedDriverId })
      });
      toast.success("Driver assigned successfully!", { id: tid });
      // Refresh order data
      const orderSnap = await getDoc(doc(db, 'orders', orderId));
      setOrder({ id: orderSnap.id, ...orderSnap.data() });
    } catch (e) {
      toast.error(e.message, { id: tid });
    }
  };

  const handleDispatch = async () => {
    const tid = toast.loading("Dispatching vehicle...");
    try {
      await callApi(`/orders/${orderId}/dispatch`, { method: 'POST' });
      toast.success("Order Dispatched! Tracking Active.", { id: tid });
      // The onSnapshot will pick up the delivery document
    } catch (e) {
      toast.error(e.message, { id: tid });
    }
  };

  const mapBounds = React.useMemo(() => {
    if (!warehouse || !order) return null;
    return [
        [warehouse.location.lat, warehouse.location.lon],
        [order.customer_location.lat, order.customer_location.lon]
    ];
  }, [warehouse, order]);

  if (loading) return <div className="h-full flex items-center justify-center font-black text-blue-500 uppercase tracking-widest animate-pulse">Initializing Logistics Core...</div>;
  if (!order) return <div className="h-full flex flex-col items-center justify-center text-slate-500">
    <MdMap size={64} className="mb-4 opacity-20" />
    <p className="font-black uppercase tracking-widest text-xs">No active logistics session</p>
    <button onClick={() => navigate('/admin-dashboard')} className="px-6 py-3 bg-blue-600 text-white rounded-xl font-black text-[10px] uppercase mt-6">Back to Dashboard</button>
  </div>;

  return (
    <div className="h-[calc(100vh-120px)] flex flex-col gap-6">
      <div className="grid grid-cols-12 gap-6 h-full min-h-0">
        
        {/* LEFT: Order Info & Driver Assignment */}
        <div className="col-span-4 flex flex-col gap-6 overflow-hidden">
          <div className="bg-slate-800/50 border border-slate-700 rounded-3xl p-8 shadow-xl">
             <div className="flex justify-between items-start mb-6">
               <div>
                 <p className="text-[10px] font-black text-blue-400 uppercase tracking-[0.2em]">Logistics Sector</p>
                 <h1 className="text-3xl font-black text-white tracking-tighter">ORD #{order.order_id?.slice(-8)}</h1>
               </div>
               <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase border ${order.status === 'pending' ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' : 'bg-blue-500/10 text-blue-400 border-blue-500/20'}`}>
                 {order.status}
               </span>
             </div>

             <div className="space-y-4">
                <div className="bg-slate-900/50 p-5 rounded-2xl border border-slate-700">
                   <p className="text-[8px] font-black text-slate-500 uppercase mb-2 tracking-widest opacity-50">Customer Destination</p>
                   <p className="text-sm font-black text-white">{order.customer_name}</p>
                   <p className="text-[10px] text-slate-500 font-bold">{order.customer_phone}</p>
                </div>
                <div className="bg-slate-900/50 p-5 rounded-2xl border border-slate-700">
                   <p className="text-[8px] font-black text-slate-500 uppercase mb-2 tracking-widest opacity-50">Origin Warehouse</p>
                   <p className="text-sm font-black text-blue-400">{warehouse?.name || 'Validating Stock...'}</p>
                </div>
             </div>
          </div>

          <div className="flex-1 bg-slate-800/50 border border-slate-700 rounded-3xl p-8 shadow-xl flex flex-col overflow-hidden">
             <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-6">Available Fleet</h3>
             <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
                {drivers.map(d => (
                  <div 
                    key={d.id} 
                    onClick={() => !order.driver_id && setSelectedDriverId(d.id)}
                    className={`p-4 rounded-2xl border transition-all ${order.driver_id === d.id ? 'bg-emerald-500/10 border-emerald-500/50 shadow-emerald-500/10' : selectedDriverId === d.id ? 'bg-blue-600 border-blue-400 shadow-lg shadow-blue-500/20' : 'bg-slate-900/50 border-slate-700 hover:border-slate-500'}`}
                  >
                    <div className="flex justify-between items-center">
                       <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-xl ${selectedDriverId === d.id || order.driver_id === d.id ? 'bg-white/20' : 'bg-slate-800'}`}>
                            <MdLocalShipping size={20} className={selectedDriverId === d.id || order.driver_id === d.id ? 'text-white' : 'text-blue-500'} />
                          </div>
                          <div>
                            <p className="text-sm font-black text-white">{d.name}</p>
                            <p className={`text-[9px] uppercase font-bold ${selectedDriverId === d.id ? 'text-blue-200' : 'text-slate-500'}`}>{d.email} • {d.vehicle_type}</p>
                            {d.active_order_id && <p className="text-[8px] text-amber-400 font-black">ASSIGNED: {d.active_order_id}</p>}
                          </div>
                       </div>
                       {(selectedDriverId === d.id || order.driver_id === d.id) && <MdCheckCircle className={order.driver_id === d.id ? 'text-emerald-400' : 'text-white'} />}
                    </div>
                  </div>
                ))}
                {drivers.length === 0 && !order.driver_id && <p className="text-center text-slate-500 py-10 text-xs italic">No drivers currently available in this sector</p>}
             </div>
             
             <div className="mt-6 space-y-3">
                {!order.driver_id ? (
                    <button 
                        onClick={handleAssignDriver}
                        disabled={!selectedDriverId}
                        className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-5 rounded-2xl text-[10px] uppercase tracking-widest transition-all disabled:opacity-30 shadow-xl shadow-blue-600/20"
                    >
                        Confirm Driver Assignment
                    </button>
                ) : (
                    <button 
                        onClick={handleDispatch}
                        disabled={order.status === 'dispatched' || order.status === 'in_transit'}
                        className={`w-full font-black py-5 rounded-2xl text-[10px] uppercase tracking-widest transition-all shadow-xl ${order.status === 'dispatched' || order.status === 'in_transit' ? 'bg-emerald-600 text-white cursor-default' : 'bg-orange-600 hover:bg-orange-500 text-white shadow-orange-600/20'}`}
                    >
                        {order.status === 'dispatched' || order.status === 'in_transit' ? 'Order Dispatched' : 'Start Dispatch Protocol'}
                    </button>
                )}
             </div>
          </div>
        </div>

        {/* RIGHT: Route Visualization */}
        <div className="col-span-8 bg-slate-900 border border-slate-700 rounded-3xl shadow-xl overflow-hidden relative">
           <MapContainer center={[19.0760, 72.8777]} zoom={12} style={{ height: '100%', width: '100%', background: '#0F172A' }}>
              <ChangeView bounds={mapBounds} />
              <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
              
              {warehouse?.location && (
                <Marker position={[warehouse.location.lat, warehouse.location.lon]} icon={warehouseIcon}>
                  <Popup><div className="text-xs font-black uppercase text-slate-900">Origin: {warehouse.name}</div></Popup>
                </Marker>
              )}

              {order?.customer_location && (
                <Marker position={[order.customer_location.lat, order.customer_location.lon]} icon={customerIcon}>
                   <Popup><div className="text-xs font-black uppercase text-slate-900">Destination: {order.customer_name}</div></Popup>
                </Marker>
              )}

              {/* Live Driver Tracking */}
              {delivery?.current_index !== undefined && routeData?.route && (
                  <Marker 
                    position={[routeData.route[delivery.current_index].lat, routeData.route[delivery.current_index].lon]} 
                    icon={driverIcon}
                  >
                    <Popup><div className="text-xs font-black uppercase text-blue-600">Unit In Transit</div></Popup>
                  </Marker>
              )}

              {routeData?.route && (
                <Polyline 
                   positions={routeData.route.map(p => [p.lat, p.lon])} 
                   color="#3B82F6" 
                   weight={6} 
                   opacity={0.4}
                />
              )}
           </MapContainer>

           {/* Route Metrics Overlay */}
           {routeData && (
              <div className="absolute top-8 right-8 z-[1000] w-72 space-y-4">
                 <div className="bg-slate-800/90 backdrop-blur-md border border-slate-700 rounded-2xl p-6 shadow-2xl">
                    <h4 className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-4">Logistics Intelligence</h4>
                    <div className="grid grid-cols-2 gap-6">
                       <div>
                          <p className="text-[7px] font-black text-slate-500 uppercase mb-1">Total Distance</p>
                          <p className="text-2xl font-black text-white">{routeData.selected_route?.distance || '--'} <span className="text-[10px] text-slate-500 font-bold tracking-normal">KM</span></p>
                       </div>
                       <div>
                          <p className="text-[7px] font-black text-slate-500 uppercase mb-1">Est. Travel Time</p>
                          <p className="text-2xl font-black text-orange-400">{routeData.selected_route?.eta || '--'} <span className="text-[10px] text-slate-500 font-bold tracking-normal">MIN</span></p>
                       </div>
                    </div>
                 </div>

                 {delivery && (
                    <div className="bg-blue-600/20 backdrop-blur-md border border-blue-500/30 rounded-2xl p-6 shadow-2xl">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                                <MdTimeline className="text-blue-400" />
                                <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest">Live Progress</p>
                            </div>
                            <span className="text-[10px] font-black text-white">{Math.round(delivery.progress || 0)}%</span>
                        </div>
                        <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                            <div 
                                className="h-full bg-blue-500 transition-all duration-1000" 
                                style={{ width: `${delivery.progress || 0}%` }}
                            />
                        </div>
                    </div>
                 )}
              </div>
           )}
        </div>
      </div>
    </div>
  );
};

export default Logistics;
