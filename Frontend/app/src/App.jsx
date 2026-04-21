import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AppProvider } from './context/AppContext';
import AppShell from './components/AppShell';
import ErrorBoundary from './components/ErrorBoundary';
import ProtectedRoute from './components/ProtectedRoute';

// Real Pages
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Logistics from './pages/Logistics';
import Inventory from './pages/Inventory';
import AIInsights from './pages/AIInsights';
import Suppliers from './pages/Suppliers';
import Users from './pages/Users';
import Automation from './pages/Automation';

// Placeholders for remaining modules
import { 
  NotFound 
} from './pages/Placeholders';

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
            {/* Logic: Login is OUTSIDE the shell, Dashboard is INSIDE */}
            <Route path="/login" element={<Login />} />
            
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            
            <Route path="/" element={<AppShell />}>
              <Route path="dashboard" element={
                <ProtectedRoute allowedRoles={['admin', 'manager', 'staff', 'viewer']}>
                  <Dashboard />
                </ProtectedRoute>
              } />
              
              <Route path="logistics" element={
                <ProtectedRoute allowedRoles={['admin', 'manager', 'staff']}>
                  <Logistics />
                </ProtectedRoute>
              } />
              
              <Route path="inventory" element={
                <ProtectedRoute allowedRoles={['admin', 'manager', 'staff', 'viewer']}>
                  <Inventory />
                </ProtectedRoute>
              } />
              
              <Route path="suppliers" element={
                <ProtectedRoute allowedRoles={['admin', 'manager']}>
                  <Suppliers />
                </ProtectedRoute>
              } />
              
              <Route path="ai-insights" element={
                <ProtectedRoute allowedRoles={['admin', 'manager']}>
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
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </Router>
      </AppProvider>
    </ErrorBoundary>
  );
}

export default App;
