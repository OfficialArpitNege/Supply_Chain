import React, { useState } from 'react';
import { auth, db } from '../config/firebase';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { useNavigate, Link } from 'react-router-dom';
import { MdPerson, MdEmail, MdLock, MdPhone, MdBusiness, MdLocationOn, MdDirectionsCar, MdBadge, MdArrowForward } from 'react-icons/md';
import toast from 'react-hot-toast';

const Signup = () => {
  const [role, setRole] = useState('customer');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // Common fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  // Role-specific fields
  const [companyName, setCompanyName] = useState(''); // Supplier
  const [defaultAddress, setDefaultAddress] = useState(''); // Customer
  const [vehicleType, setVehicleType] = useState('van'); // Driver
  const [licensePlate, setLicensePlate] = useState(''); // Driver

  const handleSignup = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      const userData = {
        user_id: user.uid,
        name,
        email,
        role,
        phone,
        created_at: serverTimestamp(),
      };

      if (role === 'supplier') {
        userData.company_name = companyName;
      } else if (role === 'customer') {
        userData.default_address = defaultAddress;
      } else if (role === 'driver') {
        userData.vehicle_type = vehicleType;
        userData.license_plate = licensePlate;
      }

      await setDoc(doc(db, "users", user.uid), userData);

      toast.success(`Account created as ${role.toUpperCase()}`);
      
      // Redirect based on role
      if (role === 'supplier') navigate('/supplier-dashboard');
      else if (role === 'customer') navigate('/customer-dashboard');
      else if (role === 'driver') navigate('/driver-dashboard');
      
    } catch (error) {
      console.error(error);
      toast.error(error.message || "Registration failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-screen bg-[#0F172A] flex items-center justify-center py-12 px-4 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-blue-600/10 blur-[150px] -z-10 rounded-full"></div>
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-indigo-600/10 blur-[120px] -z-10 rounded-full"></div>

      <div className="w-full max-w-lg animate-fadeIn">
        <div className="text-center mb-8">
           <h1 className="text-3xl font-black tracking-tighter text-white">JOIN <span className="text-blue-500">SUPPLYSHIELD</span></h1>
           <p className="text-slate-500 text-xs mt-2 font-mono uppercase tracking-[0.2em]">Initialize Operational Identity</p>
        </div>

        <div className="card border-slate-700/50 bg-slate-800/20 backdrop-blur-xl p-8 shadow-2xl">
          <div className="flex mb-8 bg-slate-900/50 p-1 rounded-xl border border-slate-700/50">
            {['customer', 'supplier', 'driver'].map((r) => (
              <button
                key={r}
                onClick={() => setRole(r)}
                className={`flex-1 py-2 text-[10px] uppercase font-black tracking-widest rounded-lg transition-all ${
                  role === r ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {r}
              </button>
            ))}
          </div>

          <form onSubmit={handleSignup} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] uppercase font-black text-slate-500 mb-1 block tracking-widest">Full Name</label>
                <div className="relative">
                   <MdPerson className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                   <input 
                     type="text" required
                     className="w-full bg-slate-900 border border-slate-700 rounded-xl px-11 py-2.5 text-sm focus:border-blue-500 outline-none transition-all text-white" 
                     placeholder="John Doe"
                     value={name}
                     onChange={e => setName(e.target.value)}
                   />
                </div>
              </div>
              <div>
                <label className="text-[10px] uppercase font-black text-slate-500 mb-1 block tracking-widest">Email Address</label>
                <div className="relative">
                   <MdEmail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                   <input 
                     type="email" required
                     className="w-full bg-slate-900 border border-slate-700 rounded-xl px-11 py-2.5 text-sm focus:border-blue-500 outline-none transition-all text-white" 
                     placeholder="john@example.com"
                     value={email}
                     onChange={e => setEmail(e.target.value)}
                   />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] uppercase font-black text-slate-500 mb-1 block tracking-widest">Password</label>
                <div className="relative">
                   <MdLock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                   <input 
                     type="password" required minLength={6}
                     className="w-full bg-slate-900 border border-slate-700 rounded-xl px-11 py-2.5 text-sm focus:border-blue-500 outline-none transition-all text-white" 
                     placeholder="••••••••"
                     value={password}
                     onChange={e => setPassword(e.target.value)}
                   />
                </div>
              </div>
              <div>
                <label className="text-[10px] uppercase font-black text-slate-500 mb-1 block tracking-widest">Phone Number</label>
                <div className="relative">
                   <MdPhone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                   <input 
                     type="tel" required
                     className="w-full bg-slate-900 border border-slate-700 rounded-xl px-11 py-2.5 text-sm focus:border-blue-500 outline-none transition-all text-white" 
                     placeholder="+1 234 567 890"
                     value={phone}
                     onChange={e => setPhone(e.target.value)}
                   />
                </div>
              </div>
            </div>

            {/* Role-Specific Fields */}
            {role === 'supplier' && (
              <div className="animate-slideIn">
                <label className="text-[10px] uppercase font-black text-slate-500 mb-1 block tracking-widest">Company Name</label>
                <div className="relative">
                   <MdBusiness className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                   <input 
                     type="text" required
                     className="w-full bg-slate-900 border border-slate-700 rounded-xl px-11 py-2.5 text-sm focus:border-blue-500 outline-none transition-all text-white" 
                     placeholder="Logistics Corp"
                     value={companyName}
                     onChange={e => setCompanyName(e.target.value)}
                   />
                </div>
              </div>
            )}

            {role === 'customer' && (
              <div className="animate-slideIn">
                <label className="text-[10px] uppercase font-black text-slate-500 mb-1 block tracking-widest">Default Delivery Address</label>
                <div className="relative">
                   <MdLocationOn className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                   <input 
                     type="text" required
                     className="w-full bg-slate-900 border border-slate-700 rounded-xl px-11 py-2.5 text-sm focus:border-blue-500 outline-none transition-all text-white" 
                     placeholder="123 Main St, New York"
                     value={defaultAddress}
                     onChange={e => setDefaultAddress(e.target.value)}
                   />
                </div>
              </div>
            )}

            {role === 'driver' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-slideIn">
                <div>
                  <label className="text-[10px] uppercase font-black text-slate-500 mb-1 block tracking-widest">Vehicle Type</label>
                  <div className="relative">
                     <MdDirectionsCar className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                     <select 
                       className="w-full bg-slate-900 border border-slate-700 rounded-xl px-11 py-2.5 text-sm focus:border-blue-500 outline-none transition-all text-white appearance-none"
                       value={vehicleType}
                       onChange={e => setVehicleType(e.target.value)}
                     >
                       <option value="bike">Bike</option>
                       <option value="van">Van</option>
                       <option value="truck">Truck</option>
                     </select>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] uppercase font-black text-slate-500 mb-1 block tracking-widest">License Plate</label>
                  <div className="relative">
                     <MdBadge className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                     <input 
                       type="text" required
                       className="w-full bg-slate-900 border border-slate-700 rounded-xl px-11 py-2.5 text-sm focus:border-blue-500 outline-none transition-all text-white" 
                       placeholder="ABC-1234"
                       value={licensePlate}
                       onChange={e => setLicensePlate(e.target.value)}
                     />
                  </div>
                </div>
              </div>
            )}

            <button 
              type="submit" 
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-3.5 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-blue-600/30 transition-all active:scale-95 mt-4"
            >
              {loading ? "CREATING IDENTITY..." : "CREATE ACCOUNT"} <MdArrowForward />
            </button>
          </form>

          <div className="mt-6 text-center">
             <p className="text-xs text-slate-500">
               Already have an account? <Link to="/login" className="text-blue-500 font-bold hover:underline">Sign In</Link>
             </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Signup;
