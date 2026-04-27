import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore';
import { MapContainer, Marker, Polyline, Popup, TileLayer } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  MdCancel,
  MdCheckCircle,
  MdDescription,
  MdLocalShipping,
  MdRoute,
  MdSchedule,
  MdSearch,
  MdShoppingBag,
  MdTimeline,
} from 'react-icons/md';
import toast from 'react-hot-toast';
import { db } from '../config/firebase';
import { useApp } from '../context/AppContext';

const ORDER_STAGES = [
  { key: 'pending', label: 'Pending' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'assigned', label: 'Assigned' },
  { key: 'dispatched', label: 'Dispatched' },
  { key: 'in_transit', label: 'In Transit' },
  { key: 'nearing', label: 'Arriving' },
  { key: 'delivered', label: 'Delivered' },
];

const STAGE_META = {
  pending: { progress: 10, tone: 'orange', label: 'Awaiting review' },
  accepted: { progress: 25, tone: 'blue', label: 'Warehouse selected' },
  assigned: { progress: 40, tone: 'indigo', label: 'Driver assigned' },
  dispatched: { progress: 55, tone: 'cyan', label: 'Route dispatched' },
  in_transit: { progress: 75, tone: 'emerald', label: 'Moving to destination' },
  nearing: { progress: 90, tone: 'amber', label: 'Arriving soon' },
  delivered: { progress: 100, tone: 'slate', label: 'Completed' },
};

const toneClasses = {
  orange: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
  blue: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  indigo: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
  cyan: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
  emerald: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  amber: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  slate: 'text-slate-400 bg-slate-500/10 border-slate-500/20',
};

const driverIcon = new L.Icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/3063/3063822.png',
  iconSize: [32, 32],
  iconAnchor: [16, 32],
});

const startIcon = new L.Icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/2271/2271068.png',
  iconSize: [36, 36],
  iconAnchor: [18, 36],
});

const destinationIcon = new L.Icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/1067/1067555.png',
  iconSize: [34, 34],
  iconAnchor: [17, 34],
});

const formatTime = (value) => {
  if (!value) return '--:--';
  const date = value?.seconds ? new Date(value.seconds * 1000) : new Date(value);
  if (Number.isNaN(date.getTime())) return '--:--';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const formatDateTime = (value) => {
  if (!value) return 'Not recorded';
  const date = value?.seconds ? new Date(value.seconds * 1000) : new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not recorded';
  return date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
};

const getLifecycleSnapshot = (order, delivery) => {
  const rawProgress = Number(delivery?.progress ?? 0);
  const deliveryProgress = Number.isFinite(rawProgress) ? Math.max(0, Math.min(100, Math.round(rawProgress))) : 0;

  let status = order?.status || 'pending';
  if (status === 'dispatched' && delivery) {
    if (deliveryProgress >= 100 || delivery?.status === 'delivered') {
      status = 'delivered';
    } else if (deliveryProgress >= 75 || delivery?.status === 'nearing') {
      status = 'nearing';
    } else if (deliveryProgress > 0 || delivery?.status === 'in_transit') {
      status = 'in_transit';
    }
  }

  const currentIndex = Math.max(0, ORDER_STAGES.findIndex((stage) => stage.key === status));
  const meta = STAGE_META[status] || STAGE_META.pending;
  const progress = status === 'dispatched' || status === 'in_transit' || status === 'nearing' || status === 'delivered'
    ? Math.max(deliveryProgress, meta.progress)
    : meta.progress;

  return {
    status,
    currentIndex,
    meta: { ...meta, progress },
    progress,
    steps: ORDER_STAGES.map((stage, index) => ({
      ...stage,
      active: index <= currentIndex,
      current: index === currentIndex,
    })),
  };
};

const StatusPill = ({ status }) => {
  const meta = STAGE_META[status] || STAGE_META.pending;
  return (
    <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border text-[9px] font-black uppercase tracking-widest ${toneClasses[meta.tone]}`}>
      {status?.replace('_', ' ')}
    </span>
  );
};

const OrdersLifecycle = ({ customerMode = false }) => {
  const { callApi, currentUser } = useApp();
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showTrackMap, setShowTrackMap] = useState(false);

  useEffect(() => {
    const unsubOrders = onSnapshot(
      query(collection(db, 'orders'), orderBy('created_at', 'desc')),
      (snap) => setOrders(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })))
    );

    const unsubDeliveries = onSnapshot(
      query(collection(db, 'deliveries'), orderBy('created_at', 'desc')),
      (snap) => setDeliveries(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })))
    );

    const unsubDrivers = onSnapshot(collection(db, 'drivers'), (snap) => {
      setDrivers(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    });

    const unsubWarehouses = onSnapshot(collection(db, 'warehouses'), (snap) => {
      setWarehouses(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubOrders();
      unsubDeliveries();
      unsubDrivers();
      unsubWarehouses();
    };
  }, []);

  const deliveryByOrderId = useMemo(() => {
    const map = new Map();
    deliveries.forEach((delivery) => {
      if (delivery?.order_id && !map.has(delivery.order_id)) {
        map.set(delivery.order_id, delivery);
      }
    });
    return map;
  }, [deliveries]);

  const scopedOrders = useMemo(() => {
    if (!customerMode) return orders;
    if (!currentUser?.uid) return [];
    return orders.filter((order) => order.customer_id === currentUser.uid);
  }, [orders, customerMode, currentUser?.uid]);

  useEffect(() => {
    if (!selectedOrderId && scopedOrders.length > 0) {
      setSelectedOrderId(scopedOrders[0].id);
    }
  }, [scopedOrders, selectedOrderId]);

  const selectedOrder = useMemo(
    () => scopedOrders.find((order) => order.id === selectedOrderId) || null,
    [scopedOrders, selectedOrderId]
  );

  const selectedDelivery = useMemo(
    () => deliveryByOrderId.get(selectedOrder?.order_id) || null,
    [deliveryByOrderId, selectedOrder]
  );

  const filteredOrders = useMemo(() => {
    return scopedOrders.filter((order) => {
      const matchesSearch = [order.order_id, order.customer_name, order.customer_phone]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [scopedOrders, searchTerm, statusFilter]);

  const lifecycle = useMemo(
    () => getLifecycleSnapshot(selectedOrder, selectedDelivery),
    [selectedOrder, selectedDelivery]
  );

  const handleAcceptOrder = async (orderId) => {
    const tid = toast.loading('Accepting order...');
    try {
      const res = await callApi(`/orders/${orderId}/accept`, { method: 'POST' });
      toast.success(res.message || 'Order accepted', { id: tid });
    } catch (error) {
      toast.error(error.message, { id: tid });
    }
  };

  const handleOpenLogistics = () => {
    if (!selectedOrder?.id) return;
    navigate(`/logistics?orderId=${selectedOrder.id}`);
  };

  const handleTrackDriver = () => {
    if (!selectedDelivery?.route || !selectedDelivery.route.length) {
      toast.error('Live route is not available yet');
      return;
    }
    setShowTrackMap(true);
  };

  const handleCancelOrder = async (orderId) => {
    if (!window.confirm('Cancel this order? Inventory will be restored when applicable.')) return;
    const tid = toast.loading('Cancelling order...');
    try {
      const res = await callApi(`/orders/${orderId}/cancel`, { method: 'POST' });
      toast.success(res.message || 'Order cancelled', { id: tid });
    } catch (error) {
      toast.error(error.message, { id: tid });
    }
  };

  const selectedDriver = selectedOrder?.driver_id ? drivers.find((driver) => driver.id === selectedOrder.driver_id) : null;
  const selectedWarehouse = selectedOrder?.warehouse_id ? warehouses.find((warehouse) => warehouse.id === selectedOrder.warehouse_id) : null;

  return (
    <div className="h-full min-h-0 flex flex-col gap-6 text-slate-100 overflow-hidden">
      <header className="bg-slate-800/40 border border-slate-700 rounded-4xl p-6 flex items-center justify-between gap-4 shadow-xl">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-blue-400 mb-2">{customerMode ? 'Customer Orders' : 'Admin Orders'}</p>
          <h1 className="text-3xl font-black tracking-tight text-white">Order Lifecycle</h1>
          <p className="text-sm text-slate-400 mt-1">Monitor every order stage from pending to delivered in one view.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(customerMode ? '/customer-dashboard' : '/admin-dashboard')}
            className="px-4 py-3 rounded-xl border border-slate-700 bg-slate-900/60 text-[10px] font-black uppercase tracking-widest text-slate-300 hover:bg-slate-800 transition-all"
          >
            Back to Dashboard
          </button>
          {!customerMode && (
            <button
              onClick={() => navigate('/logistics')}
              className="px-4 py-3 rounded-xl bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-blue-500 transition-all shadow-lg shadow-blue-600/20"
            >
              Open Logistics
            </button>
          )}
        </div>
      </header>

      <div className="grid grid-cols-12 gap-6 min-h-0 flex-1">
        <aside className="col-span-3 bg-slate-900/50 border border-slate-700 rounded-4xl shadow-xl flex flex-col min-h-0 overflow-hidden">
          <div className="p-5 border-b border-slate-700 space-y-4">
            <div className="relative">
              <MdSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search order, customer, phone"
                className="w-full bg-slate-950 border border-slate-700 rounded-2xl py-3 pl-11 pr-4 text-sm outline-none focus:border-blue-500 transition-colors"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              {['all', ...ORDER_STAGES.map((stage) => stage.key)].map((filter) => (
                <button
                  key={filter}
                  onClick={() => setStatusFilter(filter)}
                  className={`py-2 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all ${statusFilter === filter ? 'bg-blue-600 text-white border-blue-500' : 'bg-slate-950 text-slate-400 border-slate-700 hover:border-slate-500'}`}
                >
                  {filter === 'all' ? 'All' : filter.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
            {filteredOrders.length === 0 ? (
              <div className="py-16 text-center text-slate-500 text-xs italic">No orders match the current filters.</div>
            ) : (
              filteredOrders.map((order) => {
                const orderDelivery = deliveryByOrderId.get(order.order_id);
                const orderLifecycle = getLifecycleSnapshot(order, orderDelivery);
                const orderMeta = orderLifecycle.meta;
                const isSelected = selectedOrderId === order.id;
                return (
                  <button
                    key={order.id}
                    onClick={() => setSelectedOrderId(order.id)}
                    className={`w-full text-left p-4 rounded-2xl border transition-all ${isSelected ? 'bg-blue-600/10 border-blue-500 shadow-lg shadow-blue-500/10' : 'bg-slate-950/60 border-slate-800 hover:border-slate-600'}`}
                  >
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div>
                        <p className="text-[10px] font-mono text-blue-400">#{order.order_id?.slice(-8)}</p>
                        <h3 className="text-sm font-black text-white truncate">{order.customer_name}</h3>
                      </div>
                      <StatusPill status={orderLifecycle.status} />
                    </div>
                    <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-slate-500 mb-3">
                      <MdSchedule />
                      <span>{formatDateTime(order.created_at)}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden mb-2">
                      <div className={`h-full ${orderMeta.tone === 'orange' ? 'bg-orange-500' : orderMeta.tone === 'blue' ? 'bg-blue-500' : orderMeta.tone === 'indigo' ? 'bg-indigo-500' : orderMeta.tone === 'cyan' ? 'bg-cyan-500' : orderMeta.tone === 'emerald' ? 'bg-emerald-500' : orderMeta.tone === 'amber' ? 'bg-amber-500' : 'bg-slate-500'}`} style={{ width: `${orderMeta.progress}%` }} />
                    </div>
                    <div className="flex items-center justify-between text-[8px] font-black uppercase tracking-widest text-slate-500">
                      <span>{orderMeta.label}</span>
                      <span>{orderMeta.progress}%</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        <section className="col-span-6 bg-slate-900/50 border border-slate-700 rounded-4xl shadow-xl p-6 min-h-0 overflow-hidden flex flex-col">
          {!selectedOrder ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center text-slate-500">
              <MdShoppingBag size={56} className="text-slate-700 mb-5" />
              <p className="text-sm font-black uppercase tracking-widest">Select an order to inspect its lifecycle</p>
              <p className="text-xs mt-2 max-w-md">This page shows the full progression, timestamps, driver assignment, and delivery state without crowding the main dashboard.</p>
            </div>
          ) : (
            <div className="flex-1 min-h-0 flex flex-col gap-6 overflow-hidden">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <MdDescription className="text-blue-400" />
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Order Summary</p>
                  </div>
                  <h2 className="text-2xl font-black text-white">{selectedOrder.customer_name}</h2>
                  <p className="text-[10px] font-mono text-blue-400 mt-1">#{selectedOrder.order_id}</p>
                  <div className="mt-4 space-y-2 text-sm text-slate-300">
                    <p>{selectedOrder.customer_address}</p>
                    <p className="text-slate-500">{selectedOrder.customer_phone}</p>
                  </div>
                </div>
                <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <MdTimeline className="text-emerald-400" />
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Current Stage</p>
                  </div>
                  <div className={`inline-flex px-3 py-1 rounded-full border text-[9px] font-black uppercase tracking-widest ${toneClasses[lifecycle.meta.tone]}`}>
                    {lifecycle.status.replace('_', ' ')}
                  </div>
                  <p className="mt-4 text-2xl font-black text-white">{lifecycle.meta.label}</p>
                  <div className="mt-4 h-2 rounded-full bg-slate-800 overflow-hidden">
                    <div className="h-full bg-linear-to-r from-blue-500 via-cyan-500 to-emerald-500" style={{ width: `${lifecycle.meta.progress}%` }} />
                  </div>
                  <p className="mt-2 text-[10px] font-black uppercase tracking-widest text-slate-500">{lifecycle.meta.progress}% complete</p>
                </div>
              </div>

              <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-5">
                <div className="flex items-center gap-3 mb-5">
                  <MdRoute className="text-blue-400" />
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Lifecycle Timeline</p>
                </div>
                <div className="grid grid-cols-7 gap-2">
                  {lifecycle.steps.map((step) => (
                    <div key={step.key} className="flex flex-col items-center gap-2 text-center">
                      <div className={`w-full h-2 rounded-full ${step.active ? 'bg-blue-500' : 'bg-slate-800'}`} />
                      <div className={`w-8 h-8 rounded-full border flex items-center justify-center text-[9px] font-black ${step.current ? 'bg-blue-600 text-white border-blue-400' : step.active ? 'bg-slate-800 text-slate-200 border-slate-600' : 'bg-slate-950 text-slate-600 border-slate-800'}`}>
                        {String(lifecycle.steps.indexOf(step) + 1).padStart(2, '0')}
                      </div>
                      <p className={`text-[8px] font-black uppercase tracking-widest leading-tight ${step.current ? 'text-white' : step.active ? 'text-slate-300' : 'text-slate-600'}`}>
                        {step.label}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 flex-1 min-h-0 overflow-hidden">
                <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-5 overflow-y-auto custom-scrollbar">
                  <div className="flex items-center gap-3 mb-4">
                    <MdCheckCircle className="text-emerald-400" />
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Stage Timestamps</p>
                  </div>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between gap-4"><span className="text-slate-500">Created</span><span className="text-white text-right">{formatDateTime(selectedOrder.created_at)}</span></div>
                    <div className="flex justify-between gap-4"><span className="text-slate-500">Accepted</span><span className="text-white text-right">{formatDateTime(selectedOrder.accepted_at)}</span></div>
                    <div className="flex justify-between gap-4"><span className="text-slate-500">Assigned</span><span className="text-white text-right">{formatDateTime(selectedOrder.driver_assigned_at)}</span></div>
                    <div className="flex justify-between gap-4"><span className="text-slate-500">Dispatched</span><span className="text-white text-right">{formatDateTime(selectedOrder.dispatched_at)}</span></div>
                    <div className="flex justify-between gap-4"><span className="text-slate-500">Delivered</span><span className="text-white text-right">{formatDateTime(selectedOrder.delivered_at)}</span></div>
                  </div>
                </div>

                <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-5 overflow-y-auto custom-scrollbar">
                  <div className="flex items-center gap-3 mb-4">
                    <MdLocalShipping className="text-blue-400" />
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Delivery Context</p>
                  </div>
                  <div className="space-y-4 text-sm">
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">Warehouse</p>
                      <p className="text-white font-bold">{selectedWarehouse?.name || 'Not assigned yet'}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">Driver</p>
                      <p className="text-white font-bold">{selectedDriver?.name || 'Not assigned yet'}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">Delivery Status</p>
                      <StatusPill status={selectedDelivery?.status || selectedOrder.status} />
                    </div>
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">Latest Delivery Time</p>
                      <p className="text-white font-bold">{formatDateTime(selectedDelivery?.end_time || selectedDelivery?.updated_at)}</p>
                    </div>
                    <div className="pt-2 space-y-2">
                      {!customerMode && (
                        <button
                          onClick={() => handleAcceptOrder(selectedOrder.id)}
                          disabled={selectedOrder.status !== 'pending'}
                          className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-[10px] font-black uppercase tracking-widest transition-all"
                        >
                          Accept Order
                        </button>
                      )}
                      {!customerMode && (
                        <button
                          onClick={handleOpenLogistics}
                          className="w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-[10px] font-black uppercase tracking-widest transition-all"
                        >
                          Open in Logistics
                        </button>
                      )}
                      <button
                        onClick={handleTrackDriver}
                        disabled={!selectedDelivery?.route || selectedOrder.status === 'pending'}
                        className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-[10px] font-black uppercase tracking-widest transition-all"
                      >
                        Track Driver
                      </button>
                      {!customerMode && (
                        <button
                          onClick={() => handleCancelOrder(selectedOrder.id)}
                          disabled={selectedOrder.status === 'delivered'}
                          className="w-full py-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 disabled:bg-slate-900 disabled:text-slate-600 text-red-400 text-[10px] font-black uppercase tracking-widest border border-red-500/20 transition-all"
                        >
                          Cancel Order
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        <aside className="col-span-3 bg-slate-900/50 border border-slate-700 rounded-4xl shadow-xl p-5 flex flex-col min-h-0 overflow-hidden">
          <div className="flex items-center gap-3 mb-5">
            <MdShoppingBag className="text-blue-400" />
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Selected Order Details</p>
          </div>
          {!selectedOrder ? (
            <div className="flex-1 flex items-center justify-center text-slate-500 text-xs italic text-center">Pick an order to inspect assignment and delivery metadata.</div>
          ) : (
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar space-y-5">
              <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Lifecycle Summary</p>
                  <StatusPill status={selectedOrder.status} />
                </div>
                <p className="text-sm font-bold text-slate-100">{lifecycle.meta.label}</p>
                <p className="text-xs text-slate-400 mt-2">{selectedOrder.items?.map((item) => `${item.quantity} x ${item.name}`).join(', ')}</p>
              </div>

              <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-3">Order Timing</p>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between gap-3"><span className="text-slate-500">Created</span><span className="text-white text-right">{formatTime(selectedOrder.created_at)}</span></div>
                  <div className="flex justify-between gap-3"><span className="text-slate-500">Accepted</span><span className="text-white text-right">{formatTime(selectedOrder.accepted_at)}</span></div>
                  <div className="flex justify-between gap-3"><span className="text-slate-500">Dispatched</span><span className="text-white text-right">{formatTime(selectedOrder.dispatched_at)}</span></div>
                  <div className="flex justify-between gap-3"><span className="text-slate-500">Delivered</span><span className="text-white text-right">{formatTime(selectedOrder.delivered_at)}</span></div>
                </div>
              </div>

              <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-3">Routing Notes</p>
                <div className="space-y-3 text-sm text-slate-300">
                  <div className="flex items-start gap-3">
                    <MdRoute className="text-blue-400 mt-0.5" />
                    <p>Order lifecycle stage is sourced directly from Firestore order status and delivery timestamps.</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <MdCheckCircle className="text-emerald-400 mt-0.5" />
                    <p>Completion still releases the driver back to <span className="font-black text-white">available</span> status.</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <MdLocalShipping className="text-cyan-400 mt-0.5" />
                    <p>The logistics workflow remains unchanged and can still be opened from here.</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </aside>
      </div>

      {showTrackMap && selectedDelivery && (
        <div className="fixed inset-0 z-1000 bg-black/70 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="w-full max-w-5xl h-[75vh] bg-slate-900 border border-slate-700 rounded-3xl overflow-hidden relative">
            <button
              onClick={() => setShowTrackMap(false)}
              className="absolute top-4 right-4 z-1000 px-3 py-2 bg-slate-800 text-slate-200 rounded-lg text-xs font-black uppercase tracking-widest border border-slate-700"
            >
              Close
            </button>
            <div className="absolute top-4 left-4 z-1000 px-4 py-2 bg-slate-900/90 border border-slate-700 rounded-xl text-xs font-black uppercase tracking-widest text-blue-400">
              Live Driver Tracking
            </div>
            <MapContainer
              center={[
                selectedDelivery.route[selectedDelivery.current_index || 0]?.lat || selectedDelivery.start_location?.lat || 19.076,
                selectedDelivery.route[selectedDelivery.current_index || 0]?.lon || selectedDelivery.start_location?.lon || 72.877,
              ]}
              zoom={13}
              style={{ height: '100%', width: '100%' }}
            >
              <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
              {selectedDelivery.route && (
                <Polyline positions={selectedDelivery.route.map((p) => [p.lat, p.lon])} color="#3b82f6" weight={6} opacity={0.8} />
              )}
              {selectedDelivery.start_location && (
                <Marker position={[selectedDelivery.start_location.lat, selectedDelivery.start_location.lon]} icon={startIcon}>
                  <Popup><div className="text-black text-xs font-black uppercase">Start</div></Popup>
                </Marker>
              )}
              {selectedDelivery.end_location && (
                <Marker position={[selectedDelivery.end_location.lat, selectedDelivery.end_location.lon]} icon={destinationIcon}>
                  <Popup><div className="text-black text-xs font-black uppercase">Destination</div></Popup>
                </Marker>
              )}
              {selectedDelivery.route && selectedDelivery.route[selectedDelivery.current_index || 0] && (
                <Marker
                  position={[
                    selectedDelivery.route[selectedDelivery.current_index || 0].lat,
                    selectedDelivery.route[selectedDelivery.current_index || 0].lon,
                  ]}
                  icon={driverIcon}
                >
                  <Popup><div className="text-black text-xs font-black uppercase">Driver Current Position</div></Popup>
                </Marker>
              )}
            </MapContainer>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrdersLifecycle;
