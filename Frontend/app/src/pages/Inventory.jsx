import React, { useState, useEffect, useMemo } from 'react';
import { 
  collection, 
  query, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { 
  MdAdd, 
  MdSearch, 
  MdFilterList, 
  MdEdit, 
  MdDelete, 
  MdFileDownload,
  MdWarning,
  MdClose,
  MdInventory,
  MdLocationOn,
  MdCheckCircle
} from 'react-icons/md';
import toast from 'react-hot-toast';

const Inventory = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterLowStock, setFilterLowStock] = useState(false);
  const [selectedItems, setSelectedItems] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

  // Form State
  const [formData, setFormData] = useState({
    sku: '',
    name: '',
    quantity: '',
    reorder_level: '',
    warehouse: 'Main Hub'
  });

  useEffect(() => {
    const q = query(collection(db, "inventory"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setItems(data);
      setLoading(false);
    }, (error) => {
      console.error("Inventory sync error:", error);
      toast.error("Failed to load inventory");
    });
    return () => unsubscribe();
  }, []);

  const getStatus = (item) => {
    const q = Number(item.quantity);
    const r = Number(item.reorder_level);
    if (q === 0) return { label: 'OUT OF STOCK', class: 'bg-red-500/20 text-red-400 border-red-500/30' };
    if (q <= r) return { label: 'LOW STOCK', class: 'bg-amber-500/20 text-amber-400 border-amber-500/30' };
    return { label: 'IN STOCK', class: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' };
  };

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           item.sku.toLowerCase().includes(searchTerm.toLowerCase());
      const isLow = Number(item.quantity) <= Number(item.reorder_level);
      return matchesSearch && (!filterLowStock || isLow);
    });
  }, [items, searchTerm, filterLowStock]);

  const stats = useMemo(() => {
    const lowCount = items.filter(i => Number(i.quantity) <= Number(i.reorder_level) && Number(i.quantity) > 0).length;
    const outCount = items.filter(i => Number(i.quantity) === 0).length;
    return {
      totalSKUs: items.length,
      totalUnits: items.reduce((acc, i) => acc + Number(i.quantity) + Number(i.reserved_quantity || 0), 0),
      lowStock: lowCount,
      outOfStock: outCount
    };
  }, [items]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (formData.quantity < 0 || formData.reorder_level < 0) {
      return toast.error("Values must be positive");
    }

    try {
      const itemData = {
        ...formData,
        quantity: Number(formData.quantity),
        reorder_level: Number(formData.reorder_level),
        updated_at: serverTimestamp()
      };

      if (editingItem) {
        await updateDoc(doc(db, "inventory", editingItem.id), itemData);
        toast.success("SKU Updated");
      } else {
        await addDoc(collection(db, "inventory"), { ...itemData, created_at: serverTimestamp() });
        toast.success("SKU Added");
      }
      setShowModal(false);
      resetForm();
    } catch (err) {
      toast.error("Process failed");
    }
  };

  const resetForm = () => {
    setFormData({ sku: '', name: '', quantity: '', reorder_level: '', warehouse: 'Main Hub' });
    setEditingItem(null);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this inventory record?")) return;
    try {
      await deleteDoc(doc(db, "inventory", id));
      toast.success("Record deleted");
    } catch (err) {
      toast.error("Delete failed");
    }
  };

  const exportCSV = () => {
    const headers = ["SKU,Name,Quantity,Warehouse,Reorder Level,Status"];
    const rows = filteredItems.map(i => {
      const status = getStatus(i).label;
      return `${i.sku},${i.name},${i.quantity},${i.warehouse},${i.reorder_level},${status}`;
    });
    const csvContent = "data:text/csv;charset=utf-8," + headers.concat(rows).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `inventory_report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const toggleSelectAll = () => {
    if (selectedItems.length === filteredItems.length) setSelectedItems([]);
    else setSelectedItems(filteredItems.map(i => i.id));
  };

  const toggleSelect = (id) => {
    setSelectedItems(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const paginatedItems = filteredItems.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <div className="space-y-6 animate-fadeIn pb-10">
      {/* Low Stock Banner */}
      {(stats.lowStock > 0 || stats.outOfStock > 0) && (
        <div 
          onClick={() => setFilterLowStock(!filterLowStock)}
          className={`sticky top-0 z-30 flex items-center justify-between p-4 rounded-xl border cursor-pointer transition-all ${
            filterLowStock ? 'bg-amber-500 text-white border-amber-400' : 'bg-amber-500/10 text-amber-500 border-amber-500/20 backdrop-blur-md'
          }`}
        >
          <div className="flex items-center gap-3">
            <MdWarning className="text-xl animate-pulse" />
            <span className="font-bold text-sm tracking-wide">
              ATTENTION: {stats.lowStock + stats.outOfStock} items require immediate restocking
            </span>
          </div>
          <span className="text-[10px] font-black uppercase tracking-tighter bg-amber-900/20 px-2 py-1 rounded">
            {filterLowStock ? 'Show All' : 'Filter Low Stock'}
          </span>
        </div>
      )}

      <header className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Stock Inventory</h1>
          <p className="text-slate-400 mt-1">Global SKU tracking and warehouse lifecycle management.</p>
        </div>
        <div className="flex gap-3">
          <button onClick={exportCSV} className="btn-secondary flex items-center gap-2">
            <MdFileDownload /> Export CSV
          </button>
          <button 
            onClick={() => { resetForm(); setShowModal(true); }}
            className="btn-primary flex items-center gap-2"
          >
            <MdAdd /> Create Record
          </button>
        </div>
      </header>

      {/* Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'Total SKUs', value: stats.totalSKUs, icon: MdInventory, color: 'text-blue-500' },
          { label: 'Units in Stock', value: stats.totalUnits, icon: MdCheckCircle, color: 'text-emerald-500' },
          { label: 'Low Stock', value: stats.lowStock, icon: MdWarning, color: 'text-amber-500' },
          { label: 'Out of Stock', value: stats.outOfStock, icon: MdClose, color: 'text-red-500' },
        ].map((stat, i) => (
          <div key={i} className="card flex items-center justify-between p-4 bg-slate-800/40 border-slate-700/50">
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-500 mb-1">{stat.label}</p>
              <h4 className="text-2xl font-bold">{stat.value}</h4>
            </div>
            <div className={`p-3 rounded-lg bg-slate-900/50 ${stat.color}`}>
              <stat.icon size={20} />
            </div>
          </div>
        ))}
      </div>

      {/* Table Section */}
      <div className="card p-0 overflow-hidden border-slate-700/50 shadow-2xl">
        <div className="p-4 bg-slate-800/30 border-b border-slate-700/50 flex flex-wrap gap-4 items-center justify-between">
          <div className="relative flex-1 min-w-[300px]">
            <MdSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={20} />
            <input 
              type="text" 
              placeholder="Search by SKU or Product Name..." 
              className="input-field w-full pl-10"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-4">
            {selectedItems.length > 0 && (
              <div className="flex items-center gap-2 animate-fadeIn">
                 <span className="text-xs text-blue-400 font-bold">{selectedItems.length} selected</span>
                 <button className="text-[10px] bg-blue-600/20 text-blue-400 border border-blue-500/30 px-2 py-1 rounded">Update Qty</button>
              </div>
            )}
            <div className="h-8 w-px bg-slate-700mx-2"></div>
            <button className="p-2 hover:bg-slate-700 rounded-lg text-slate-400"><MdFilterList size={20}/></button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-900/50 text-slate-500 text-[10px] uppercase font-black tracking-[0.1em] border-b border-slate-700">
                <th className="px-6 py-4 w-10">
                  <input type="checkbox" className="accent-blue-500" checked={selectedItems.length === filteredItems.length && items.length > 0} onChange={toggleSelectAll} />
                </th>
                <th className="px-6 py-4">SKU / ID</th>
                <th className="px-6 py-4">Product Specification</th>
                <th className="px-6 py-4">Stock Level</th>
                <th className="px-6 py-4">Location</th>
                <th className="px-6 py-4">Status Flag</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/30">
              {paginatedItems.map((item) => (
                <tr key={item.id} className="hover:bg-slate-700/20 transition-colors group">
                  <td className="px-6 py-4">
                    <input type="checkbox" className="accent-blue-500" checked={selectedItems.includes(item.id)} onChange={() => toggleSelect(item.id)} />
                  </td>
                  <td className="px-6 py-4 font-mono text-xs text-blue-400 font-bold">{item.sku}</td>
                  <td className="px-6 py-4">
                    <div className="font-bold text-sm text-slate-200">{item.name}</div>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <span className="font-mono font-bold text-white">{item.quantity}</span>
                    <span className="text-slate-500 text-[10px] ml-1">/ {item.reorder_level}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1.5 text-xs text-slate-400">
                      <MdLocationOn className="text-slate-600" />
                      {item.warehouse}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`badge py-1 px-3 ${getStatus(item).class}`}>
                      {getStatus(item).label}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => { setEditingItem(item); setFormData(item); setShowModal(true); }}
                        className="p-2 hover:bg-blue-500/10 text-blue-400 rounded-lg"
                      >
                        <MdEdit size={18} />
                      </button>
                      <button 
                        onClick={() => handleDelete(item.id)}
                        className="p-2 hover:bg-red-500/10 text-red-400 rounded-lg"
                      >
                        <MdDelete size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="p-4 border-t border-slate-700/50 flex justify-between items-center bg-slate-900/20">
          <p className="text-xs text-slate-500">
            Showing {Math.min(filteredItems.length, (currentPage-1)*itemsPerPage + 1)} to {Math.min(filteredItems.length, currentPage*itemsPerPage)} of {filteredItems.length} SKUs
          </p>
          <div className="flex gap-2">
            <button 
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(p => p - 1)}
              className="p-2 border border-slate-700 rounded-lg hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Back
            </button>
            <button 
              disabled={currentPage * itemsPerPage >= filteredItems.length}
              onClick={() => setCurrentPage(p => p + 1)}
              className="p-2 border border-slate-700 rounded-lg hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Creation Modal */}
      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowModal(false)}></div>
          <div className="relative w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden animate-slideIn">
            <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-800/20">
              <h2 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent">
                {editingItem ? 'Edit SKU Record' : 'Initialize New SKU'}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-slate-500 hover:text-white"><MdClose size={24}/></button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="text-[10px] uppercase font-bold text-slate-500 mb-1 block">Product Name</label>
                  <input 
                    type="text" required
                    className="input-field w-full" 
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-slate-500 mb-1 block">SKU Code</label>
                  <input 
                    type="text" required
                    className="input-field w-full font-mono" 
                    placeholder="E.g. SK-1002"
                    value={formData.sku}
                    onChange={e => setFormData({...formData, sku: e.target.value.toUpperCase()})}
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-slate-500 mb-1 block">Warehouse Location</label>
                  <select 
                    className="input-field w-full"
                    value={formData.warehouse}
                    onChange={e => setFormData({...formData, warehouse: e.target.value})}
                  >
                    <option>Main Hub</option>
                    <option>Cold Storage</option>
                    <option>Distribution A</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-slate-500 mb-1 block">Current Quantity</label>
                  <input 
                    type="number" required min="0"
                    className="input-field w-full" 
                    value={formData.quantity}
                    onChange={e => setFormData({...formData, quantity: e.target.value})}
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-slate-500 mb-1 block">Reorder Level</label>
                  <input 
                    type="number" required min="1"
                    className="input-field w-full" 
                    value={formData.reorder_level}
                    onChange={e => setFormData({...formData, reorder_level: e.target.value})}
                  />
                </div>
              </div>
              <div className="pt-4 flex gap-3">
                <button 
                  type="button" 
                  onClick={() => setShowModal(false)}
                  className="flex-1 py-3 border border-slate-700 rounded-xl text-slate-400 font-bold hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="flex-1 py-3 bg-blue-600 rounded-xl text-white font-bold hover:bg-blue-700 shadow-lg shadow-blue-600/30"
                >
                  {editingItem ? 'Keep Changes' : 'Initialize SKU'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Inventory;
