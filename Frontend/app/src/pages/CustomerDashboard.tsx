import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { db } from '../config/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { MdLocationOn, MdAccessTime, MdInfo, MdPhone, MdChevronLeft } from 'react-icons/md';

const driverIcon = new L.Icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/3063/3063822.png',
  iconSize: [40, 40],
  iconAnchor: [20, 40],
});

const destIcon = new L.Icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/1067/1067555.png',
  iconSize: [35, 35],
  iconAnchor: [17, 35],
});

const MapRefocuser = ({ center }: { center: [number, number] }) => {
  const map = useMap();
  useEffect(() => {
    if (center) map.flyTo(center, 15);
  }, [center, map]);
  return null;
};

const CustomerDashboard: React.FC = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const [delivery, setDelivery] = useState<any>(null);

  useEffect(() => {
    if (!orderId) return;
    const q = query(collection(db, 'deliveries'), where('order_id', '==', orderId));
    const unsub = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        setDelivery({ id: snap.docs[0].id, ...snap.docs[0].data() });
      }
    });
    return () => unsub();
  }, [orderId]);

  if (!delivery) {
    return (
      <div className="h-[calc(100vh-100px)] bg-[#0F172A] flex flex-col items-center justify-center p-8 text-center">
        <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-6"></div>
        <h2 className="text-2xl font-black text-white uppercase tracking-tighter">Locating Your Order</h2>
        <p className="text-slate-400 mt-2 font-medium">Synchronizing with live fleet GPS...</p>
      </div>
    );
  }

  const currentLoc = delivery.route?.[delivery.current_index || 0];
  const destLoc = delivery.end_location;
  const isArrivingSoon = delivery.eta_remaining < 10 && delivery.status !== 'delivered';

  return (
    <div className="h-[calc(100vh-100px)] bg-[#0F172A] text-slate-100 flex flex-col overflow-hidden rounded-[3rem] shadow-2xl border border-slate-800">
      
      {/* Header Panel */}
      <header className="p-8 bg-slate-900/50 backdrop-blur-xl border-b border-slate-800 flex justify-between items-center z-20">
        <div className="flex items-center gap-6">
           <button onClick={() => window.history.back()} className="p-3 bg-slate-800 hover:bg-slate-700 rounded-2xl transition-all"><MdChevronLeft size={24} /></button>
           <div>
             <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1">Live Shipment Tracking</p>
             <h2 className="text-3xl font-black tracking-tighter">#{delivery.order_id?.slice(-8)}</h2>
           </div>
        </div>
        
        {isArrivingSoon && (
          <div className="hidden md:flex items-center gap-4 bg-orange-500/10 border border-orange-500/30 px-6 py-3 rounded-2xl animate-pulse-subtle">
             <div className="w-3 h-3 bg-orange-500 rounded-full animate-ping"></div>
             <p className="text-sm font-black text-orange-400 uppercase tracking-widest">Arriving in {Math.round(delivery.eta_remaining)} Minutes</p>
          </div>
        )}
      </header>

      {/* Map Content */}
      <div className="flex-1 relative">
        <MapContainer 
           center={currentLoc ? [currentLoc.lat, currentLoc.lon] : [19.076, 72.877]} 
           zoom={15} 
           style={{ height: '100%', width: '100%', background: '#0F172A' }}
           zoomControl={false}
        >
          <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
          {currentLoc && <MapRefocuser center={[currentLoc.lat, currentLoc.lon]} />}
          {currentLoc && <Marker position={[currentLoc.lat, currentLoc.lon]} icon={driverIcon} />}
          {destLoc && <Marker position={[destLoc.lat, destLoc.lon]} icon={destIcon} />}
          {delivery.route && (
            <Polyline 
               positions={delivery.route.map((p: any) => [p.lat, p.lon])} 
               color="#3B82F6" 
               weight={6} 
               opacity={0.2} 
            />
          )}
        </MapContainer>

        {/* Floating Tracking Card */}
        <div className="absolute bottom-8 right-8 w-96 z-[1000] space-y-4">
          
          {isArrivingSoon && (
            <div className="bg-orange-600 text-white p-5 rounded-3xl shadow-2xl flex items-center gap-4 animate-in slide-in-from-bottom-10 duration-500">
               <MdAccessTime size={32} className="shrink-0" />
               <p className="text-sm font-black uppercase leading-tight">Driver is arriving in less than 10 minutes!</p>
            </div>
          )}

          <div className="bg-slate-900/90 backdrop-blur-2xl p-8 rounded-[2.5rem] border border-slate-700 shadow-[0_30px_60px_rgba(0,0,0,0.5)]">
            
            {/* Status Steps */}
            <div className="flex justify-between mb-8 relative">
              <div className="absolute top-2 left-0 w-full h-1 bg-slate-800 rounded-full"></div>
              <div className="absolute top-2 left-0 h-1 bg-blue-500 rounded-full transition-all duration-1000" 
                   style={{ width: delivery.status === 'delivered' ? '100%' : delivery.status === 'in_transit' || delivery.status === 'nearing' ? '75%' : '25%' }}></div>
              
              {['Placed', 'Dispatched', 'Transit', 'Delivered'].map((step, i) => {
                const isActive = (i === 0) || 
                               (i === 1 && ['dispatched', 'in_transit', 'nearing', 'delivered'].includes(delivery.status)) ||
                               (i === 2 && ['in_transit', 'nearing', 'delivered'].includes(delivery.status)) ||
                               (i === 3 && delivery.status === 'delivered');
                return (
                  <div key={step} className="relative z-10 flex flex-col items-center">
                    <div className={`w-5 h-5 rounded-full border-4 transition-all duration-500 ${isActive ? 'bg-blue-500 border-slate-900 scale-125' : 'bg-slate-800 border-slate-900'}`}></div>
                    <span className={`text-[9px] font-black uppercase mt-3 tracking-widest ${isActive ? 'text-blue-400' : 'text-slate-600'}`}>{step}</span>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center gap-5 mb-8">
              <div className="w-16 h-16 bg-blue-600/20 rounded-3xl flex items-center justify-center text-3xl">
                {delivery.status === 'delivered' ? '✅' : '🚚'}
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Status Overview</p>
                <h4 className="text-xl font-black text-white uppercase tracking-tight">
                  {delivery.status === 'nearing' ? 'Almost There!' : 
                   delivery.status === 'in_transit' ? 'In Transit' :
                   delivery.status === 'delivered' ? 'Delivered' : 'Processing'}
                </h4>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-8">
               <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700/50 text-center">
                 <p className="text-[9px] text-slate-500 font-black uppercase mb-1">Distance</p>
                 <p className="text-xl font-black text-white">{delivery.distance_remaining || '--'} <span className="text-[10px] text-slate-500">KM</span></p>
               </div>
               <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700/50 text-center">
                 <p className="text-[9px] text-slate-500 font-black uppercase mb-1">Arrival</p>
                 <p className="text-xl font-black text-emerald-400">~{Math.round(delivery.eta_remaining || 0)} <span className="text-[10px] text-emerald-600">MIN</span></p>
               </div>
            </div>

            <button className="w-full flex items-center justify-center gap-3 bg-blue-600 hover:bg-blue-500 text-white font-black py-5 rounded-2xl text-xs uppercase tracking-widest transition-all shadow-xl shadow-blue-500/20">
               <MdPhone size={18} /> Support Line
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CustomerDashboard;
