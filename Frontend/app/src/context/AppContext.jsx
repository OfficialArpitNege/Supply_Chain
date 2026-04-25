import React, { createContext, useContext, useState, useEffect } from 'react';
import { auth, db } from '../config/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import toast from 'react-hot-toast';

const AppContext = createContext();

export const AppProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState('agent'); // Default role
  const [activeDeliveriesCount, setActiveDeliveriesCount] = useState(0);
  const [systemDemandLevel, setSystemDemandLevel] = useState('LOW');
  const [loading, setLoading] = useState(true);

  // Subscribe to Auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      if (user) {
        // Fetch role from users collection
        const userRef = query(collection(db, "users"), where("email", "==", user.email));
        onSnapshot(userRef, (snapshot) => {
          if (!snapshot.empty) {
            setUserRole(snapshot.docs[0].data().role || 'staff');
          } else {
            setUserRole('viewer'); // Fallback if user record not found
          }
        });
      } else {
        setUserRole(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Subscribe to active deliveries from Firestore
  useEffect(() => {
    if (!currentUser) return;

    const q = query(
      collection(db, "deliveries"),
      where("status", "==", "dispatched")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const count = snapshot.docs.length;
      setActiveDeliveriesCount(count);

      // Trigger demand prediction when active count changes
      updateDemandLevel(count);

      // Check for high-risk deliveries and notify
      snapshot.docChanges().forEach((change) => {
        if (change.type === "added") {
          const delivery = change.doc.data();
          if (delivery.risk_level === "HIGH") {
            toast.error(`High-risk delivery detected: ${delivery.tracking_id}`, {
              duration: 5000,
              icon: '⚠️',
            });
          }
        }
      });
    }, (error) => {
      console.error("Firestore subscription error:", error);
    });

    return () => unsubscribe();
  }, [currentUser]);

  const updateDemandLevel = async (count) => {
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (userRole) headers['X-Role'] = userRole;

      const response = await fetch('http://127.0.0.1:8000/predict-demand', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          product_id: 101,
          category: "System_Global",
          order_date: new Date().toISOString()
        })
      });
      if (response.ok) {
        const data = await response.json();
        setSystemDemandLevel(data.demand_level || (count > 10 ? 'HIGH' : count > 5 ? 'MEDIUM' : 'LOW'));
      } else {
        // Fallback logic if backend is down
        setSystemDemandLevel(count > 10 ? 'HIGH' : count > 5 ? 'MEDIUM' : 'LOW');
      }
    } catch (error) {
      console.error("Failed to sync demand level:", error);
      setSystemDemandLevel(count > 10 ? 'HIGH' : count > 5 ? 'MEDIUM' : 'LOW');
    }
  };

  const logout = () => {
    auth.signOut();
    toast.success('Logged out successfully');
  };

  const callApi = async (endpoint, options = {}) => {
    const API_BASE = 'http://127.0.0.1:8000';
    const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;

    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (userRole) {
      headers['X-Role'] = userRole;
    }
    if (currentUser?.email) {
      headers['X-Email'] = currentUser.email;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      let errorMessage = `API Error: ${response.status}`;
      try {
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const errorData = await response.json();
          errorMessage = errorData.detail || errorData.message || errorMessage;
        } else {
          const errorText = await response.text();
          errorMessage = errorText.slice(0, 200) || errorMessage;
        }
      } catch (parseError) {
        console.error("Error parsing error response:", parseError);
      }
      throw new Error(errorMessage);
    }

    return response.json();
  };

  const value = {
    currentUser,
    userRole,
    activeDeliveriesCount,
    systemDemandLevel,
    logout,
    loading,
    callApi
  };

  return (
    <AppContext.Provider value={value}>
      {!loading && children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
