import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../config/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { useApp } from '../context/AppContext';

const CustomerMarketplace: React.FC = () => {
  const [search, setSearch] = useState('');
  const [products, setProducts] = useState<any[]>([]);
  const [cart, setCart] = useState<any>(null);
  const [location, setLocation] = useState({ lat: 19.1136, lon: 72.8697 }); // Default Andheri
  const [phone, setPhone] = useState('');
  const { callApi } = useApp();
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

  const placeOrder = async () => {
    if (!cart || !phone) return;
    try {
      const data = await callApi('/orders/place', {
        method: 'POST',
        body: JSON.stringify({
          customer_name: 'Guest User',
          customer_phone: phone,
          customer_location: location,
          items: [{
            sku: cart.sku,
            name: cart.name,
            quantity: 1
          }],
          priority: 'normal'
        })
      });
      navigate(`/track/${data.order_id}`);
    } catch (e: any) { 
      console.error(e); 
      alert(e.message);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-gray-100 p-8">
      <div className="max-w-4xl mx-auto">
        <header className="mb-12 text-center">
          <h1 className="text-4xl font-black mb-4">SMART <span className="text-blue-500">MARKETPLACE</span></h1>
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Product List */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-widest px-2">Available Results</h3>
            {products.length === 0 && <p className="text-gray-600 px-2 italic">No products found matching your search.</p>}
            {products.map(p => (
              <div key={p.id} onClick={() => setCart(p)} className={`p-6 rounded-2xl border transition-all cursor-pointer ${cart?.id === p.id ? 'bg-blue-600 border-blue-400 shadow-lg shadow-blue-900/20' : 'bg-[#16161e] border-gray-800 hover:border-gray-600'}`}>
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
          <div className="sticky top-8 h-fit">
            <div className="bg-[#16161e] p-8 rounded-3xl border border-gray-800 shadow-2xl">
              <h3 className="text-xl font-black mb-6">CHECKOUT</h3>
              {cart ? (
                <div className="space-y-6">
                  <div className="flex justify-between items-center bg-[#0a0a0f] p-4 rounded-2xl border border-gray-800">
                    <div>
                      <p className="text-xs text-gray-500 uppercase">Item</p>
                      <p className="font-bold">{cart.name}</p>
                    </div>
                    <button onClick={() => setCart(null)} className="text-gray-500 hover:text-red-500">✕</button>
                  </div>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="text-[10px] font-bold text-gray-500 uppercase">Delivery Location (City)</label>
                      <select onChange={e => {
                        const vals = e.target.value.split(',');
                        setLocation({ lat: Number(vals[0]), lon: Number(vals[1]) });
                      }} className="w-full bg-[#0a0a0f] border border-gray-800 p-3 rounded-xl outline-none text-sm">
                        <option value="19.1136,72.8697">Andheri (Mumbai)</option>
                        <option value="19.0596,72.8295">Bandra (Mumbai)</option>
                        <option value="19.1176,72.9060">Powai (Mumbai)</option>
                        <option value="19.0178,72.8478">Dadar (Mumbai)</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-gray-500 uppercase">Phone Number</label>
                      <input 
                        value={phone} 
                        onChange={e => setPhone(e.target.value)}
                        placeholder="+91-XXXXX-XXXXX" 
                        className="w-full bg-[#0a0a0f] border border-gray-800 p-3 rounded-xl outline-none text-sm focus:border-blue-500"
                      />
                    </div>
                  </div>

                  <button onClick={placeOrder} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-4 rounded-2xl shadow-xl transition-all active:scale-95">
                    PLACE ORDER NOW
                  </button>
                </div>
              ) : (
                <div className="text-center py-12 text-gray-600 italic">
                  Select a product to start your order.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CustomerMarketplace;
