import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Polyline } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { db } from '../config/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';

const driverIcon = new L.Icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/2965/2965215.png',
  iconSize: [35, 35],
});

const destIcon = new L.Icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/3177/3177440.png',
  iconSize: [35, 35],
});

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
      <div className="min-h-screen bg-[#0a0a0f] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <h2 className="text-xl font-bold text-white">Locating your delivery...</h2>
        <p className="text-gray-500 mt-2">Enter your Order ID in the URL to track live.</p>
      </div>
    );
  }

  const currentLoc = delivery.route[delivery.current_index];
  const destLoc = delivery.end_location;

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-gray-100 flex flex-col">
      {/* Header */}
      <header className="p-6 bg-[#16161e] border-b border-gray-800">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-sm font-bold text-blue-400 uppercase tracking-widest">Live Tracking</h1>
            <h2 className="text-xl font-black">{delivery.order_id}</h2>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500 font-bold uppercase">Estimated Arrival</p>
            <h3 className="text-2xl font-black text-emerald-400">{delivery.eta_remaining} mins</h3>
          </div>
        </div>
      </header>

      {/* Map View */}
      <div className="flex-1 relative">
        <MapContainer center={[currentLoc.lat, currentLoc.lon]} zoom={14} style={{ height: '100%', width: '100%' }}>
          <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
          <Marker position={[currentLoc.lat, currentLoc.lon]} icon={driverIcon} />
          <Marker position={[destLoc.lat, destLoc.lon]} icon={destIcon} />
          {delivery.route && <Polyline positions={delivery.route.map((p: any) => [p.lat, p.lon])} color="#3b82f6" weight={5} opacity={0.4} dashArray="10, 10" />}
        </MapContainer>

        {/* Floating Status Card */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-[90%] max-w-md z-[1000]">
          <div className="bg-[#16161e] p-6 rounded-3xl border border-gray-800 shadow-[0_20px_50px_rgba(0,0,0,0.5)] backdrop-blur-xl">
            
            {/* Timeline Steps */}
            <div className="flex justify-between mb-8 relative">
              <div className="absolute top-1/2 left-0 w-full h-0.5 bg-gray-800 -translate-y-1/2 z-0"></div>
              <div className="absolute top-1/2 left-0 h-0.5 bg-blue-500 -translate-y-1/2 z-0 transition-all duration-1000" 
                   style={{ width: delivery.status === 'delivered' ? '100%' : delivery.status === 'in_transit' || delivery.status === 'nearing' ? '75%' : delivery.status === 'dispatched' ? '50%' : '25%' }}></div>
              
              {[
                { id: 'placed', label: 'Placed', active: true },
                { id: 'dispatched', label: 'Dispatched', active: ['dispatched', 'in_transit', 'nearing', 'delivered'].includes(delivery.status) },
                { id: 'transit', label: 'In Transit', active: ['in_transit', 'nearing', 'delivered'].includes(delivery.status) },
                { id: 'delivered', label: 'Delivered', active: delivery.status === 'delivered' }
              ].map((step, i) => (
                <div key={step.id} className="relative z-10 flex flex-col items-center">
                  <div className={`w-4 h-4 rounded-full border-2 transition-all duration-500 ${step.active ? 'bg-blue-500 border-blue-400 scale-125 shadow-[0_0_10px_rgba(59,130,246,0.5)]' : 'bg-[#0a0a0f] border-gray-700'}`}></div>
                  <span className={`text-[8px] font-bold uppercase mt-2 ${step.active ? 'text-blue-400' : 'text-gray-600'}`}>{step.label}</span>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 bg-blue-500/20 rounded-2xl flex items-center justify-center text-2xl animate-bounce">
                {delivery.status === 'delivered' ? '🎁' : '🚚'}
              </div>
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase">Live Status</p>
                <h4 className="text-lg font-black uppercase text-white tracking-tight">
                  {delivery.status === 'nearing' ? 'Driver is arriving now!' : 
                   delivery.status === 'in_transit' ? 'On the way to you' :
                   delivery.status === 'delivered' ? 'Order Delivered!' :
                   delivery.status.replace('_', ' ')}
                </h4>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-[#1c1c27] p-3 rounded-2xl border border-gray-800 text-center">
                <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">Distance</p>
                <p className="text-lg font-black text-white">{delivery.distance_remaining} <span className="text-[10px] text-gray-500">km</span></p>
              </div>
              <div className="bg-[#1c1c27] p-3 rounded-2xl border border-gray-800 text-center">
                <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">ETA</p>
                <p className="text-lg font-black text-emerald-400">{Math.round(delivery.eta_remaining)} <span className="text-[10px] text-emerald-600">min</span></p>
              </div>
            </div>
            
            <button className="w-full mt-6 bg-blue-600 hover:bg-blue-500 text-white font-black py-4 rounded-2xl text-xs uppercase tracking-widest transition-all shadow-lg shadow-blue-900/20">
               CONTACT LOGISTICS SUPPORT
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CustomerDashboard;
