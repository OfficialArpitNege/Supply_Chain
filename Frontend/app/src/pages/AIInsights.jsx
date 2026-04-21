import React, { useState, useEffect, useMemo } from 'react';
import { 
  collection, 
  query, 
  onSnapshot, 
  orderBy, 
  limit 
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { 
  PieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid
} from 'recharts';
import { 
  MdPsychology, 
  MdSpeed, 
  MdTrendingUp, 
  MdTrendingDown, 
  MdTrendingFlat,
  MdMessage,
  MdSend,
  MdRefresh,
  MdTimeline,
  MdWarning,
  MdCheckCircle,
  MdInfo
} from 'react-icons/md';
import toast from 'react-hot-toast';

const API_BASE = 'http://127.0.0.1:8000';

const AIInsights = () => {
  const [deliveries, setDeliveries] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [demandLevel, setDemandLevel] = useState({ level: 'LOW', score: 1.2, active: 0 });
  const [pollingError, setPollingError] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState([
    { role: 'ai', content: 'Neural Assistant Online. Systems nominal. How can I assist with your supply chain intelligence today?' }
  ]);

  // Real-time Data Subscriptions
  useEffect(() => {
    const unsubDeliveries = onSnapshot(query(collection(db, "deliveries"), orderBy("created_at", "desc")), (snapshot) => {
      setDeliveries(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    
    const unsubInventory = onSnapshot(collection(db, "inventory"), (snapshot) => {
      setInventory(snapshot.docs.map(doc => doc.data()));
    });

    return () => {
      unsubDeliveries();
      unsubInventory();
    };
  }, []);

  // Poll Demand Forecast every 30s
  const fetchDemand = async () => {
    try {
      const res = await fetch(`${API_BASE}/predict-demand`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: 101, category: "AI_INSIGHTS", order_date: new Date().toISOString() })
      });
      if (!res.ok) throw new Error("API Offline");
      const data = await res.json();
      setDemandLevel({ level: data.demand_level, score: data.final_score, active: data.active_deliveries });
      setPollingError(false);
    } catch (err) {
      setPollingError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDemand();
    const interval = setInterval(fetchDemand, 30000);
    return () => clearInterval(interval);
  }, []);

  // Heatmap Data (Waiting Deliveries)
  const riskHeatmap = useMemo(() => {
    return deliveries
      .filter(d => d.status === 'waiting')
      .sort((a, b) => (b.probability_delayed || 0) - (a.probability_delayed || 0));
  }, [deliveries]);

  // Decision Log Data
  const decisionLog = useMemo(() => {
    return deliveries
      .filter(d => d.status === 'completed' || d.status === 'active')
      .slice(0, 5);
  }, [deliveries]);

  // Route Intelligence
  const routeStats = useMemo(() => {
    const routes = {};
    deliveries.filter(d => d.status === 'completed').forEach(d => {
      const path = d.selected_route?.id || 'Unknown';
      if (!routes[path]) routes[path] = { name: path, accuracy: 0, count: 0, totalDelay: 0 };
      routes[path].count++;
      // Mocking accuracy vs predicted delay for demo
      const accuracy = (1 - (d.probability_delayed || 0)) * 100;
      routes[path].accuracy += accuracy;
    });
    return Object.values(routes).map(r => ({ ...r, accuracy: r.accuracy / r.count }));
  }, [deliveries]);

  // Chat Logic (Rule-based)
  const handleChat = (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const userMsg = chatInput.toLowerCase();
    let aiResponse = "I'm processing that. For detailed neural analysis, please specify if you want stock levels, high-risk counts, or system demand.";

    if (userMsg.includes("high risk")) {
      const count = deliveries.filter(d => d.risk_level === 'HIGH').length;
      aiResponse = `I've identified ${count} high-risk deliveries currently in the pipeline. I recommend monitoring their ETA drift closely.`;
    } else if (userMsg.includes("deliveries")) {
      aiResponse = `Current pipeline status: ${deliveries.length} total units, with ${deliveries.filter(d => d.status === 'active').length} currently in transit.`;
    } else if (userMsg.includes("stock") || userMsg.includes("inventory")) {
      const low = inventory.filter(i => i.quantity <= i.reorder_level).length;
      aiResponse = `Inventory scan complete. ${low} SKUs are approaching reorder thresholds.`;
    } else if (userMsg.includes("demand") || userMsg.includes("load")) {
      aiResponse = `Neural forecast indicates ${demandLevel.level} system load (score: ${demandLevel.score.toFixed(2)}). Load is driven by ${demandLevel.active} active dispatches.`;
    }

    setChatHistory([...chatHistory, { role: 'user', content: chatInput }, { role: 'ai', content: aiResponse }]);
    setChatInput('');
  };

  // Gauge Data
  const gaugeData = [
    { name: 'Value', value: demandLevel.score },
    { name: 'Rest', value: 5 - demandLevel.score }
  ];
  const GAUGE_COLORS = [demandLevel.level === 'HIGH' ? '#EF4444' : demandLevel.level === 'MEDIUM' ? '#F59E0B' : '#10B981', '#1E293B'];

  return (
    <div className="h-full flex flex-col gap-6 overflow-hidden">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent">
            AI Operations Intelligence
          </h1>
          <p className="text-slate-400">Neural forecasting, risk heatmaps, and autonomous decision logs.</p>
        </div>
        <div className="flex gap-3">
          {pollingError && (
            <button onClick={fetchDemand} className="flex items-center gap-2 px-3 py-1 bg-red-500/10 text-red-500 border border-red-500/20 rounded-lg text-sm">
              <MdRefresh className="animate-spin" /> Link Failure - Retry
            </button>
          )}
          <div className="flex items-center gap-2 px-4 py-2 bg-blue-600/10 text-blue-400 border border-blue-500/20 rounded-xl">
             <MdPsychology size={20} className="animate-pulse" />
             <span className="text-xs font-black uppercase tracking-widest">Neural Link Active</span>
          </div>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-12 gap-6 overflow-hidden">
        {/* Left Column: Demand & Heatmap */}
        <div className="col-span-12 lg:col-span-4 flex flex-col gap-6 overflow-y-auto pr-2 custom-scrollbar">
          {/* Demand Gauge */}
          <div className="card text-center relative overflow-hidden group">
            <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Demand Forecast</h3>
            <div className="h-48 relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={gaugeData}
                    cx="50%" cy="80%"
                    startAngle={180} endAngle={0}
                    innerRadius={60} outerRadius={80}
                    paddingAngle={0} dataKey="value"
                  >
                    {gaugeData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={GAUGE_COLORS[index % GAUGE_COLORS.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 translate-y-4">
                <span className={`text-3xl font-black ${demandLevel.level === 'HIGH' ? 'text-red-500' : 'text-emerald-500'}`}>
                  {demandLevel.level}
                </span>
                <p className="text-[10px] text-slate-500 font-mono">NEURAL SCORE: {demandLevel.score.toFixed(2)}</p>
              </div>
            </div>
            <div className="flex items-center justify-center gap-6 mt-2 border-t border-slate-700/50 pt-4">
              <div className="text-center">
                <p className="text-[10px] text-slate-500 uppercase font-bold">Active Load</p>
                <p className="text-lg font-mono font-bold text-white">{demandLevel.active}</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-slate-500 uppercase font-bold">Trend</p>
                <div className="flex justify-center text-blue-400">
                  {demandLevel.score > 2 ? <MdTrendingUp size={24} /> : demandLevel.score < 1 ? <MdTrendingDown size={24} /> : <MdTrendingFlat size={24} />}
                </div>
              </div>
            </div>
          </div>

          {/* Risk Heatmap */}
          <div className="card flex-1 flex flex-col">
            <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
              <MdWarning className="text-amber-500" /> Delay Risk Heatmap
            </h3>
            <div className="space-y-3 overflow-y-auto pr-1">
              {riskHeatmap.map((d, i) => (
                <div key={d.id} className="p-3 bg-slate-900/50 border border-slate-800 rounded-xl flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-mono text-blue-400">#{d.delivery_id?.slice(-6)}</p>
                    <p className="text-xs font-bold truncate max-w-[150px]">{d.destination}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-black ${
                      (d.probability_delayed * 100) > 60 ? 'text-red-500' : (d.probability_delayed * 100) > 30 ? 'text-amber-500' : 'text-emerald-500'
                    }`}>
                      {(d.probability_delayed * 100).toFixed(0)}%
                    </p>
                    <p className="text-[9px] text-slate-600 uppercase font-bold">Delay Prob.</p>
                  </div>
                </div>
              ))}
              {riskHeatmap.length === 0 && (
                <div className="p-8 text-center text-slate-600 italic text-sm">
                  No units in waiting state.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Center/Right Column: Log & intelligence */}
        <div className="col-span-12 lg:col-span-8 flex flex-col gap-6 overflow-hidden">
          <div className="grid grid-cols-2 gap-6 h-1/2">
            {/* Route Intelligence */}
            <div className="card flex flex-col">
              <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-6">Route Performance AI</h3>
              <div className="flex-1">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={routeStats}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                    <XAxis dataKey="name" stroke="#64748B" fontSize={10} />
                    <YAxis stroke="#64748B" fontSize={10} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#0F172A', border: '1px solid #334155' }}
                      itemStyle={{ color: '#60A5FA' }}
                    />
                    <Bar dataKey="accuracy" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 p-3 bg-blue-500/5 border border-blue-500/10 rounded-xl">
                 <p className="text-[10px] font-bold text-blue-400 uppercase mb-1">AI Recommendation</p>
                 <p className="text-xs text-slate-300">Route <span className="font-bold text-white">TR-402</span> consistently delivers 12% faster in rain conditions.</p>
              </div>
            </div>

            {/* AI Decision Log */}
            <div className="card flex flex-col overflow-hidden">
               <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4">Neural Decision Ledger</h3>
               <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                  {decisionLog.map(d => (
                    <div key={d.id} className="p-3 bg-slate-900/30 border border-slate-700/50 rounded-xl text-[10px]">
                      <div className="flex justify-between mb-2 pb-2 border-b border-slate-700/30">
                        <span className="font-mono text-blue-400">#{d.delivery_id?.slice(-8)}</span>
                        <span className={`px-2 py-0.5 rounded font-black ${d.risk_level === 'HIGH' ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                          {d.risk_level} RISK
                        </span>
                      </div>
                      <p className="text-slate-400 mb-2 italic">"{d.recommended_action}"</p>
                      <div className="flex justify-between items-center bg-slate-900/80 p-2 rounded-lg">
                        <span className="text-slate-500 uppercase font-black">AI Accuracy:</span>
                        <span className="text-emerald-500 flex items-center gap-1 font-bold">
                          <MdCheckCircle /> High Confidence
                        </span>
                      </div>
                    </div>
                  ))}
               </div>
            </div>
          </div>

          {/* Chat Assistant */}
          <div className="card flex-1 flex flex-col bg-slate-800/20 p-0 overflow-hidden border-blue-500/10">
            <div className="p-4 border-b border-slate-700/50 flex justify-between items-center bg-slate-800/40">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                <h4 className="text-sm font-bold uppercase tracking-widest text-slate-300">Neural Chat Proxy</h4>
              </div>
              <MdPsychology className="text-blue-500" size={24} />
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar bg-slate-900/10">
               {chatHistory.map((chat, i) => (
                 <div key={i} className={`flex ${chat.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] p-3 rounded-2xl text-sm ${
                      chat.role === 'user' 
                      ? 'bg-blue-600 text-white rounded-tr-none' 
                      : 'bg-slate-800 text-slate-200 border border-slate-700 rounded-tl-none'
                    }`}>
                      {chat.content}
                    </div>
                 </div>
               ))}
            </div>

            <form onSubmit={handleChat} className="p-4 bg-slate-800/40 border-t border-slate-700/50 flex gap-3">
               <input 
                 type="text" 
                 placeholder="Ask Neural Proxy: 'How many high risk dispatches?'" 
                 className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-sm text-white focus:border-blue-500 outline-none transition-all"
                 value={chatInput}
                 onChange={e => setChatInput(e.target.value)}
               />
               <button type="submit" className="p-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-lg shadow-blue-600/20 transition-all">
                 <MdSend size={20} />
               </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AIInsights;
