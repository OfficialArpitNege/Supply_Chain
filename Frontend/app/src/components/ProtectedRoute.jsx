import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { MdSecurity, MdLock } from 'react-icons/md';

const ProtectedRoute = ({ children, allowedRoles = [] }) => {
  const { currentUser, userRole, loading } = useApp();
  const location = useLocation();

  if (loading) return (
    <div className="h-screen flex items-center justify-center bg-[#0F172A]">
       <div className="flex flex-col items-center gap-4">
          <MdSecurity className="text-blue-500 animate-pulse" size={48} />
          <p className="text-slate-500 font-black uppercase tracking-widest text-[10px]">Neural Security Handshake...</p>
       </div>
    </div>
  );

  if (!currentUser) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const hasAccess = allowedRoles.length === 0 || allowedRoles.includes(userRole);

  if (!hasAccess) {
    return (
      <div className="h-full flex items-center justify-center animate-fadeIn">
        <div className="card max-w-md text-center p-12 border-red-500/20 bg-red-500/5">
          <div className="inline-block p-4 bg-red-500/10 rounded-full mb-6">
            <MdLock className="text-red-500" size={48} />
          </div>
          <h2 className="text-2xl font-bold mb-2 text-white">Access Violation</h2>
          <p className="text-slate-400 text-sm leading-relaxed mb-8">
            Your security profile <span className="text-red-400 font-black uppercase font-mono">[{userRole}]</span> does not have authorization to view this operational sector. This event has been logged.
          </p>
          <button 
            onClick={() => {
              if (userRole === 'admin') window.location.href = '/admin-dashboard';
              else if (userRole === 'supplier') window.location.href = '/supplier-dashboard';
              else if (userRole === 'customer') window.location.href = '/customer-dashboard';
              else if (userRole === 'driver') window.location.href = '/driver-dashboard';
              else window.location.href = '/login';
            }}
            className="px-8 py-3 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl transition-all"
          >
            Safe Egress to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return children;
};

export default ProtectedRoute;
