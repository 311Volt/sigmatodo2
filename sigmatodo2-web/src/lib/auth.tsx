import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { User } from 'sigmatodo2-common';
import { auth, isWakeupError } from './api';

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
}

interface AuthContextValue extends AuthState {
  login: (token: string, user: User) => void;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: localStorage.getItem('token'),
    isLoading: true,
  });

  const login = useCallback((token: string, user: User) => {
    localStorage.setItem('token', token);
    setState({ user, token, isLoading: false });
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    setState({ user: null, token: null, isLoading: false });
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const user = await auth.me();
      setState(s => ({ ...s, user }));
    } catch {
      logout();
    }
  }, [logout]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      setState(s => ({ ...s, isLoading: false }));
      return;
    }

    let cancelled = false;
    let attempts = 0;

    async function tryMe() {
      try {
        const user = await auth.me();
        if (!cancelled) setState({ user, token, isLoading: false });
      } catch (err) {
        if (cancelled) return;
        if (isWakeupError(err) && attempts < 20) {
          attempts++;
          setTimeout(tryMe, 3000);
        } else {
          localStorage.removeItem('token');
          setState({ user: null, token: null, isLoading: false });
        }
      }
    }

    tryMe();
    return () => { cancelled = true; };
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
