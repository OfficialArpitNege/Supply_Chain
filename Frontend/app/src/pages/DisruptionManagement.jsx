// tactical disruption hub - manages route shocks and manual rerouting
import React, { useState, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Popup, Tooltip, useMap } from 'react-leaflet';
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
    // Track which route IDs were disrupted so we can still show affected deliveries
    // even after they've been auto-rerouted off the original route.
    const [disruptedRouteIds, setDisruptedRouteIds] = useState([]);

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
        // BUG FIX 5 (State/UI sync): Clear lastDisruption so affectedDeliveries resets
        // before the new disruption result arrives. Prevents showing stale affected list.
        setLastDisruption(null);
        const tid = toast.loading(`Injecting ${disruptionType.replace('_', ' ')}...`);
        console.debug('[Disruption] Injecting:', { route: selectedRouteId, type: disruptionType, severity });
        try {
            const res = await callApi('/deliveries/disrupt', {
                method: 'POST',
                body: JSON.stringify({
                    type: disruptionType,
                    affected_route: selectedRouteId,
                    severity: severity
                })
            });

            console.debug('[Disruption] Response:', res);
            console.debug('[Disruption] Affected count:', res.affected_count);

            // Track the disrupted route so affected deliveries remain visible
            // even after they are auto-rerouted away from this route segment.
            setDisruptedRouteIds(prev => [...new Set([...prev, selectedRouteId])]);

            setLastDisruption({
                ...res,
                timestamp: Date.now(),
                type: disruptionType
            });

            if (res.affected_count > 0) {
                toast.success(`⚠️ ${res.affected_count} deliveries rerouted away from disruption`, { id: tid });
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

        // Debug: capture pre-reroute state for comparison
        const deliveryBefore = deliveries.find(d => d.id === deliveryId);
        console.debug('[Reroute] Starting reroute for delivery:', deliveryId);
        console.debug('[Reroute] Current route_id:', deliveryBefore?.selected_route?.route_id);
        console.debug('[Reroute] ETA before:', deliveryBefore?.eta_remaining, 'mins');

        try {
            const res = await callApi(`/deliveries/${deliveryId}/reroute`, {
                method: 'POST',
                body: JSON.stringify({ reason: `Manual override for ${disruptionType.replace('_', ' ')}` })
            });
            console.debug('[Reroute] Response:', res);
            console.debug('[Reroute] New route_id:', res.new_route_id || '(same)');
            console.debug('[Reroute] ETA after:', res.eta_remaining ?? '(not returned)', 'mins');
            console.debug('[Reroute] Decision:', res.status, '-', res.message);
            // Handle all possible backend response statuses
            if (res.status === 'success' || res.status === 'fallback') {
                toast.success(res.message || 'Reroute applied successfully', { id: tid });
            } else if (res.status === 'skipped') {
                // Delivery already has a good route — show informational toast
                toast(`Route check: ${res.message}`, { id: tid, icon: 'ℹ️' });
            } else {
                toast(res.message || 'Reroute processed', { id: tid, icon: '🔀' });
            }
        } catch (e) {
            toast.error(e.message, { id: tid });
        } finally {
            setReroutingId(null);
        }
    };

    const affectedDeliveries = useMemo(() => {
        // BUG FIX 1: Only show affected deliveries AFTER a disruption has been injected.
        // Previously this showed deliveries the moment a route was clicked (before injection).
        if (!selectedRouteId || !lastDisruption) return [];
        const activeStatuses = ['active', 'in_transit', 'dispatched', 'nearing'];

        // BUG FIX 2: Use word-boundary-safe matching for route IDs to prevent substring
        // false-positives (e.g. "R1" matching "R10", "R100", etc.).
        const routeIdMatchesReason = (reason, routeId) => {
            if (!reason || !routeId) return false;
            // Escape special regex chars in routeId, then match as whole word/token
            const escaped = routeId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            return new RegExp(`(?<![\\w-])${escaped}(?![\\w-])`, 'i').test(reason);
        };

        return deliveries.filter(d => {
            if (!activeStatuses.includes(d.status)) return false;

            // Case 1: Delivery is currently on the selected route (not yet rerouted)
            if (d.selected_route?.route_id === selectedRouteId) return true;

            // Case 2: Delivery was auto-rerouted AWAY from this route by the disruption.
            // After injection, the backend changes selected_route.route_id to a new route,
            // so we detect these by checking the reroute_reason references the disrupted route.
            if (d.rerouted && d.reroute_reason) {
                if (routeIdMatchesReason(d.reroute_reason, selectedRouteId)) return true;
                if (disruptedRouteIds.some(rid => routeIdMatchesReason(d.reroute_reason, rid))) return true;
            }

            return false;
        });
    }, [deliveries, selectedRouteId, disruptedRouteIds, lastDisruption]);

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
                            
                            const validPath = (route.path || []).map(p => {
                                if (!p) return null;
                                if (p.lat !== undefined && p.lon !== undefined) return [p.lat, p.lon];
                                if (p.lat !== undefined && p.lng !== undefined) return [p.lat, p.lng];
                                if (Array.isArray(p) && p.length >= 2) return [p[0], p[1]];
                                return null;
                            }).filter(Boolean);
                            
                            if (validPath.length < 2) return null;

                            return (
                                <Polyline
                                    key={route.id}
                                    positions={validPath}
                                    // BUG FIX 3: Selected route = amber (targeted); rerouted = blue (new active path); default = blue.
                                    // Previously both selected AND rerouted were amber, making them visually indistinguishable.
                                    color={selectedRouteId === route.id ? '#F59E0B' : '#3B82F6'}
                                    weight={selectedRouteId === route.id ? 12 : 8}
                                    opacity={selectedRouteId === route.id ? 1 : (isRerouted ? 0.8 : 0.6)}
                                    eventHandlers={{
                                        click: (e) => {
                                            setSelectedRouteId(route.id);
                                            // BUG FIX 6: Clear prior disruption context when switching routes.
                                            // Prevents affected delivery list from a previous disruption
                                            // leaking into the newly selected route view.
                                            setLastDisruption(null);
                                        }
                                    }}
                                >
                                    <Tooltip sticky>
                                        <div className="p-1">
                                            <p className="text-[10px] font-black text-slate-500 uppercase mb-1">Route Segment</p>
                                            <p className="text-sm font-bold text-slate-900">{route.id}</p>
                                            <p className="text-[10px] font-bold text-blue-600 mt-1 uppercase">{route.count} Active Deliveries</p>
                                            {isRerouted && <p className="text-[10px] font-bold text-orange-600 uppercase mt-1">🔀 Reroute Applied</p>}
                                        </div>
                                    </Tooltip>
                                </Polyline>
                            );
                        })}

                        {/* Render Individual Paths for Affected/Selected Deliveries */}
                        {deliveries.filter(d => ['active', 'in_transit', 'dispatched', 'nearing'].includes(d.status)).map(d => {
                            const isRerouted = d.rerouted;
                            const isSelected = selectedRouteId === d.selected_route?.route_id;
                            
                            const validRoute = (d.route || []).map(p => {
                                if (!p) return null;
                                if (p.lat !== undefined && p.lon !== undefined) return [p.lat, p.lon];
                                if (p.lat !== undefined && p.lng !== undefined) return [p.lat, p.lng];
                                if (Array.isArray(p) && p.length >= 2) return [p[0], p[1]];
                                return null;
                            }).filter(Boolean);

                            if (validRoute.length < 2) return null;
                            
                            const validOldRoute = (d.old_route || []).map(p => {
                                if (!p) return null;
                                if (p.lat !== undefined && p.lon !== undefined) return [p.lat, p.lon];
                                if (p.lat !== undefined && p.lng !== undefined) return [p.lat, p.lng];
                                if (Array.isArray(p) && p.length >= 2) return [p[0], p[1]];
                                return null;
                            }).filter(Boolean);

                            return (
                                <React.Fragment key={`path-${d.id}`}>
                                    {/* Traversed/Historical Journey (Warehouse to Driver) */}
                                    {isRerouted && validOldRoute.length > 1 && (
                                        <Polyline
                                            positions={validOldRoute}
                                            color="#6B7280"
                                            weight={3}
                                            opacity={0.4}
                                            dashArray="6 4"
                                            eventHandlers={{
                                                click: () => {
                                                    if (d.selected_route?.route_id) {
                                                        setSelectedRouteId(d.selected_route.route_id);
                                                    }
                                                }
                                            }}
                                        />
                                    )}
                                    {/* Main/Active Route (Driver to Destination) */}
                                    {(isSelected || isRerouted) && (
                                        <Polyline
                                            positions={validRoute}
                                            // BUG FIX 4: New rerouted path = blue; selected-but-not-rerouted = blue highlight.
                                            // Previously isRerouted used amber which was wrong per spec (new route → blue).
                                            color='#3B82F6'
                                            weight={isSelected ? 6 : 4}
                                            opacity={isSelected ? 1 : 0.8}
                                            eventHandlers={{
                                                click: () => {
                                                    if (d.selected_route?.route_id) {
                                                        setSelectedRouteId(d.selected_route.route_id);
                                                    }
                                                }
                                            }}
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
                <div className="col-span-4 flex flex-col gap-6 min-h-0">
                    {/* Disruption Form */}
                    <div className="shrink-0 bg-[#1E293B] border border-slate-700 rounded-3xl p-6 shadow-xl">
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
                    <div className="flex-1 min-h-[280px] bg-[#1E293B] border border-slate-700 rounded-3xl p-6 shadow-xl flex flex-col overflow-hidden">
                        <div className="flex justify-between items-center mb-5 shrink-0">
                            <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                <MdCompareArrows className="text-blue-500" /> Impacted Assets
                            </h3>
                            <span className={`px-3 py-1 rounded-full text-[10px] font-black tracking-widest border ${
                                affectedDeliveries.length > 0
                                    ? 'bg-red-500/10 text-red-400 border-red-500/20'
                                    : 'bg-slate-900 text-blue-400 border-blue-500/20'
                            }`}>
                                {affectedDeliveries.length} {affectedDeliveries.length === 1 ? 'unit' : 'units'}
                            </span>
                        </div>

                        <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar pr-1">
                            {!selectedRouteId ? (
                                <div className="flex flex-col items-center justify-center text-center py-10 gap-3">
                                    <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center">
                                        <MdLocationOn size={24} className="text-slate-600" />
                                    </div>
                                    <div>
                                        <p className="text-xs font-bold text-slate-400">No route selected</p>
                                        <p className="text-[10px] text-slate-600 mt-1">Click any route line on the map</p>
                                    </div>
                                </div>
                            ) : affectedDeliveries.length === 0 ? (
                                <div className="flex flex-col items-center justify-center text-center py-10 gap-3">
                                    <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                                        <span className="text-xl">✅</span>
                                    </div>
                                    <div>
                                        <p className="text-xs font-bold text-emerald-400">No Impact Detected</p>
                                        <p className="text-[10px] text-slate-500 mt-1">No active deliveries on this segment</p>
                                    </div>
                                </div>
                            ) : (
                                affectedDeliveries.map(d => (
                                    <div key={d.id} className="bg-slate-900 border border-slate-800 hover:border-slate-600 rounded-2xl p-4 transition-all">
                                        {/* Header */}
                                        <div className="flex justify-between items-center mb-2">
                                            <div className="flex items-center gap-2">
                                                {d.rerouted
                                                    ? <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50 shrink-0"></span>
                                                    : <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse shrink-0"></span>
                                                }
                                                <span className="text-xs font-bold text-white font-mono">#{(d.delivery_id || d.id)?.slice(-8)}</span>
                                            </div>
                                            <span className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-wider border ${
                                                d.risk_level === 'HIGH'
                                                    ? 'bg-red-500/10 text-red-400 border-red-500/20'
                                                    : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                            }`}>{d.risk_level} Risk</span>
                                        </div>

                                        {/* Rerouted badge */}
                                        {d.rerouted && (
                                            <div className="flex items-center gap-1.5 mb-3 px-2.5 py-1.5 bg-emerald-500/5 border border-emerald-500/15 rounded-lg">
                                                <span className="text-[10px]">🔀</span>
                                                <span className="text-[9px] text-emerald-400 font-bold truncate">Auto-rerouted — new optimal path applied</span>
                                            </div>
                                        )}

                                        {/* Stats grid */}
                                        <div className="grid grid-cols-3 gap-2 mb-3">
                                            <div className="bg-slate-800/60 rounded-lg px-2 py-1.5 text-center">
                                                <p className="text-[8px] text-slate-500 uppercase tracking-wider mb-0.5">ETA</p>
                                                <p className="text-[11px] font-black text-orange-400">{Math.round(d.eta_remaining ?? 0)}m</p>
                                            </div>
                                            <div className="bg-slate-800/60 rounded-lg px-2 py-1.5 text-center">
                                                <p className="text-[8px] text-slate-500 uppercase tracking-wider mb-0.5">Done</p>
                                                <p className="text-[11px] font-black text-white">{d.progress ?? 0}%</p>
                                            </div>
                                            <div className="bg-slate-800/60 rounded-lg px-2 py-1.5 text-center">
                                                <p className="text-[8px] text-slate-500 uppercase tracking-wider mb-0.5">Status</p>
                                                <p className="text-[10px] font-black text-blue-400 capitalize">{(d.status || '').replace('_', ' ')}</p>
                                            </div>
                                        </div>

                                        {/* Progress bar */}
                                        <div className="w-full h-1 bg-slate-800 rounded-full mb-3 overflow-hidden">
                                            <div
                                                className={`h-full rounded-full transition-all duration-700 ${d.rerouted ? 'bg-emerald-500' : 'bg-blue-500'}`}
                                                style={{ width: `${d.progress ?? 0}%` }}
                                            />
                                        </div>

                                        {/* Reroute button */}
                                        <button
                                            onClick={() => handleReroute(d.id)}
                                            disabled={!!reroutingId}
                                            className={`w-full py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all duration-200 ${
                                                reroutingId === d.id
                                                    ? 'bg-slate-800 text-slate-500 cursor-wait'
                                                    : d.rerouted
                                                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20'
                                                        : 'bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-900/30'
                                            }`}
                                        >
                                            {reroutingId === d.id ? '⟳  Calculating...' : d.rerouted ? '✓  Reroute Applied' : '→  Apply Reroute'}
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DisruptionManagement;
