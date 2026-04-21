import React, { useState, useEffect, useMemo } from 'react';
import { 
  collection, 
  query, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  doc, 
  serverTimestamp,
  orderBy,
  limit 
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { 
  MdAutoGraph, 
  MdAdd, 
  MdToggleOn, 
  MdToggleOff, 
  MdHistory, 
  MdClose,
  MdPlayArrow,
  MdSettings,
  MdNotificationsActive,
  MdWarning,
  MdInventory,
  MdLocalShipping
} from 'react-icons/md';
import toast from 'react-hot-toast';

const Automation = () => {
  const [rules, setRules] = useState([]);
  const [logs, setLogs] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    name: '', module: 'Inventory', field: 'quantity', operator: '<', value: '', action: 'Create PO', active: true
  });

  // 1. Data Subscriptions
  useEffect(() => {
    const unsubRules = onSnapshot(collection(db, "automation_rules"), (snap) => {
      setRules(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const unsubLogs = onSnapshot(query(collection(db, "automation_logs"), orderBy("fired_at", "desc"), limit(20)), (snap) => {
      setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const unsubInv = onSnapshot(collection(db, "inventory"), (snap) => {
      setInventory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const unsubDel = onSnapshot(collection(db, "deliveries"), (snap) => {
      setDeliveries(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => { unsubRules(); unsubLogs(); unsubInv(); unsubDel(); };
  }, []);

  // 2. Rule Execution Engine (Simulation)
  useEffect(() => {
    if (rules.length === 0) return;

    rules.filter(r => r.active).forEach(rule => {
      let triggeredItems = [];

      if (rule.module === 'Inventory') {
        triggeredItems = inventory.filter(item => {
          const val = Number(item[rule.field]);
          const target = Number(rule.value);
          if (rule.operator === '<') return val < target;
          if (rule.operator === '>') return val > target;
          if (rule.operator === '==') return val === target;
          return false;
        });
      } else if (rule.module === 'Logistics') {
        triggeredItems = deliveries.filter(del => {
          const val = del[rule.field];
          const target = rule.value;
          if (rule.operator === '==') return val === target;
          return false;
        });
      }

      triggeredItems.forEach(async (item) => {
        // Prevent double-firing: Check if log exists for this item + rule in last 1 hour
        const alreadyFired = logs.find(l => l.rule_id === rule.id && l.item_id === item.id && (new Date() - l.fired_at.toDate() < 3600000));
        if (alreadyFired) return;

        await fireRule(rule, item);
      });
    });
  }, [inventory, deliveries, rules]);

  const fireRule = async (rule, item) => {
    try {
      // 1. Log Execution
      await addDoc(collection(db, "automation_logs"), {
        rule_id: rule.id,
        rule_name: rule.name,
        item_id: item.id,
        condition: `${rule.field} ${rule.operator} ${rule.value}`,
        action_taken: rule.action,
        fired_at: serverTimestamp(),
        status: 'Success'
      });

      // 2. Execute Action
      if (rule.action === 'Create PO') {
        await addDoc(collection(db, "purchase_orders"), {
          po_number: `AUTO-PO-${Math.floor(1000 + Math.random() * 9000)}`,
          supplier_name: 'AUTO-GENERATE',
          items: item.name,
          quantity: item.reorder_level * 2,
          status: 'Pending',
          created_at: serverTimestamp(),
          date: new Date().toISOString().split('T')[0]
        });
        toast.success(`AUTO-PO: Triggered for ${item.name}`, { icon: '🤖' });
      } else if (rule.action === 'Send Alert') {
        toast.error(`CRITICAL: ${rule.name} - ${item.name || item.delivery_id}`, { duration: 6000, icon: '🚨' });
      } else {
        toast(`AUTOMATION: ${rule.action} executed for ${item.id}`, { icon: '⚡' });
      }
    } catch (err) {
      console.error("Rule fire error:", err);
    }
  };

  const toggleRule = async (id, currentStatus) => {
    await updateDoc(doc(db, "automation_rules", id), { active: !currentStatus });
    toast.success(`Rule ${!currentStatus ? 'Activated' : 'Suspended'}`);
  };

  const handleCreateRule = async (e) => {
    e.preventDefault();
    await addDoc(collection(db, "automation_rules"), { ...formData, created_at: serverTimestamp() });
    toast.success("Autonomous logic registered");
    setShowModal(false);
  };

  return (
    <div className="space-y-8 animate-fadeIn pb-20">
      <header className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Autonomous Command</h1>
          <p className="text-slate-400 mt-1">Configure neural triggers and automated system responses.</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2">
          <MdAdd /> Create Neural Rule
        </button>
      </header>

      <div className="grid grid-cols-12 gap-8">
        {/* Active Rules List */}
        <div className="col-span-12 lg:col-span-7 space-y-4">
           <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest pl-2">Active Protocols</h3>
           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {rules.map(rule => (
                <div key={rule.id} className={`card p-5 border-l-4 transition-all ${rule.active ? 'border-l-blue-500 bg-blue-500/5' : 'border-l-slate-700 opacity-60'}`}>
                   <div className="flex justify-between items-start mb-4">
                      <div>
                        <h4 className="font-bold text-white mb-1">{rule.name}</h4>
                        <p className="text-[10px] text-blue-400 font-mono uppercase italic">{rule.module}</p>
                      </div>
                      <button onClick={() => toggleRule(rule.id, rule.active)} className="text-2xl transition-colors">
                        {rule.active ? <MdToggleOn className="text-blue-500" /> : <MdToggleOff className="text-slate-600" />}
                      </button>
                   </div>
                   <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-700/50 mb-4">
                      <p className="text-[9px] text-slate-500 font-black uppercase mb-1">Trigger Condition</p>
                      <p className="text-xs text-slate-300 font-mono">IF {rule.field} {rule.operator} {rule.value}</p>
                   </div>
                   <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500">
                      <MdPlayArrow className="text-emerald-500" /> ACTION: <span className="text-white">{rule.action.toUpperCase()}</span>
                   </div>
                </div>
              ))}
              {rules.length === 0 && <div className="col-span-2 p-12 text-center text-slate-600 italic border-2 border-dashed border-slate-800 rounded-2xl">No autonomous protocols registered.</div>}
           </div>
        </div>

        {/* Execution Logs */}
        <div className="col-span-12 lg:col-span-5 flex flex-col gap-4">
           <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest pl-2">Neural Execution Log</h3>
           <div className="card p-0 overflow-hidden border-slate-700/50 flex-1">
              <div className="overflow-y-auto max-h-[600px] custom-scrollbar">
                <table className="w-full text-left">
                  <thead className="sticky top-0 bg-[#1E293B] z-10">
                    <tr className="text-[8px] uppercase font-black text-slate-500 tracking-wider border-b border-slate-700">
                      <th className="px-4 py-3">Timestamp</th>
                      <th className="px-4 py-3">Rule Path</th>
                      <th className="px-4 py-3">Action Output</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/30">
                    {logs.map(log => (
                      <tr key={log.id} className="hover:bg-slate-700/20 text-[10px] transition-colors">
                         <td className="px-4 py-3 text-slate-500 font-mono">
                            {log.fired_at?.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                         </td>
                         <td className="px-4 py-3">
                            <p className="font-bold text-slate-300">{log.rule_name}</p>
                            <p className="text-emerald-500/70 font-mono text-[8px]">{log.condition}</p>
                         </td>
                         <td className="px-4 py-3">
                            <span className="text-blue-400 font-black">{log.action_taken}</span>
                         </td>
                      </tr>
                    ))}
                    {logs.length === 0 && <tr><td colSpan="3" className="p-8 text-center text-slate-700">Waiting for trigger events...</td></tr>}
                  </tbody>
                </table>
              </div>
           </div>
        </div>
      </div>

      {/* Creation Modal */}
      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={() => setShowModal(false)}></div>
          <div className="relative w-full max-w-xl bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl animate-slideIn overflow-hidden">
            <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-800/20">
              <div className="flex items-center gap-3">
                 <div className="p-2 bg-blue-600 rounded-lg"><MdSettings className="text-white" /></div>
                 <h2 className="text-xl font-black text-white uppercase tracking-tighter">New Operational Protocol</h2>
              </div>
              <button onClick={() => setShowModal(false)} className="text-slate-500 hover:text-white"><MdClose size={24}/></button>
            </div>
            <form onSubmit={handleCreateRule} className="p-8 space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div className="col-span-2">
                  <label className="text-[10px] uppercase font-black text-slate-500 mb-2 block">Protocol Name</label>
                  <input 
                    type="text" required
                    className="input-field w-full" 
                    placeholder="E.g. Auto-Restock Alpha"
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                  />
                </div>
                
                <div>
                  <label className="text-[10px] uppercase font-black text-slate-500 mb-2 block">Module Trigger</label>
                  <select 
                    className="input-field w-full"
                    value={formData.module}
                    onChange={e => setFormData({...formData, module: e.target.value, field: e.target.value === 'Inventory' ? 'quantity' : 'risk_level'})}
                  >
                    <option>Inventory</option>
                    <option>Logistics</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] uppercase font-black text-slate-500 mb-2 block">Logic Case</label>
                  <div className="flex gap-2">
                    <select 
                      className="input-field flex-1"
                      value={formData.field}
                      onChange={e => setFormData({...formData, field: e.target.value})}
                    >
                      {formData.module === 'Inventory' ? (
                        <>
                          <option value="quantity">Quantity</option>
                          <option value="reorder_level">Reorder Level</option>
                        </>
                      ) : (
                        <>
                          <option value="risk_level">Risk Level</option>
                          <option value="status">Delivery Status</option>
                        </>
                      )}
                    </select>
                    <select 
                      className="input-field w-20"
                      value={formData.operator}
                      onChange={e => setFormData({...formData, operator: e.target.value})}
                    >
                      <option value="<">&lt;</option>
                      <option value=">">&gt;</option>
                      <option value="==">==</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] uppercase font-black text-slate-500 mb-2 block">Threshold Value</label>
                  <input 
                    type="text" required
                    className="input-field w-full font-mono" 
                    placeholder="E.g. 50 or HIGH"
                    value={formData.value}
                    onChange={e => setFormData({...formData, value: e.target.value})}
                  />
                </div>

                <div>
                  <label className="text-[10px] uppercase font-black text-slate-500 mb-2 block">System Response</label>
                  <select 
                    className="input-field w-full"
                    value={formData.action}
                    onChange={e => setFormData({...formData, action: e.target.value})}
                  >
                    <option>Create PO</option>
                    <option>Send Alert</option>
                    <option>Delay Dispatch</option>
                    <option>Flag Review</option>
                  </select>
                </div>
              </div>

              <div className="pt-6 flex gap-4">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 py-4 text-slate-500 font-bold hover:text-white uppercase text-xs tracking-widest">Abort</button>
                <button type="submit" className="flex-2 py-4 px-12 bg-blue-600 rounded-2xl text-white font-black hover:bg-blue-700 shadow-2xl shadow-blue-600/40 uppercase text-xs tracking-widest">
                  AUTHORIZE PROTOCOL
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Automation;
