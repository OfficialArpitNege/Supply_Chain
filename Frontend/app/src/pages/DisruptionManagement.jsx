// tactical disruption hub - manages route shocks and manual rerouting
import React, { useState, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from 'react-leaflet';
import { MdWarning, MdCompareArrows, MdLocationOn, MdClear } from 'react-icons/md';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useApp } from '../context/AppContext';
import { toast } from 'react-hot-toast';
import L from 'leaflet';

// Icons setup (using same as Dashboard)
const driverIcon = new L.Icon({
    iconUrl: 'https://cdn-icons-png.flaticon.com/512/3063/3063822.png',
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -15],
});

const customerIcon = new L.Icon({
    iconUrl: 'https://cdn-icons-png.flaticon.com/512/1673/1673188.png',
    iconSize: [30, 30],
    iconAnchor: [15, 30],
    popupAnchor: [0, -30],
});

const warehouseIcon = new L.Icon({
    iconUrl: 'https://cdn-icons-png.flaticon.com/512/2271/2271068.png',
    iconSize: [36, 36],
    iconAnchor: [18, 36],
});

const MapRefocuser = ({ center }) => {
    const map = useMap();
    useEffect(() => {
        if (center) map.setView(center, map.getZoom());
    }, [center, map]);
    return null;
};

const DisruptionManagement = () => {
    const { callApi } = useApp();
    const [deliveries, setDeliveries] = useState([]);
    const [warehouses, setWarehouses] = useState([]);
    const [selectedRouteId, setSelectedRouteId] = useState(null);
    const [disruptionType, setDisruptionType] = useState('traffic_spike');
    const [severity, setSeverity] = useState('HIGH');
    const [lastDisruption, setLastDisruption] = useState(null);
    const [loading, setLoading] = useState(false);
    const [reroutingId, setReroutingId] = useState(null);

    useEffect(() => {
        const unsubDel = onSnapshot(collection(db, 'deliveries'), (snap) => {
            setDeliveries(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });
        const unsubWh = onSnapshot(collection(db, 'warehouses'), (snap) => {
            setWarehouses(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });
        return () => { unsubDel(); unsubWh(); };
    }, []);

    const handleInjectDisruption = async () => {
        if (!selectedRouteId) {
            toast.error('Please select a route on the map first');
            return;
        }

        setLoading(true);
        const tid = toast.loading(`Injecting ${disruptionType.replace('_', ' ')}...`);
        try {
            const res = await callApi('/deliveries/disrupt', {
                method: 'POST',
                body: JSON.stringify({
                    type: disruptionType,
                    affected_route: selectedRouteId,
                    severity: severity
                })
            });

            setLastDisruption({
                ...res,
                timestamp: Date.now(),
                type: disruptionType
            });

            if (res.affected_count > 0) {
                toast.success(`⚠️ ${res.affected_count} deliveries affected and flagged for rerouting`, { id: tid });
            } else {
                toast(`Disruption injected — no active deliveries on this route`, { id: tid, icon: '📡' });
            }
        } catch (e) {
            toast.error(e.message, { id: tid });
        } finally {
            setLoading(false);
        }
    };

    const handleReroute = async (deliveryId) => {
        if (reroutingId) return;
        setReroutingId(deliveryId);
        const tid = toast.loading('Calculating new optimal route...');
        try {
            const res = await callApi(`/deliveries/${deliveryId}/reroute`, {
                method: 'POST',
                body: JSON.stringify({ reason: `Manual override for ${disruptionType.replace('_', ' ')}` })
            });
            toast.success(res.message, { id: tid });
        } catch (e) {
            toast.error(e.message, { id: tid });
        } finally {
            setReroutingId(null);
        }
    };

    const affectedDeliveries = useMemo(() => {
        if (!selectedRouteId) return [];
        return deliveries.filter(d => 
            d.selected_route?.route_id === selectedRouteId && 
            ['active', 'in_transit', 'dispatched', 'nearing'].includes(d.status)
        );
    }, [deliveries, selectedRouteId]);

    const activeRoutes = useMemo(() => {
        const routes = new Map();
        deliveries.forEach(d => {
            const rid = d.selected_route?.route_id;
            if (rid && ['active', 'in_transit', 'dispatched', 'nearing'].includes(d.status)) {
                if (!routes.has(rid)) {
                    routes.set(rid, {
                        id: rid,
                        path: d.route,
                        count: 1,
                        deliveries: [d]
                    });
                } else {
                    const existing = routes.get(rid);
                    existing.count += 1;
                    existing.deliveries.push(d);
                }
            }
        });
        return Array.from(routes.values());
    }, [deliveries]);

    return (
        <div className="h-full flex flex-col p-8 gap-8 animate-fadeIn">
            {/* Header */}
            <div className="flex justify-between items-end">
                <div>
                    <h2 className="text-3xl font-black text-white tracking-tight uppercase">Disruptions <span className="text-blue-500">&</span> Rerouting</h2>
                    <p className="text-slate-400 text-sm mt-2 font-medium">Select active routes on the tactical map to simulate and manage supply chain shocks.</p>
                </div>
                <div className="flex gap-4">
                    <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700">
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Active Routes</p>
                        <p className="text-xl font-black text-white">{activeRoutes.length}</p>
                    </div>
                    <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700">
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Affected Deliveries</p>
                        <p className="text-xl font-black text-red-400">{deliveries.filter(d => d.risk_level === 'HIGH').length}</p>
                    </div>
                </div>
            </div>

            <div className="flex-1 grid grid-cols-12 gap-8 min-h-0">
                {/* Tactical Map */}
                <div className="col-span-8 bg-[#1E293B] border border-slate-700 rounded-3xl overflow-hidden relative shadow-2xl">
                    <MapContainer center={[19.0760, 72.8777]} zoom={12} style={{ height: '100%', width: '100%', background: '#0F172A' }}>
                        <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
                        
                        {/* Render Active Routes (Aggregated by segment) */}
                        {activeRoutes.map(route => {
                            const isRerouted = route.deliveries.some(d => d.rerouted);
                            return (
                                <Polyline
                                    key={route.id}
                                    positions={route.path.map(p => [p.lat, p.lon])}
                                    color={selectedRouteId === route.id ? '#F59E0B' : (isRerouted ? '#F59E0B' : '#3B82F6')}
                                    weight={selectedRouteId === route.id ? 8 : 4}
                                    opacity={selectedRouteId === route.id ? 1 : (isRerouted ? 0.8 : 0.4)}
                                    eventHandlers={{
                                        click: () => setSelectedRouteId(route.id)
                                    }}
                                >
                                    <Popup>
                                        <div className="p-2">
                                            <p className="text-[10px] font-black text-slate-500 uppercase mb-1">Route Segment</p>
                                            <p className="text-sm font-bold text-slate-900">{route.id}</p>
                                            <p className="text-[10px] font-bold text-blue-600 mt-2 uppercase">{route.count} Active Deliveries</p>
                                            {isRerouted && <p className="text-[10px] font-bold text-orange-600 uppercase mt-1">🔀 Reroute Applied</p>}
                                        </div>
                                    </Popup>
                                </Polyline>
                            );
                        })}

                        {/* Render Individual Paths for Affected/Selected Deliveries */}
                        {deliveries.filter(d => ['active', 'in_transit', 'dispatched', 'nearing'].includes(d.status)).map(d => {
                            const isRerouted = d.rerouted;
                            const isSelected = selectedRouteId === d.selected_route?.route_id;
                            const validRoute = d.route?.filter(p => p && p.lat !== undefined && p.lon !== undefined) || [];

                            if (validRoute.length < 2) return null;

                            return (
                                <React.Fragment key={`path-${d.id}`}>
                                    {/* Traversed/Historical Journey (Warehouse to Driver) */}
                                    {isRerouted && d.old_route && d.old_route.length > 1 && (
                                        <Polyline
                                            positions={d.old_route.map(p => [p.lat, p.lon])}
                                            color="#F59E0B"
                                            weight={3}
                                            opacity={0.3}
                                        />
                                    )}
                                    {/* Main/Active Route (Driver to Destination) */}
                                    {(isSelected || isRerouted) && (
                                        <Polyline
                                            positions={validRoute.map(p => [p.lat, p.lon])}
                                            color={isRerouted ? '#F59E0B' : '#3B82F6'}
                                            weight={isSelected ? 6 : 4}
                                            opacity={isSelected ? 1 : 0.8}
                                        />
                                    )}
                                    
                                    {/* Customer Pin */}
                                    {d.end_location?.lat !== undefined && d.end_location?.lon !== undefined && (
                                        <Marker 
                                            position={[d.end_location.lat, d.end_location.lon]} 
                                            icon={customerIcon}
                                            zIndexOffset={1000}
                                        >
                                            <Popup>
                                                <div className="p-2">
                                                    <p className="text-[10px] font-black text-slate-500 uppercase mb-1">Destination</p>
                                                    <p className="text-xs font-bold text-slate-900">Unit #{d.delivery_id?.slice(-4)} Target</p>
                                                </div>
                                            </Popup>
                                        </Marker>
                                    )}
                                </React.Fragment>
                            );
                        })}

                        {/* Warehouses */}
                        {warehouses.map(w => {
                            if (!w.location?.lat || !w.location?.lon) return null;
                            return (
                                <Marker key={w.id} position={[w.location.lat, w.location.lon]} icon={warehouseIcon}>
                                    <Popup><div className="text-xs font-black uppercase text-slate-900">{w.name}</div></Popup>
                                </Marker>
                            );
                        })}

                        {/* Drivers */}
                        {deliveries.map(d => {
                            const point = d.route?.[d.current_index || 0];
                            if (!point || point.lat === undefined || point.lon === undefined) return null;
                            const isRerouted = d.rerouted;
                            return (
                                <Marker key={d.id} position={[point.lat, point.lon]} icon={driverIcon} zIndexOffset={2000}>
                                    <Popup>
                                        <div className="p-2">
                                            <p className="text-[10px] font-black text-slate-500 uppercase mb-1">Unit #{d.delivery_id?.slice(-4)}</p>
                                            <p className="text-xs font-bold text-slate-900">{d.status.replace('_', ' ')}</p>
                                            {isRerouted && (
                                                <div className="mt-2 p-1.5 bg-orange-500/10 border border-orange-500/20 rounded text-[9px] text-orange-600 font-bold">
                                                    🔀 Rerouted: {d.reroute_reason?.replace('Dynamic Reroute: ', '')}
                                                </div>
                                            )}
                                        </div>
                                    </Popup>
                                </Marker>
                            );
                        })}
                    </MapContainer>

                    {/* Map Overlays */}
                    <div className="absolute top-6 left-6 z-[1000] flex flex-col gap-4">
                        <div className="bg-slate-900/80 backdrop-blur-md px-4 py-2 rounded-xl border border-white/5 text-[10px] font-black uppercase tracking-widest text-blue-400 shadow-xl">
                            Live Tactical Route Overlay
                        </div>
                        {selectedRouteId && (
                            <div className="bg-amber-500 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest animate-pulse shadow-xl shadow-amber-500/20">
                                Targeted: {selectedRouteId}
                            </div>
                        )}
                    </div>

                    <button 
                        onClick={() => setSelectedRouteId(null)}
                        className="absolute top-6 right-6 z-[1000] bg-slate-900/80 hover:bg-slate-800 p-2 rounded-xl text-slate-400 transition-all border border-white/5 shadow-xl"
                        title="Clear Selection"
                    >
                        <MdClear size={20} />
                    </button>
                </div>

                {/* Control Panel */}
                <div className="col-span-4 flex flex-col gap-6 overflow-y-auto custom-scrollbar pr-2">
                    {/* Disruption Form */}
                    <div className="bg-[#1E293B] border border-slate-700 rounded-3xl p-6 shadow-xl">
                        <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-6 flex items-center gap-2">
                            <MdWarning className="text-amber-500" /> Disruption Parameters
                        </h3>
                        
                        <div className="space-y-6">
                            <div>
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 block">Shock Type</label>
                                <div className="grid grid-cols-2 gap-3">
                                    {['traffic_spike', 'road_closure', 'weather_event', 'infrastructure_failure'].map(t => (
                                        <button
                                            key={t}
                                            onClick={() => setDisruptionType(t)}
                                            className={`py-3 px-4 rounded-xl text-[9px] font-bold uppercase transition-all border ${
                                                disruptionType === t 
                                                ? 'bg-blue-600 border-blue-400 text-white shadow-lg shadow-blue-600/20' 
                                                : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500'
                                            }`}
                                        >
                                            {t.replace('_', ' ')}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 block">Severity Level</label>
                                <div className="flex gap-3">
                                    {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map(s => (
                                        <button
                                            key={s}
                                            onClick={() => setSeverity(s)}
                                            className={`flex-1 py-3 rounded-xl text-[9px] font-bold uppercase transition-all border ${
                                                severity === s 
                                                ? 'bg-red-600 border-red-400 text-white shadow-lg shadow-red-600/20' 
                                                : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500'
                                            }`}
                                        >
                                            {s}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <button
                                onClick={handleInjectDisruption}
                                disabled={!selectedRouteId || loading}
                                className="w-full bg-slate-900 hover:bg-red-600 disabled:bg-slate-800 disabled:text-slate-600 border border-red-500/30 hover:border-red-400 text-red-400 hover:text-white font-black py-4 rounded-2xl text-[11px] uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-3"
                            >
                                {loading ? 'Processing Shock...' : 'Inject Disruption'}
                            </button>
                        </div>
                    </div>

                    {/* Affected Deliveries List */}
                    <div className="flex-1 bg-[#1E293B] border border-slate-700 rounded-3xl p-6 shadow-xl flex flex-col min-h-0">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                <MdCompareArrows className="text-blue-500" /> Impacted Assets
                            </h3>
                            <span className="bg-slate-900 text-blue-400 px-3 py-1 rounded-full text-[10px] font-black tracking-widest border border-blue-500/20">
                                {affectedDeliveries.length}
                            </span>
                        </div>

                        <div className="flex-1 overflow-y-auto space-y-4 custom-scrollbar pr-2">
                            {!selectedRouteId ? (
                                <div className="h-full flex flex-col items-center justify-center text-center opacity-40 py-12">
                                    <MdLocationOn size={48} className="text-slate-700 mb-4" />
                                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Select a route segment<br/>to analyze impact</p>
                                </div>
                            ) : affectedDeliveries.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-center opacity-40 py-12">
                                    <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Zero Impact Detected<br/>on this segment</p>
                                </div>
                            ) : (
                                affectedDeliveries.map(d => (
                                    <div key={d.id} className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 transition-all hover:border-slate-600 group">
                                        <div className="flex justify-between items-start mb-3">
                                            <div>
                                                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Delivery ID</p>
                                                <p className="text-sm font-bold text-white tracking-tight">#{d.delivery_id?.slice(-8)}</p>
                                            </div>
                                            <div className={`px-2 py-1 rounded text-[8px] font-black uppercase tracking-widest ${
                                                d.risk_level === 'HIGH' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                                            }`}>
                                                {d.risk_level} Risk
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4 mb-4">
                                            <div>
                                                <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest">Current ETA</p>
                                                <p className="text-xs font-bold text-orange-400">{Math.round(d.eta_remaining)} MINS</p>
                                            </div>
                                            <div>
                                                <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest">Progress</p>
                                                <p className="text-xs font-bold text-white">{d.progress}%</p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => handleReroute(d.id)}
                                            disabled={reroutingId === d.id}
                                            className={`w-full py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${
                                                d.rerouted 
                                                ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' 
                                                : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/20'
                                            }`}
                                        >
                                            {reroutingId === d.id ? 'Calculating...' : d.rerouted ? '✓ Reroute Applied' : 'Apply Reroute'}
                                        </button>
                                    </div>
                                )
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DisruptionManagement;
