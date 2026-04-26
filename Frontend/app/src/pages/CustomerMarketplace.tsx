import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../config/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { useApp } from '../context/AppContext';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const LocationPicker = ({ onLocationSelect }: { onLocationSelect: (lat: number, lon: number) => void }) => {
  useMapEvents({
    click(e) {
      onLocationSelect(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
};

const CustomerMarketplace: React.FC = () => {
  const [search, setSearch] = useState('');
  const [products, setProducts] = useState<any[]>([]);
  const [cart, setCart] = useState<any>(null);
  const [location, setLocation] = useState({ lat: 19.1136, lon: 72.8697 }); // Default Andheri
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [myShipments, setMyShipments] = useState<any[]>([]);
  const { callApi, currentUser } = useApp();
  const navigate = useNavigate();

  useEffect(() => {
    const delayDebounce = setTimeout(async () => {
      try {
        const data = await callApi(`/products/search?q=${search}`);
        setProducts(data);
      } catch (e: any) { console.error(e); }
    }, 300);
    return () => clearTimeout(delayDebounce);
  }, [search]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'deliveries'), (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      data.sort((a, b) => (b.created_at?.seconds || 0) - (a.created_at?.seconds || 0));
      setMyShipments(data);
    });
    return () => unsub();
  }, []);

  const placeOrder = async () => {
    if (!cart || !phone || !address) return;
    try {
      const data = await callApi('/orders/place', {
        method: 'POST',
        body: JSON.stringify({
          customer_name: currentUser?.displayName || 'Guest User',
          customer_id: currentUser?.uid,
          customer_phone: phone,
          customer_address: address,
          customer_location: location,
          items: [{
            sku: cart.sku,
            name: cart.name,
            quantity: quantity
          }],
          priority: 'normal'
        })
      });
      navigate(`/customer-dashboard`);
    } catch (e: any) { 
      console.error(e); 
      alert(e.message);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-gray-100 p-8">
      <div className="max-w-6xl mx-auto">
        <header className="mb-12 text-center">
          <h1 className="text-4xl font-black mb-4 uppercase tracking-tighter">Smart <span className="text-blue-500">Marketplace</span></h1>
          <div className="relative max-w-xl mx-auto">
            <input 
              value={search} 
              onChange={e => setSearch(e.target.value)}
              placeholder="Search products (e.g. Steel, Cement...)" 
              className="w-full bg-[#16161e] border border-gray-800 p-5 rounded-3xl text-lg focus:border-blue-500 outline-none shadow-2xl transition-all"
            />
            <div className="absolute right-6 top-1/2 -translate-y-1/2 text-gray-500 text-xl">🔍</div>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-16">
          {/* Product List */}
          <div className="lg:col-span-4 space-y-4">
            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-widest px-2">Available Results</h3>
            {products.length === 0 && <p className="text-gray-600 px-2 italic">No products found matching your search.</p>}
            {products.map(p => (
              <div key={p.id} onClick={() => { setCart(p); setQuantity(1); }} className={`p-6 rounded-2xl border transition-all cursor-pointer ${cart?.id === p.id ? 'bg-blue-600 border-blue-400 shadow-lg shadow-blue-900/20' : 'bg-[#16161e] border-gray-800 hover:border-gray-600'}`}>
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="text-lg font-black">{p.name}</h4>
                    <p className={`text-xs font-bold uppercase ${cart?.id === p.id ? 'text-blue-200' : 'text-gray-500'}`}>{p.sku}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-black text-emerald-400">In Stock</p>
                    <p className="text-xs text-gray-400 uppercase">{p.quantity} units</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Checkout Card */}
          <div className="lg:col-span-8">
            <div className="bg-[#16161e] p-8 rounded-[3rem] border border-gray-800 shadow-2xl h-full">
              <h3 className="text-2xl font-black mb-8 uppercase tracking-tighter">Configuration & Checkout</h3>
              {cart ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                  <div className="space-y-6">
                    <div className="bg-[#0a0a0f] p-6 rounded-3xl border border-gray-800">
                       <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Selected Item</p>
                       <p className="text-xl font-black text-white">{cart.name}</p>
                       <p className="text-xs text-blue-500 font-bold">{cart.sku}</p>
                    </div>
                    
                    <div className="space-y-4">
                      <div>
                        <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-2">Order Quantity</label>
                        <div className="flex items-center gap-4">
                          <input 
                            type="number"
                            min="1"
                            max={cart.quantity}
                            value={quantity}
                            onChange={e => setQuantity(Math.max(1, Math.min(cart.quantity, parseInt(e.target.value) || 1)))}
                            className="flex-1 bg-[#0a0a0f] border border-gray-800 p-4 rounded-2xl outline-none text-sm focus:border-blue-500 font-black text-white"
                          />
                          <div className="text-right px-4">
                             <p className="text-[8px] text-gray-500 uppercase font-black">Available</p>
                             <p className="text-sm font-black text-emerald-400">{cart.quantity} units</p>
                          </div>
                        </div>
                        {quantity > cart.quantity && (
                          <p className="text-red-500 text-[10px] mt-1 font-bold italic">Only {cart.quantity} units available</p>
                        )}
                      </div>

                      <div>
                        <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-2">Full Delivery Address</label>
                        <textarea 
                          value={address}
                          onChange={e => setAddress(e.target.value)}
                          placeholder="Room/Flat No, Building, Street, Landmark..."
                          className="w-full bg-[#0a0a0f] border border-gray-800 p-4 rounded-2xl outline-none text-sm focus:border-blue-500 h-24"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-2">Phone Number</label>
                        <input 
                          value={phone} 
                          onChange={e => setPhone(e.target.value)}
                          placeholder="+91-XXXXX-XXXXX" 
                          className="w-full bg-[#0a0a0f] border border-gray-800 p-4 rounded-2xl outline-none text-sm focus:border-blue-500"
                        />
                      </div>
                    </div>

                    <button 
                      onClick={placeOrder} 
                      disabled={quantity <= 0 || quantity > cart.quantity}
                      className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 disabled:text-gray-500 text-white font-black py-5 rounded-2xl shadow-xl shadow-blue-600/20 transition-all active:scale-95 uppercase tracking-widest text-xs"
                    >
                      DEPLOY ORDER
                    </button>
                  </div>

                  <div className="flex flex-col gap-4">
                    <div className="flex justify-between items-center px-2">
                       <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Pin Location on Map</label>
                       <p className="text-[10px] font-mono text-blue-400">{location.lat.toFixed(4)}, {location.lon.toFixed(4)}</p>
                    </div>
                    <div className="flex-1 bg-[#0a0a0f] rounded-[2rem] border border-gray-800 overflow-hidden min-h-[300px]">
                      <MapContainer center={[19.1136, 72.8697]} zoom={12} style={{ height: '100%', width: '100%' }}>
                        <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
                        <Marker position={[location.lat, location.lon]} />
                        <LocationPicker onLocationSelect={(lat, lon) => setLocation({ lat, lon })} />
                      </MapContainer>
                    </div>
                    <p className="text-[9px] text-gray-600 italic px-2">Click on the map to set your exact delivery coordinate for AI routing.</p>
                  </div>
                </div>
              ) : (
                <div className="text-center py-24 text-gray-600 italic">
                  <div className="text-4xl mb-4 opacity-20">🛒</div>
                  Select a product from the inventory to initialize the logistics protocol.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* --- My Shipments Section --- */}
        <section className="mt-20">
          <div className="flex justify-between items-end mb-8 px-4">
             <div>
               <h3 className="text-[10px] font-black text-blue-500 uppercase tracking-[0.3em] mb-2">Logistics Hub</h3>
               <h2 className="text-3xl font-black text-white tracking-tighter uppercase">My Shipments</h2>
             </div>
             <div className="text-[9px] font-black text-gray-500 uppercase tracking-widest">
               Live Tracking Enabled 📡
             </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {myShipments.length === 0 ? (
              <div className="col-span-full bg-[#16161e] p-12 rounded-[2.5rem] border border-gray-800 text-center">
                <p className="text-gray-500 italic">No active or historical shipments found.</p>
              </div>
            ) : (
              myShipments.map(s => (
                <div key={s.id} className="bg-[#16161e] border border-gray-800 p-8 rounded-[2.5rem] hover:border-blue-500/50 transition-all group">
                   <div className="flex justify-between items-start mb-6">
                      <div className="px-3 py-1 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                        <p className="text-[8px] font-black text-blue-400 uppercase tracking-widest">Shipment ID</p>
                        <p className="text-[10px] font-mono font-bold text-white tracking-tight">#{s.delivery_id?.slice(-8)}</p>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest ${s.status === 'delivered' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-orange-500/10 text-orange-400 border border-orange-500/20 animate-pulse-subtle'}`}>
                        {s.status}
                      </span>
                   </div>

                   <h4 className="text-xl font-black text-white mb-2 truncate">Global Transit Nexus</h4>
                   <p className="text-[10px] text-gray-500 mb-6 flex items-center gap-2 font-medium">
                     <span className="w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
                     {s.customer_address?.slice(0, 40)}...
                   </p>

                   <div className="grid grid-cols-2 gap-3 mb-8">
                      <div className="bg-[#0a0a0f] p-3 rounded-xl border border-gray-800/50 text-center">
                         <p className="text-[7px] text-gray-500 uppercase font-black">Progress</p>
                         <p className="text-sm font-black text-white">{s.progress || 0}%</p>
                      </div>
                      <div className="bg-[#0a0a0f] p-3 rounded-xl border border-gray-800/50 text-center">
                         <p className="text-[7px] text-gray-500 uppercase font-black">Arrival</p>
                         <p className="text-sm font-black text-orange-400">{s.status === 'delivered' ? 'REACHED' : `~${Math.round(s.eta_remaining || 0)}m`}</p>
                      </div>
                   </div>

                   <button 
                      onClick={() => navigate(`/track/${s.order_id}`)}
                      className="w-full py-4 bg-gray-800 group-hover:bg-blue-600 text-white rounded-2xl text-[9px] font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-3 shadow-lg shadow-black/20"
                   >
                     Track Live Tactical View
                   </button>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default CustomerMarketplace;
