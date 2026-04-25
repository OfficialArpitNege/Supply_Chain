import React, { useState, useEffect } from 'react';
import { db } from '../config/firebase';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { useApp } from '../context/AppContext';
import toast from 'react-hot-toast';

const SupplierDashboard: React.FC = () => {
  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [qty, setQty] = useState(0);
  const [price, setPrice] = useState(0);
  const [warehouseId, setWarehouseId] = useState('WH-001');
  const [requests, setRequests] = useState<any[]>([]);
  const { currentUser, callApi } = useApp();

  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, 'supplier_requests'), orderBy('created_at', 'desc')), (snap) => {
      setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const data = await callApi('/supplier/submit', {
        method: 'POST',
        body: JSON.stringify({
          supplier_id: currentUser?.uid || 'SUP-001',
          product_name: name,
          sku,
          quantity: qty,
          price_per_unit: price,
          warehouse_id: warehouseId
        })
      });
      setSku(''); setName(''); setQty(0); setPrice(0);
      toast.success('Replenishment request submitted!');
    } catch (e: any) { 
      console.error(e); 
      toast.error(e.message);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-gray-100 p-8">
      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8">
        
        {/* Submission Form */}
        <div className="col-span-1">
          <div className="bg-[#16161e] p-6 rounded-2xl border border-gray-800 shadow-xl">
            <h2 className="text-xl font-black mb-6 flex items-center gap-2">
               <span className="text-emerald-500">REPLENISH</span> INVENTORY
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-gray-500 uppercase">Product Name</label>
                <input value={name} onChange={e => setName(e.target.value)} className="w-full bg-[#0a0a0f] border border-gray-800 p-3 rounded-xl focus:border-emerald-500 outline-none" required />
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-500 uppercase">SKU</label>
                <input value={sku} onChange={e => setSku(e.target.value)} className="w-full bg-[#0a0a0f] border border-gray-800 p-3 rounded-xl focus:border-emerald-500 outline-none" required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-gray-500 uppercase">Quantity</label>
                  <input type="number" value={qty} onChange={e => setQty(Number(e.target.value))} className="w-full bg-[#0a0a0f] border border-gray-800 p-3 rounded-xl focus:border-emerald-500 outline-none" required />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-500 uppercase">Price/Unit</label>
                  <input type="number" value={price} onChange={e => setPrice(Number(e.target.value))} className="w-full bg-[#0a0a0f] border border-gray-800 p-3 rounded-xl focus:border-emerald-500 outline-none" required />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-500 uppercase">Warehouse</label>
                <select value={warehouseId} onChange={e => setWarehouseId(e.target.value)} className="w-full bg-[#0a0a0f] border border-gray-800 p-3 rounded-xl focus:border-emerald-500 outline-none">
                  <option value="WH-001">Mumbai Central Hub</option>
                  <option value="WH-002">Andheri DC</option>
                  <option value="WH-003">Navi Mumbai WH</option>
                </select>
              </div>
              <button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-4 rounded-xl shadow-lg shadow-emerald-900/20 transition-all">
                SUBMIT REQUEST
              </button>
            </form>
          </div>
        </div>

        {/* Request History */}
        <div className="col-span-2">
          <div className="bg-[#16161e] rounded-2xl border border-gray-800 overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-gray-800 bg-[#1c1c27]">
               <h3 className="text-sm font-bold uppercase tracking-widest">Submission History</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-[#0a0a0f] text-gray-500 font-bold uppercase text-[10px]">
                  <tr>
                    <th className="p-4">Request ID</th>
                    <th className="p-4">Product</th>
                    <th className="p-4">Qty</th>
                    <th className="p-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {requests.map(r => (
                    <tr key={r.id} className="hover:bg-gray-800/30">
                      <td className="p-4 font-mono text-emerald-400">{r.request_id}</td>
                      <td className="p-4">
                        <div className="font-bold">{r.product_name}</div>
                        <div className="text-[10px] text-gray-500">{r.sku}</div>
                      </td>
                      <td className="p-4">{r.quantity}</td>
                      <td className="p-4">
                        <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${r.status === 'approved' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default SupplierDashboard;
