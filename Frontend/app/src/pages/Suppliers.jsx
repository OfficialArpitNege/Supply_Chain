import React, { useState, useEffect, useMemo } from 'react';
import { 
  collection, 
  query, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  doc, 
  serverTimestamp,
  orderBy 
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { 
  LineChart, 
  Line, 
  ResponsiveContainer 
} from 'recharts';
import { 
  MdAdd, 
  MdSearch, 
  MdStar, 
  MdEmail, 
  MdPhone, 
  MdSchedule,
  MdHistory,
  MdClose,
  MdFilterList,
  MdWork,
  MdFactCheck,
  MdEdit
} from 'react-icons/md';
import toast from 'react-hot-toast';

const Suppliers = () => {
  const [suppliers, setSuppliers] = useState([]);
  const [pos, setPos] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [ratingFilter, setRatingFilter] = useState(0);
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [showPOModal, setShowPOModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [selectedSupplier, setSelectedSupplier] = useState(null);

  const [supplierForm, setSupplierForm] = useState({
    name: '', contact_email: '', phone: '', lead_time: 5, rating: 5, status: 'Active'
  });

  const [poForm, setPoForm] = useState({
    supplier_id: '', items: '', quantity: 1, status: 'Pending'
  });

  useEffect(() => {
    const unsubSuppliers = onSnapshot(query(collection(db, "suppliers")), (snapshot) => {
      setSuppliers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    const unsubPOs = onSnapshot(query(collection(db, "purchase_orders"), orderBy("created_at", "desc")), (snapshot) => {
      setPos(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => { unsubSuppliers(); unsubPOs(); };
  }, []);

  const filteredSuppliers = useMemo(() => {
    return suppliers.filter(s => 
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) && s.rating >= ratingFilter
    );
  }, [suppliers, searchTerm, ratingFilter]);

  const handleSaveSupplier = async (e) => {
    e.preventDefault();
    try {
      if (editingSupplier) {
        await updateDoc(doc(db, "suppliers", editingSupplier.id), supplierForm);
        toast.success("Supplier updated");
      } else {
        await addDoc(collection(db, "suppliers"), { ...supplierForm, created_at: serverTimestamp() });
        toast.success("Supplier added");
      }
      setShowSupplierModal(false);
      setSupplierForm({ name: '', contact_email: '', phone: '', lead_time: 5, rating: 5, status: 'Active' });
      setEditingSupplier(null);
    } catch (err) {
      toast.error("Operation failed");
    }
  };

  const handleCreatePO = async (e) => {
    e.preventDefault();
    try {
      const selectedSup = suppliers.find(s => s.id === poForm.supplier_id);
      const poData = {
        ...poForm,
        po_number: `PO-${Math.floor(1000 + Math.random() * 9000)}`,
        supplier_name: selectedSup?.name || 'Unknown',
        created_at: serverTimestamp(),
        date: new Date().toISOString().split('T')[0]
      };
      await addDoc(collection(db, "purchase_orders"), poData);
      toast.success("Purchase Order Created");
      setShowPOModal(false);
      setPoForm({ supplier_id: '', items: '', quantity: 1, status: 'Pending' });
    } catch (err) {
      toast.error("PO Creation failed");
    }
  };

  const updatePOStatus = async (id, newStatus) => {
    try {
      await updateDoc(doc(db, "purchase_orders", id), { status: newStatus });
      toast.success(`PO ${newStatus}`);
    } catch (err) {
      toast.error("Update failed");
    }
  };

  // Dummy performance data for sparkline
  const sparkData = [
    { v: 40 }, { v: 45 }, { v: 38 }, { v: 42 }, { v: 50 }, { v: 48 }, { v: 55 }
  ];

  return (
    <div className="space-y-8 animate-fadeIn pb-20">
      <header className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Supplier Ecosystem</h1>
          <p className="text-slate-400 mt-1">Manage global vendors, lead times, and purchase fulfillment.</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => setShowPOModal(true)} className="btn-secondary flex items-center gap-2">
            <MdAdd /> Create PO
          </button>
          <button onClick={() => { setEditingSupplier(null); setShowSupplierModal(true); }} className="btn-primary flex items-center gap-2">
            <MdAdd /> Add Supplier
          </button>
        </div>
      </header>

      {/* Filter Bar */}
      <div className="flex flex-wrap gap-4 items-center bg-slate-800/20 p-4 rounded-xl border border-slate-700/50 backdrop-blur-sm">
        <div className="relative flex-1 min-w-[300px]">
          <MdSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={20} />
          <input 
            type="text" 
            placeholder="Search suppliers by name..." 
            className="input-field w-full pl-10"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-400 px-3 py-2 bg-slate-900/50 rounded-lg border border-slate-700">
          <MdFilterList /> Rating:
          <select 
            className="bg-transparent outline-none text-blue-400 font-bold"
            value={ratingFilter}
            onChange={e => setRatingFilter(Number(e.target.value))}
          >
            <option value="0">All Ratings</option>
            <option value="4">4+ Stars</option>
            <option value="5">5 Stars</option>
          </select>
        </div>
      </div>

      {/* Supplier Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredSuppliers.map(supplier => (
          <div 
            key={supplier.id}
            onClick={() => setSelectedSupplier(supplier)}
            className={`card group hover:border-blue-500/50 transition-all cursor-pointer relative overflow-hidden ${selectedSupplier?.id === supplier.id ? 'border-blue-500 ring-1 ring-blue-500' : ''}`}
          >
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-lg font-bold group-hover:text-blue-400 transition-colors">{supplier.name}</h3>
                <div className="flex items-center gap-1 mt-1">
                  {[...Array(5)].map((_, i) => (
                    <MdStar key={i} className={i < supplier.rating ? 'text-amber-500' : 'text-slate-700'} />
                  ))}
                </div>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-black ${supplier.status === 'Active' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-700 text-slate-400'}`}>
                {supplier.status.toUpperCase()}
              </span>
            </div>

            <div className="space-y-3 mb-6">
              <div className="flex items-center gap-3 text-xs text-slate-400">
                <MdEmail className="text-slate-600" /> {supplier.contact_email}
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 flex items-center gap-1"><MdSchedule /> Lead Time:</span>
                <span className="font-mono text-white font-bold">{supplier.lead_time} days</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 flex items-center gap-1"><MdWork /> Active POs:</span>
                <span className="font-mono text-blue-400 font-bold">{pos.filter(p => p.supplier_id === supplier.id && p.status !== 'Delivered').length}</span>
              </div>
            </div>

            {/* Sparkline */}
            <div className="h-12 w-full mt-4 border-t border-slate-700/30 pt-2 opacity-50 group-hover:opacity-100 transition-opacity">
              <p className="text-[8px] uppercase font-black text-slate-600 mb-1 tracking-widest">Delivery Performance</p>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={sparkData}>
                  <Line type="monotone" dataKey="v" stroke="#3B82F6" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            
            <button 
              onClick={(e) => { e.stopPropagation(); setEditingSupplier(supplier); setSupplierForm(supplier); setShowSupplierModal(true); }}
              className="absolute top-4 right-4 p-2 bg-slate-900 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:text-blue-400"
            >
              <MdEdit size={16} />
            </button>
          </div>
        ))}
      </div>

      {/* PO History / Details for Selected Supplier */}
      {selectedSupplier && (
        <div className="space-y-6 animate-fadeIn">
          <div className="flex items-center justify-between border-b border-slate-700 pb-2">
             <h3 className="text-xl font-bold flex items-center gap-2">
               <MdHistory className="text-blue-500" /> Operational History: {selectedSupplier.name}
             </h3>
             <button onClick={() => setSelectedSupplier(null)} className="text-slate-500 hover:text-white"><MdClose size={20}/></button>
          </div>
          <div className="card p-0 overflow-hidden border-slate-700/50">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-900/50 text-[10px] uppercase font-black text-slate-500 tracking-wider">
                  <th className="px-6 py-4">PO Number</th>
                  <th className="px-6 py-4">Fulfillment Units</th>
                  <th className="px-6 py-4">Dispatch Date</th>
                  <th className="px-6 py-4">Lifecycle Status</th>
                  <th className="px-6 py-4 text-right">Fulfillment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {pos.filter(p => p.supplier_id === selectedSupplier.id).map(po => (
                  <tr key={po.id} className="hover:bg-slate-700/20 transition-colors">
                    <td className="px-6 py-4 font-mono text-xs text-blue-400 font-bold">{po.po_number}</td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-bold text-slate-200">{po.items}</div>
                      <div className="text-[10px] text-slate-500">Qty: {po.quantity} units</div>
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-400">{po.date}</td>
                    <td className="px-6 py-4">
                      <span className={`badge ${po.status === 'Delivered' ? 'badge-low' : po.status === 'Approved' ? 'bg-blue-500/10 text-blue-400' : 'bg-slate-700 text-slate-400'}`}>
                        {po.status?.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {po.status === 'Pending' && (
                        <button onClick={() => updatePOStatus(po.id, 'Approved')} className="text-[10px] text-blue-400 font-bold hover:underline">Approve Dispatch</button>
                      )}
                      {po.status === 'Approved' && (
                        <button onClick={() => updateStatus(po.id, 'Delivered')} className="text-[10px] text-emerald-400 font-bold hover:underline">Mark Received</button>
                      )}
                    </td>
                  </tr>
                ))}
                {pos.filter(p => p.supplier_id === selectedSupplier.id).length === 0 && (
                  <tr>
                    <td colSpan="5" className="px-6 py-12 text-center text-slate-500 italic text-sm">No recorded fulfillment history for this vendor.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Master PO Table (Global View) */}
      {!selectedSupplier && (
        <section className="space-y-4">
          <h3 className="text-xl font-bold flex items-center gap-2">
            <MdFactCheck className="text-emerald-500" /> Active Purchase Fulfillment
          </h3>
          <div className="card p-0 overflow-hidden border-slate-700/50">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-900/50 text-[10px] uppercase font-black text-slate-500 tracking-wider">
                  <th className="px-6 py-4">PO #</th>
                  <th className="px-6 py-4">Source Vendor</th>
                  <th className="px-6 py-4">Units</th>
                  <th className="px-6 py-4">Dispatch</th>
                  <th className="px-6 py-4 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                {pos.slice(0, 8).map(po => (
                  <tr key={po.id} className="hover:bg-slate-700/20 transition-colors">
                    <td className="px-6 py-4 font-mono text-xs text-blue-400 font-bold">{po.po_number}</td>
                    <td className="px-6 py-4 text-sm font-bold text-white">{po.supplier_name}</td>
                    <td className="px-6 py-4 text-xs text-slate-300">{po.items} (x{po.quantity})</td>
                    <td className="px-6 py-4 text-xs text-slate-500">{po.date}</td>
                    <td className="px-6 py-4 text-right">
                       <span className={`badge ${po.status === 'Delivered' ? 'badge-low' : 'bg-slate-700 text-slate-400'}`}>
                        {po.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Supplier Modal */}
      {showSupplierModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowSupplierModal(false)}></div>
          <div className="relative w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl animate-slideIn">
            <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-800/20">
              <h2 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent">
                {editingSupplier ? 'Modify Vendor Record' : 'Register New Supplier'}
              </h2>
              <button onClick={() => setShowSupplierModal(false)} className="text-slate-500 hover:text-white"><MdClose size={24}/></button>
            </div>
            <form onSubmit={handleSaveSupplier} className="p-6 space-y-4">
              <div>
                <label className="text-[10px] uppercase font-bold text-slate-500 mb-1 block">Legal Entity Name</label>
                <input 
                  type="text" required
                  className="input-field w-full" 
                  value={supplierForm.name}
                  onChange={e => setSupplierForm({...supplierForm, name: e.target.value})}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] uppercase font-bold text-slate-500 mb-1 block">Contact Email</label>
                  <input 
                    type="email" required
                    className="input-field w-full" 
                    value={supplierForm.contact_email}
                    onChange={e => setSupplierForm({...supplierForm, contact_email: e.target.value})}
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-slate-500 mb-1 block">Phone Line</label>
                  <input 
                    type="tel" required
                    className="input-field w-full" 
                    value={supplierForm.phone}
                    onChange={e => setSupplierForm({...supplierForm, phone: e.target.value})}
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-slate-500 mb-1 block">Lead Time (Days)</label>
                  <input 
                    type="number" required min="1"
                    className="input-field w-full" 
                    value={supplierForm.lead_time}
                    onChange={e => setSupplierForm({...supplierForm, lead_time: Number(e.target.value)})}
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-slate-500 mb-1 block">Performance Rating</label>
                  <select 
                    className="input-field w-full"
                    value={supplierForm.rating}
                    onChange={e => setSupplierForm({...supplierForm, rating: Number(e.target.value)})}
                  >
                    {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} Stars</option>)}
                  </select>
                </div>
              </div>
              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setShowSupplierModal(false)} className="flex-1 py-3 border border-slate-700 rounded-xl text-slate-400 font-bold hover:bg-slate-800">Cancel</button>
                <button type="submit" className="flex-1 py-3 bg-blue-600 rounded-xl text-white font-bold hover:bg-blue-700 shadow-lg shadow-blue-600/30">
                  {editingSupplier ? 'Update Record' : 'Add to Directory'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PO Modal */}
      {showPOModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowPOModal(false)}></div>
          <div className="relative w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl animate-slideIn">
            <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-800/20">
              <h2 className="text-xl font-bold text-white">Issue Purchase Order</h2>
              <button onClick={() => setShowPOModal(false)} className="text-slate-500 hover:text-white"><MdClose size={24}/></button>
            </div>
            <form onSubmit={handleCreatePO} className="p-6 space-y-4">
              <div>
                <label className="text-[10px] uppercase font-bold text-slate-500 mb-1 block">Target Vendor</label>
                <select 
                  required
                  className="input-field w-full"
                  value={poForm.supplier_id}
                  onChange={e => setPoForm({...poForm, supplier_id: e.target.value})}
                >
                  <option value="">Select Supplier...</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name} ({s.rating}★)</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold text-slate-500 mb-1 block">Required Items</label>
                <input 
                  type="text" required
                  className="input-field w-full" 
                  placeholder="E.g. Raw Lithuim, Controller Boards..."
                  value={poForm.items}
                  onChange={e => setPoForm({...poForm, items: e.target.value})}
                />
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold text-slate-500 mb-1 block">Unit Quantity</label>
                <input 
                  type="number" required min="1"
                  className="input-field w-full" 
                  value={poForm.quantity}
                  onChange={e => setPoForm({...poForm, quantity: Number(e.target.value)})}
                />
              </div>
              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setShowPOModal(false)} className="flex-1 py-3 border border-slate-700 rounded-xl text-slate-400 font-bold hover:bg-slate-800">Discard</button>
                <button type="submit" className="flex-1 py-3 bg-emerald-600 rounded-xl text-white font-bold hover:bg-emerald-700 shadow-lg shadow-emerald-600/30 font-mono">
                  AUTHORIZE PO
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Suppliers;
