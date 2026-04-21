import React, { useState } from 'react';
import { auth, db } from '../config/firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { useNavigate, useLocation } from 'react-router-dom';
import { MdLockOutline, MdEmail, MdSecurity, MdArrowForward } from 'react-icons/md';
import toast from 'react-hot-toast';

const Login = () => {
  const [email, setEmail] = useState('admin@supplychain.com');
  const [password, setPassword] = useState('password123'); // For demo
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const from = location.state?.from?.pathname || "/dashboard";

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      let userCredential;
      try {
        userCredential = await signInWithEmailAndPassword(auth, email, password);
      } catch (signInError) {
        // Fallback: If it's the demo admin and it fails, try to create it
        if (email === 'admin@supplychain.com') {
          const { createUserWithEmailAndPassword } = await import('firebase/auth');
          userCredential = await createUserWithEmailAndPassword(auth, email, password);
          toast.success("Demo Admin Provisioned");
        } else {
          throw signInError;
        }
      }
      
      const user = userCredential.user;

      // Ensure user document exists in Firestore (for demo convenience)
      const userDoc = await getDoc(doc(db, "users", user.uid));
      if (!userDoc.exists()) {
        await setDoc(doc(db, "users", user.uid), {
          email: user.email,
          role: user.email === 'admin@supplychain.com' ? 'admin' : 'staff',
          name: user.email.split('@')[0].toUpperCase(),
          status: 'active',
          created_at: serverTimestamp()
        });
      }

      toast.success(`Welcome back, Officer`);
      navigate(from, { replace: true });
    } catch (error) {
      console.error(error);
      toast.error("Invalid credentials or security clearance.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen w-screen bg-[#0F172A] flex items-center justify-center relative overflow-hidden">
      {/* Background Ambience */}
      <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-blue-600/10 blur-[150px] -z-10 rounded-full"></div>
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-indigo-600/10 blur-[120px] -z-10 rounded-full"></div>

      <div className="w-full max-w-md p-8 animate-fadeIn">
        <div className="text-center mb-10">
           <div className="inline-block p-4 bg-blue-600/10 border border-blue-500/20 rounded-2xl mb-4 shadow-xl shadow-blue-500/10">
              <MdSecurity size={40} className="text-blue-500" />
           </div>
           <h1 className="text-3xl font-black tracking-tighter text-white">SUPPLY<span className="text-blue-500">SHIELD</span></h1>
           <p className="text-slate-500 text-xs mt-2 font-mono uppercase tracking-[0.2em]">Neural Network Operational Hub</p>
        </div>

        <div className="card border-slate-700/50 bg-slate-800/20 backdrop-blur-xl p-8 shadow-2xl">
          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="text-[10px] uppercase font-black text-slate-500 mb-2 block tracking-widest">Identity Email</label>
              <div className="relative">
                 <MdEmail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                 <input 
                   type="email" required
                   className="w-full bg-slate-900 border border-slate-700 rounded-xl px-12 py-3 text-sm focus:border-blue-500 outline-none transition-all placeholder:text-slate-700" 
                   placeholder="operator@system.com"
                   value={email}
                   onChange={e => setEmail(e.target.value)}
                 />
              </div>
            </div>

            <div>
              <label className="text-[10px] uppercase font-black text-slate-500 mb-2 block tracking-widest">Protocol Code</label>
              <div className="relative">
                 <MdLockOutline className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                 <input 
                   type="password" required
                   className="w-full bg-slate-900 border border-slate-700 rounded-xl px-12 py-3 text-sm focus:border-blue-500 outline-none transition-all placeholder:text-slate-700" 
                   placeholder="••••••••"
                   value={password}
                   onChange={e => setPassword(e.target.value)}
                 />
              </div>
            </div>

            <button 
              type="submit" 
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-4 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-blue-600/30 transition-all active:scale-95"
            >
              {loading ? "INITIALIZING UPLINK..." : "INITIATE SESSION"} <MdArrowForward />
            </button>
          </form>

          <div className="mt-8 pt-8 border-t border-slate-700/50 text-center">
             <p className="text-[10px] text-slate-600 font-mono tracking-widest uppercase mb-4">Demo Credentials</p>
             <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-700/30 text-left">
                <p className="text-[10px] text-slate-400 mb-1 leading-none">ROOT ACCESS:</p>
                <p className="text-[11px] text-blue-400 font-mono">admin@supplychain.com / password123</p>
             </div>
          </div>
        </div>

        <p className="text-center mt-8 text-[9px] text-slate-600 uppercase font-black tracking-[0.3em]">
          Secure Neural Layer v0.1.0-RC
        </p>
      </div>
    </div>
  );
};

export default Login;
