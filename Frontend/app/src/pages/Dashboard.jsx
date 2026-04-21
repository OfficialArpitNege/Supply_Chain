import React, { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  onSnapshot, 
  where, 
  orderBy, 
  limit 
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line
} from 'recharts';
import { 
  MdLocalShipping, 
  MdTrendingUp, 
  MdWarning, 
  MdPeople, 
  MdSchedule,
  MdLocationOn
} from 'react-icons/md';
import { useApp } from '../context/AppContext';

const KPICard = ({ title, value, icon: Icon, color, loading }) => (
  <div className="card animate-fadeIn">
    {loading ? (
      <div className="animate-pulse space-y-3">
        <div className="h-4 bg-slate-700/50 rounded w-1/2"></div>
        <div className="h-8 bg-slate-700/50 rounded w-3/4"></div>
      </div>
    ) : (
      <div className="flex items-center justify-between">
        <div>
          <p className="text-slate-400 text-sm font-medium">{title}</p>
          <h3 className="text-3xl font-bold mt-1 tracking-tight">{value}</h3>
        </div>
        <div className={`p-4 rounded-xl bg-slate-900/50 ${color}`}>
          <Icon size={28} />
        </div>
      </div>
    )}
  </div>
);

const Dashboard = () => {
  const { systemDemandLevel } = useApp();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    activeDeliveries: 0,
    lowStock: 0,
    suppliers: 0
  });
  const [deliveries, setDeliveries] = useState([]);
  const [chartData, setChartData] = useState([]);
  const [demandTrend, setDemandTrend] = useState([]);
  const [alerts, setAlerts] = useState([]);

  useEffect(() => {
    // 1. Deliveries Subscription (Real-time charts & table)
    const deliveriesQuery = query(collection(db, "deliveries"), orderBy("created_at", "desc"));
    const unsubDeliveries = onSnapshot(deliveriesQuery, (snapshot) => {
      const allDeliveries = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Update Active Count
      const activeCount = allDeliveries.filter(d => d.status === 'active' || d.status === 'in-transit').length;
      setStats(prev => ({ ...prev, activeDeliveries: activeCount }));

      // Recent Deliveries (last 5)
      setDeliveries(allDeliveries.slice(0, 5));

      // Bar Chart Data (Waiting, Active, Completed)
      const counts = { waiting: 0, active: 0, completed: 0 };
      allDeliveries.forEach(d => {
        if (counts[d.status] !== undefined) counts[d.status]++;
        else if (d.status === 'in-transit') counts.active++;
      });
      setChartData([
        { name: 'Waiting', count: counts.waiting },
        { name: 'Active', count: counts.active },
        { name: 'Completed', count: counts.completed }
      ]);

      // Demand Trend (Last 10)
      const levelMap = { 'LOW': 1, 'MEDIUM': 2, 'HIGH': 3 };
      const trend = allDeliveries
        .slice(0, 10)
        .reverse()
        .map(d => ({
          time: new Date(d.created_at?.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          demand: levelMap[d.demand_level] || 1
        }));
      setDemandTrend(trend);

      // Alerts (risk_level=HIGH)
      setAlerts(allDeliveries.filter(d => d.risk_level === 'HIGH'));
      setLoading(false);
    });

    // 2. Inventory Subscription (Low stock alerts)
    const inventoryQuery = query(collection(db, "inventory"));
    const unsubInventory = onSnapshot(inventoryQuery, (snapshot) => {
      const items = snapshot.docs.map(doc => doc.data());
      const lowStockCount = items.filter(i => i.status === 'low' || i.status === 'out_of_stock' || i.quantity < i.reorder_level).length;
      setStats(prev => ({ ...prev, lowStock: lowStockCount }));
    });

    // 3. Suppliers Subscription
    const suppliersQuery = query(collection(db, "suppliers"), where("status", "==", "active"));
    const unsubSuppliers = onSnapshot(suppliersQuery, (snapshot) => {
      setStats(prev => ({ ...prev, suppliers: snapshot.docs.length }));
    });

    return () => {
      unsubDeliveries();
      unsubInventory();
      unsubSuppliers();
    };
  }, []);

  const getDemandColor = (level) => {
    switch (level) {
      case 'HIGH': return 'text-red-500';
      case 'MEDIUM': return 'text-amber-500';
      default: return 'text-green-500';
    }
  };

  return (
    <div className="space-y-8 pb-12">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">System Intelligence Dashboard</h1>
        <p className="text-slate-400 mt-1">Real-time operational overview and disruption monitoring.</p>
      </header>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <KPICard 
          title="Active Deliveries" 
          value={stats.activeDeliveries} 
          icon={MdLocalShipping} 
          color="text-blue-500"
          loading={loading}
        />
        <KPICard 
          title="System Demand" 
          value={systemDemandLevel} 
          icon={MdTrendingUp} 
          color={getDemandColor(systemDemandLevel)}
          loading={loading}
        />
        <KPICard 
          title="Low Stock Alerts" 
          value={stats.lowStock} 
          icon={MdWarning} 
          color="text-amber-500"
          loading={loading}
        />
        <KPICard 
          title="Active Suppliers" 
          value={stats.suppliers} 
          icon={MdPeople} 
          color="text-green-500"
          loading={loading}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Delivery Status Bar Chart */}
        <div className="card">
          <h3 className="text-lg font-semibold mb-6">Delivery Pipeline Status</h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                <XAxis dataKey="name" stroke="#94A3B8" />
                <YAxis stroke="#94A3B8" />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1E293B', border: '1px solid #334155', borderRadius: '8px' }}
                  itemStyle={{ color: '#F1F5F9' }}
                />
                <Bar dataKey="count" fill="#3B82F6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Demand Trend Line Chart */}
        <div className="card">
          <h3 className="text-lg font-semibold mb-6">Demand Fluctuation Trend</h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={demandTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                <XAxis dataKey="time" stroke="#94A3B8" />
                <YAxis domain={[1, 3]} ticks={[1, 2, 3]} tickFormatter={(val) => val === 1 ? 'LOW' : val === 2 ? 'MED' : 'HIGH'} stroke="#94A3B8" />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1E293B', border: '1px solid #334155', borderRadius: '8px' }}
                  itemStyle={{ color: '#F1F5F9' }}
                />
                <Line type="monotone" dataKey="demand" stroke="#3B82F6" strokeWidth={3} dot={{ fill: '#3B82F6' }} activeDot={{ r: 8 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Recent Deliveries Table */}
        <div className="lg:col-span-2 card overflow-hidden">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold">Live Operational Stream</h3>
            <span className="text-xs font-mono text-blue-400 bg-blue-500/10 px-2 py-1 rounded">REAL-TIME</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-700 text-slate-400 text-xs uppercase tracking-wider">
                  <th className="px-4 py-3">ID</th>
                  <th className="px-4 py-3">Route</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Risk</th>
                  <th className="px-4 py-3">ETA</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {deliveries.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-700/30 transition-colors group">
                    <td className="px-4 py-4">
                      <div className="font-mono text-sm text-blue-400">#{d.id.slice(-6).toUpperCase()}</div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-slate-400">{d.warehouse}</span>
                        <span className="text-blue-500">→</span>
                        <span>{d.destination}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`badge ${d.status === 'completed' ? 'badge-low' : d.status === 'active' || d.status === 'in-transit' ? 'bg-blue-500/10 text-blue-400 border-blue-500/30' : 'bg-slate-700/30 text-slate-400'}`}>
                        {d.status?.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`badge ${d.risk_level === 'HIGH' ? 'badge-high' : d.risk_level === 'MEDIUM' ? 'badge-medium' : 'badge-low'}`}>
                        {d.risk_level}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-slate-400 text-sm">
                      <div className="flex items-center gap-1">
                        <MdSchedule size={14} />
                        {new Date(d.created_at?.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* System Alerts Feed */}
        <div className="card space-y-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <MdWarning className="text-red-500" /> Disruption Feed
          </h3>
          <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
            {alerts.length === 0 ? (
              <div className="p-12 text-center text-slate-500 italic text-sm">
                No critical disruptions detected.
              </div>
            ) : (
              alerts.map(alert => (
                <div key={alert.id} className="p-4 rounded-lg bg-red-500/5 border border-red-500/20 animate-pulse-subtle">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-red-400 font-bold text-xs">CRITICAL DISRUPTION</span>
                    <span className="text-slate-500 font-mono text-[10px]">#{alert.id.slice(-4)}</span>
                  </div>
                  <p className="text-sm font-medium text-slate-200 mb-1">{alert.warehouse} to {alert.destination}</p>
                  <div className="flex items-center gap-2 text-[11px] text-slate-400 mb-3">
                    <MdLocationOn /> Route Compromised
                  </div>
                  <div className="bg-slate-900/50 p-2 rounded text-[11px] border border-red-500/10">
                    <p className="text-red-400 font-bold uppercase mb-1">Recommended Action:</p>
                    <p className="text-slate-300 italic">{alert.recommended_action || "Divert to secondary route immediately."}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
