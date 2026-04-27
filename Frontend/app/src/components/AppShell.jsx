import React, { useState, useMemo } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  MdDashboard, 
  MdLocalShipping, 
  MdInventory, 
  MdPeople, 
  MdSettings, 
  MdAutoGraph, 
  MdPsychology,
  MdNotifications,
  MdLogout,
  MdMenu,
  MdChevronLeft,
  MdSecurity,
  MdTimeline,
  MdShoppingBag
} from 'react-icons/md';
import { useApp } from '../context/AppContext';

const navItems = [
  // Admin Only
  { path: '/admin-dashboard', label: 'Dashboard', icon: MdDashboard, roles: ['admin'] },
  { path: '/orders-lifecycle', label: 'Orders Lifecycle', icon: MdTimeline, roles: ['admin'] },
  { path: '/logistics', label: 'Logistics', icon: MdLocalShipping, roles: ['admin'] },
  { path: '/inventory', label: 'Inventory', icon: MdInventory, roles: ['admin'] },
  { path: '/suppliers', label: 'Suppliers', icon: MdPeople, roles: ['admin'] },
  { path: '/ai-insights', label: 'AI Insights', icon: MdPsychology, roles: ['admin'] },
  { path: '/automation', label: 'Automation', icon: MdAutoGraph, roles: ['admin'] },
  { path: '/users', label: 'User Management', icon: MdSettings, roles: ['admin'] },
  { path: '/disruptions', label: 'Disruptions & Rerouting', icon: MdSecurity, roles: ['admin'] },
  
  // Role Specific
  { path: '/supplier-dashboard', label: 'Supplier Portal', icon: MdInventory, roles: ['supplier'] },
  { path: '/driver-dashboard', label: 'Driver App', icon: MdLocalShipping, roles: ['driver'] },
  { path: '/customer-dashboard', label: 'Tracking Hub', icon: MdPsychology, roles: ['customer'] },
  { path: '/customer-orders-lifecycle', label: 'Order Lifecycle', icon: MdTimeline, roles: ['customer'] },
  { path: '/marketplace', label: 'Marketplace', icon: MdShoppingBag, roles: ['customer'] },
];

const AppShell = () => {
  const { currentUser, userRole, systemDemandLevel, activeDeliveriesCount, logout } = useApp();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const getDemandColor = (level) => {
    switch (level) {
      case 'HIGH': return 'text-red-400 bg-red-400/10 border-red-400/30';
      case 'MEDIUM': return 'text-amber-400 bg-amber-400/10 border-amber-400/30';
      default: return 'text-green-400 bg-green-400/10 border-green-400/30';
    }
  };

  const visibleNavItems = useMemo(() => {
    return navItems.filter(item => item.roles.includes(userRole));
  }, [userRole]);

  return (
    <div className="flex h-screen bg-background text-text-primary overflow-hidden">
      {/* Sidebar */}
      <aside 
        className={`${
          isSidebarCollapsed ? 'w-20' : 'w-64'
        } bg-[#1E293B] border-r border-slate-700 transition-all duration-300 flex flex-col z-20 shadow-[10px_0_30px_rgba(0,0,0,0.2)]`}
      >
        <div className="p-6 flex items-center justify-between">
          {!isSidebarCollapsed && (
            <h1 className="text-xl font-bold tracking-tight text-blue-400">SUPPLY<span className="text-white">SHIELD</span></h1>
          )}
          <button 
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 transition-colors"
          >
            {isSidebarCollapsed ? <MdMenu size={24} /> : <MdChevronLeft size={24} />}
          </button>
        </div>

        <nav className="flex-1 px-4 space-y-1 overflow-y-auto mt-4 custom-scrollbar">
          {visibleNavItems.map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`sidebar-nav-item ${isActive ? 'active' : ''} ${isSidebarCollapsed ? 'justify-center' : ''}`}
                title={isSidebarCollapsed ? item.label : ''}
              >
                <Icon size={24} className={isActive ? 'text-blue-400 font-bold' : 'text-slate-400'} />
                {!isSidebarCollapsed && <span className="font-medium">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-700">
          <button 
            onClick={logout}
            className={`flex items-center gap-3 w-full px-4 py-3 text-red-400 hover:bg-red-400/10 rounded-lg transition-all ${isSidebarCollapsed ? 'justify-center' : ''}`}
          >
            <MdLogout size={24} />
            {!isSidebarCollapsed && <span className="font-bold">Logout</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        {/* Background Glow */}
        <div className="absolute top-0 right-0 w-125 h-125 bg-blue-600/5 blur-[150px] -z-10 rounded-full"></div>
        <div className="absolute bottom-0 left-0 w-75 h-75 bg-indigo-600/5 blur-[100px] -z-10 rounded-full"></div>

        {/* Top Bar */}
        <header className="h-16 bg-[#1E293B]/80 backdrop-blur-md border-b border-slate-700 flex items-center justify-between px-8 z-10">
          <div className="flex items-center gap-6">
            <div className={`px-3 py-1 rounded-full border text-[10px] font-black uppercase flex items-center gap-2 ${getDemandColor(systemDemandLevel)}`}>
              <span className="relative flex h-2 w-2">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${systemDemandLevel === 'HIGH' ? 'bg-red-400' : 'bg-green-400'}`}></span>
                <span className={`relative inline-flex rounded-full h-2 w-2 ${systemDemandLevel === 'HIGH' ? 'bg-red-500' : 'bg-green-500'}`}></span>
              </span>
              LOGISTICS LOAD: {systemDemandLevel}
            </div>
            <div className="hidden md:flex items-center gap-2 text-slate-400 text-xs font-bold uppercase tracking-tighter">
              <MdLocalShipping className="text-blue-500" />
              IN TRANSIT: <span className="text-white font-mono">{activeDeliveriesCount}</span>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="relative cursor-pointer hover:text-blue-400 transition-colors">
              <MdNotifications size={22} className="text-slate-400" />
              <span className="absolute -top-1 -right-1 bg-red-500 text-[8px] font-black px-1.5 py-0.5 rounded-full border-2 border-[#1E293B]">
                3
              </span>
            </div>
            
            <div className="h-6 w-px bg-slate-700 mx-2"></div>

            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <p className="text-xs font-bold text-slate-200">{currentUser?.email?.split('@')[0].toUpperCase() || 'USER'}</p>
                <div className="flex items-center justify-end gap-1 mt-0.5">
                   <div className={`px-2 py-0.5 rounded-md border text-[8px] font-black uppercase tracking-widest ${
                     userRole === 'admin' ? 'bg-blue-500/10 border-blue-500/40 text-blue-400' :
                     userRole === 'supplier' ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400' :
                     userRole === 'driver' ? 'bg-orange-500/10 border-orange-500/40 text-orange-400' :
                     'bg-slate-500/10 border-slate-500/40 text-slate-400'
                   }`}>
                     {userRole}
                   </div>
                </div>
              </div>
              <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center font-bold text-blue-400 border border-slate-700 shadow-inner">
                {(currentUser?.email?.[0] || 'U').toUpperCase()}
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-8 relative custom-scrollbar">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AppShell;
