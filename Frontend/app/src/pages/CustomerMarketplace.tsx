import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../config/firebase';
import { collection, query, where, onSnapshot, getDocs } from 'firebase/firestore';
import { useApp } from '../context/AppContext';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import destPin from '../assets/destination_pin_v2.png';

const destIcon = new L.Icon({
  iconUrl: destPin,
  iconSize: [40, 40],
  iconAnchor: [20, 40],
  popupAnchor: [0, -40],
  shadowUrl: null
});

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
  const [customerName, setCustomerName] = useState('Guest User');
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
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
      data.sort((a, b) => (b.created_at?.seconds || 0) - (a.created_at?.seconds || 0));
      setMyShipments(data);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    let cancelled = false;

    const resolveCustomerName = async () => {
      if (!currentUser?.email) {
        setCustomerName('Guest User');
        return;
      }

      if (currentUser.displayName) {
        setCustomerName(currentUser.displayName);
        return;
      }

      try {
        const userSnap = await getDocs(query(collection(db, 'users'), where('email', '==', currentUser.email)));
        if (!cancelled && !userSnap.empty) {
          const userData = userSnap.docs[0].data();
          setCustomerName(userData.name || currentUser.email.split('@')[0] || 'Guest User');
          return;
        }
      } catch (error) {
        console.error('Failed to resolve customer name', error);
      }

      setCustomerName(currentUser.email.split('@')[0] || 'Guest User');
    };

    resolveCustomerName();
    return () => {
      cancelled = true;
    };
  }, [currentUser]);

  const placeOrder = async () => {
    if (!cart || !phone || !address) return;
    try {
      const data = await callApi('/orders/place', {
        method: 'POST',
        body: JSON.stringify({
          customer_name: customerName,
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
                    <p className="text-lg font-black text-emerald-400">{p.price_per_unit || p.unit_price || p.price ? `₹${p.price_per_unit || p.unit_price || p.price}` : 'Price N/A'}</p>
                    <p className="text-xs text-gray-400 uppercase">{p.quantity} units</p>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-slate-400">
                  <span>Price per unit</span>
                  <span>{p.price_per_unit || p.unit_price || p.price ? `₹${p.price_per_unit || p.unit_price || p.price}` : 'Not listed'}</span>
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
                        <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mt-2">{cart.price_per_unit || cart.unit_price || cart.price ? `Price / Unit: ₹${cart.price_per_unit || cart.unit_price || cart.price}` : 'Price not listed'}</p>
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
                    <div
                      className="flex-1 bg-[#0a0a0f] border border-gray-800 overflow-hidden"
                      style={{ borderRadius: '2rem', minHeight: 300 }}
                    >
                      <MapContainer center={[19.1136, 72.8697]} zoom={12} style={{ height: '100%', width: '100%' }}>
                        <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
                        <Marker 
                          position={[location.lat, location.lon]} 
                          icon={destIcon}
                          zIndexOffset={1000}
                        />
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
          </div>
        </section>
      </div>
    </div>
  );
};

export default CustomerMarketplace;
