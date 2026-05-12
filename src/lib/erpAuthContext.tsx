'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase';

type ErpAuthContextType = {
  user: User | null;
  loading: boolean;
  erpSessionValid: boolean;
};

const ErpAuthContext = createContext<ErpAuthContextType | undefined>(undefined);

export function ErpAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [erpSessionValid, setErpSessionValid] = useState(false);

  useEffect(() => {
    if (!auth) {
      // Firebase not initialized on server side
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  // Check if ERP session is valid (cookie exists and is valid)
  useEffect(() => {
    const checkErpSession = async () => {
      try {
        // Try to fetch a protected ERP route to validate session
        const res = await fetch('/api/erp/auth/verify', { method: 'GET' });
        setErpSessionValid(res.ok);
      } catch {
        setErpSessionValid(false);
      }
    };

    if (user) {
      checkErpSession();
    } else {
      setErpSessionValid(false);
    }
  }, [user]);

  return (
    <ErpAuthContext.Provider value={{ user, loading, erpSessionValid }}>
      {children}
    </ErpAuthContext.Provider>
  );
}

export function useErpAuth() {
  const context = useContext(ErpAuthContext);
  if (context === undefined) {
    throw new Error('useErpAuth must be used within an ErpAuthProvider');
  }
  return context;
}
