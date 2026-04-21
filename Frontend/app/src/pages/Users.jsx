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
  MdPersonAdd, 
  MdSearch, 
  MdSecurity, 
  MdVerifiedUser, 
  MdBlock, 
  MdHistory,
  MdCheck,
  MdClose,
  MdEmail,
  MdLayers,
  MdAdminPanelSettings
} from 'react-icons/md';
import toast from 'react-hot-toast';

const Users = () => {
  const [users, setUsers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: '', role: 'staff', name: '' });

  const roles = ['admin', 'manager', 'staff', 'viewer'];

  const permissions = [
    { module: 'Dashboard', admin: true, manager: true, staff: true, viewer: true },
    { module: 'Inventory', admin: true, manager: true, staff: true, viewer: 'Read-only' },
    { module: 'Logistics', admin: true, manager: true, staff: true, viewer: false },
    { module: 'Suppliers', admin: true, manager: true, staff: false, viewer: false },
    { module: 'AI Insights', admin: true, manager: true, staff: false, viewer: false },
    { module: 'Users & RBAC', admin: true, manager: false, staff: false, viewer: false },
    { module: 'Automation', admin: true, manager: false, staff: false, viewer: false },
  ];

  useEffect(() => {
    const q = query(collection(db, "users"), orderBy("created_at", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, () => toast.error("RBAC Sync Failure"));
    return () => unsubscribe();
  }, []);

  const handleUpdateRole = async (userId, newRole) => {
    try {
      await updateDoc(doc(db, "users", userId), { role: newRole, updated_at: serverTimestamp() });
      toast.success(`Role escalated to ${newRole}`);
    } catch (err) {
      toast.error("Permission update failed");
    }
  };

  const handleInvite = async (e) => {
    e.preventDefault();
    try {
      await addDoc(collection(db, "users"), {
        ...inviteForm,
        status: 'pending',
        last_active: 'Never',
        created_at: serverTimestamp()
      });
      toast.success("Identity invitation sent");
      setShowInviteModal(false);
      setInviteForm({ email: '', role: 'staff', name: '' });
    } catch (err) {
      toast.error("Invite delivery failed");
    }
  };

  const filteredUsers = useMemo(() => {
    return users.filter(u => u.name?.toLowerCase().includes(searchTerm.toLowerCase()) || u.email.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [users, searchTerm]);

  return (
    <div className="space-y-8 animate-fadeIn pb-20">
      <header className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Identity & Access</h1>
          <p className="text-slate-400 mt-1">Manage personnel, role assignments, and system-wide visibility controls.</p>
        </div>
        <button 
          onClick={() => setShowInviteModal(true)}
          className="btn-primary flex items-center gap-2"
        >
          <MdPersonAdd /> Invite Operator
        </button>
      </header>

      <div className="grid grid-cols-12 gap-8">
        {/* User Table */}
        <div className="col-span-12 lg:col-span-8 flex flex-col gap-4">
           <div className="relative mb-4">
             <MdSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={20} />
             <input 
               type="text" 
               placeholder="Search by name or verified email..." 
               className="input-field w-full pl-10 bg-slate-800/40"
               value={searchTerm}
               onChange={e => setSearchTerm(e.target.value)}
             />
           </div>

           <div className="card p-0 overflow-hidden border-slate-700/50 shadow-2xl">
             <table className="w-full text-left">
               <thead>
                 <tr className="bg-slate-900/50 text-[10px] uppercase font-black text-slate-500 tracking-wider">
                   <th className="px-6 py-4">Security Profile</th>
                   <th className="px-6 py-4">Access Level</th>
                   <th className="px-6 py-4">State</th>
                   <th className="px-6 py-4">Last Sync</th>
                 </tr>
               </thead>
               <tbody className="divide-y divide-slate-700/30">
                 {filteredUsers.map(user => (
                    <tr key={user.id} className="hover:bg-slate-700/20 transition-colors group">
                       <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                             <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center border border-slate-700 text-blue-400 font-bold">
                                {user.name?.charAt(0) || 'U'}
                             </div>
                             <div>
                                <p className="text-sm font-bold text-white">{user.name || 'Incognito'}</p>
                                <p className="text-[10px] text-slate-500 font-mono">{user.email}</p>
                             </div>
                          </div>
                       </td>
                       <td className="px-6 py-4">
                          <select 
                            className="bg-slate-900 border border-slate-700 text-xs text-blue-400 font-bold px-3 py-1.5 rounded-lg outline-none cursor-pointer focus:border-blue-500 transition-colors"
                            value={user.role}
                            onChange={(e) => handleUpdateRole(user.id, e.target.value)}
                          >
                             {roles.map(r => <option key={r} value={r}>{r.toUpperCase()}</option>)}
                          </select>
                       </td>
                       <td className="px-6 py-4">
                          <span className={`badge py-1 ${user.status === 'pending' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' : 'badge-low'}`}>
                            {user.status === 'pending' ? <MdHistory className="mr-1" /> : <MdVerifiedUser className="mr-1" />}
                            {user.status?.toUpperCase() || 'ACTIVE'}
                          </span>
                       </td>
                       <td className="px-6 py-4 text-[10px] font-mono text-slate-500">
                          {user.last_active}
                       </td>
                    </tr>
                 ))}
               </tbody>
             </table>
           </div>
        </div>

        {/* Permissions Perspective */}
        <div className="col-span-12 lg:col-span-4 space-y-6">
           <div className="card border-blue-500/20 bg-blue-500/5">
              <h3 className="text-sm font-black text-blue-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                <MdAdminPanelSettings /> RBAC Matrix Perspective
              </h3>
              <div className="space-y-4">
                 {permissions.map((p, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-slate-900/50 rounded-xl border border-slate-700/50">
                       <span className="text-xs font-bold text-slate-300">{p.module}</span>
                       <div className="flex gap-2">
                          {roles.map(role => (
                            <div 
                              key={role}
                              className={`w-5 h-5 rounded-md flex items-center justify-center text-[8px] font-black uppercase ${
                                p[role] === true ? 'bg-emerald-500/20 text-emerald-500' : p[role] === 'Read-only' ? 'bg-amber-500/20 text-amber-500' : 'bg-slate-800 text-slate-600'
                              }`}
                              title={`${role}: ${p[role]}`}
                            >
                               {p[role] === true ? <MdCheck /> : p[role] === 'Read-only' ? 'R' : <MdClose />}
                            </div>
                          ))}
                       </div>
                    </div>
                 ))}
                 <div className="pt-4 mt-4 border-t border-slate-700/50 grid grid-cols-4 gap-1 text-[8px] font-black text-slate-600 uppercase text-center">
                    {roles.map(r => <span key={r}>{r}</span>)}
                 </div>
              </div>
           </div>

           <div className="card bg-slate-800/10 border-slate-700/30">
              <h4 className="text-xs font-bold text-slate-500 mb-3 uppercase tracking-tighter">Security Note</h4>
              <p className="text-[11px] text-slate-400 leading-relaxed italic">
                "Identity changes are effective across the global grid within 500ms. Unauthorized role escalation attempts are logged in the neural audit feed."
              </p>
           </div>
        </div>
      </div>

      {/* Invitation Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={() => setShowInviteModal(false)}></div>
          <div className="relative w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl animate-slideIn">
            <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-800/20">
              <h2 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent flex items-center gap-2">
                <MdPersonAdd /> Issue Access Invitation
              </h2>
              <button onClick={() => setShowInviteModal(false)} className="text-slate-500 hover:text-white"><MdClose size={24}/></button>
            </div>
            <form onSubmit={handleInvite} className="p-6 space-y-4">
              <div>
                <label className="text-[10px] uppercase font-bold text-slate-500 mb-1 block">Operator Full Name</label>
                <input 
                  type="text" required
                  className="input-field w-full" 
                  value={inviteForm.name}
                  onChange={e => setInviteForm({...inviteForm, name: e.target.value})}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="text-[10px] uppercase font-bold text-slate-500 mb-1 block">Verified Email</label>
                  <input 
                    type="email" required
                    className="input-field w-full" 
                    placeholder="operator@supplychain.com"
                    value={inviteForm.email}
                    onChange={e => setInviteForm({...inviteForm, email: e.target.value})}
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-[10px] uppercase font-bold text-slate-500 mb-1 block">Initial Security Role</label>
                  <div className="grid grid-cols-4 gap-2">
                    {roles.map(r => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setInviteForm({...inviteForm, role: r})}
                        className={`py-2 text-[9px] font-black uppercase rounded-lg border transition-all ${
                          inviteForm.role === r ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-600/30' : 'bg-slate-900 border-slate-700 text-slate-500'
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="pt-6 flex gap-3">
                <button type="button" onClick={() => setShowInviteModal(false)} className="flex-1 py-3 text-slate-500 font-bold hover:text-white">Discard</button>
                <button type="submit" className="flex-1 py-3 bg-blue-600 rounded-xl text-white font-bold hover:bg-blue-700 shadow-xl shadow-blue-600/20">
                  Transmit Invitation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Users;
