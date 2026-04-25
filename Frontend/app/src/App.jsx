import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AppProvider } from './context/AppContext';
import AppShell from './components/AppShell';
import ErrorBoundary from './components/ErrorBoundary';
import ProtectedRoute from './components/ProtectedRoute';

// Real Pages
import Login from './pages/Login';
import Signup from './pages/Signup';
import Dashboard from './pages/Dashboard';
import Logistics from './pages/Logistics';
import Inventory from './pages/Inventory';
import AIInsights from './pages/AIInsights';
import Suppliers from './pages/Suppliers';
import Users from './pages/Users';
import Automation from './pages/Automation';
import SupplierDashboard from './pages/SupplierDashboard';
import DriverDashboard from './pages/DriverDashboard';
import CustomerMarketplace from './pages/CustomerMarketplace';
import CustomerDashboard from './pages/CustomerDashboard';

// Placeholders for remaining modules
import { 
  NotFound 
} from './pages/Placeholders';
import { useApp } from './context/AppContext';

const DashboardRedirect = () => {
  const { userRole } = useApp();
  if (userRole === 'admin') return <Navigate to="/admin-dashboard" replace />;
  if (userRole === 'supplier') return <Navigate to="/supplier-dashboard" replace />;
  if (userRole === 'customer') return <Navigate to="/customer-dashboard" replace />;
  if (userRole === 'driver') return <Navigate to="/driver-dashboard" replace />;
  return <Navigate to="/login" replace />;
};

function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <Router>
          <Toaster 
            position="top-right"
            toastOptions={{
              duration: 4000,
              style: { background: '#1E293B', color: '#F1F5F9', border: '1px solid #334155' }
            }} 
          />
          <Routes>
            {/* Auth Routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            
            <Route path="/" element={<Navigate to="/login" replace />} />
            
            {/* Unified Dashboard Redirect */}
            <Route path="/dashboard" element={
              <ProtectedRoute>
                <DashboardRedirect />
              </ProtectedRoute>
            } />
            
            <Route path="/" element={<AppShell />}>
              {/* ADMIN ONLY ROUTES */}
              <Route path="admin-dashboard" element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <Dashboard />
                </ProtectedRoute>
              } />
              
              <Route path="logistics" element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <Logistics />
                </ProtectedRoute>
              } />
              
              <Route path="inventory" element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <Inventory />
                </ProtectedRoute>
              } />
              
              <Route path="suppliers" element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <Suppliers />
                </ProtectedRoute>
              } />
              
              <Route path="ai-insights" element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <AIInsights />
                </ProtectedRoute>
              } />
              
              <Route path="users" element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <Users />
                </ProtectedRoute>
              } />
              
              <Route path="automation" element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <Automation />
                </ProtectedRoute>
              } />

              {/* ROLE SPECIFIC DASHBOARDS */}
              <Route path="supplier-dashboard" element={
                <ProtectedRoute allowedRoles={['supplier']}>
                  <SupplierDashboard />
                </ProtectedRoute>
              } />
              <Route path="driver-dashboard" element={
                <ProtectedRoute allowedRoles={['driver']}>
                  <DriverDashboard />
                </ProtectedRoute>
              } />
              <Route path="customer-dashboard" element={
                <ProtectedRoute allowedRoles={['customer']}>
                  <CustomerDashboard />
                </ProtectedRoute>
              } />
              <Route path="marketplace" element={
                <ProtectedRoute allowedRoles={['customer']}>
                  <CustomerMarketplace />
                </ProtectedRoute>
              } />
              <Route path="track/:orderId" element={
                <ProtectedRoute allowedRoles={['customer', 'admin']}>
                  <CustomerDashboard />
                </ProtectedRoute>
              } />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </Router>
      </AppProvider>
    </ErrorBoundary>
  );
}

export default App;
