import React, { createContext, useContext, useEffect, useState } from 'react';
import { Auth } from '../lib/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('ghp_token');
    if (!token) {
      setLoading(false);
      return;
    }
    Auth.me()
      .then(u => setUser(u))
      .catch(() => {
        localStorage.removeItem('ghp_token');
      })
      .finally(() => setLoading(false));
  }, []);

  const login = async (email, password) => {
    const data = await Auth.login({ email, password });
    localStorage.setItem('ghp_token', data.access_token);
    setUser(data.user);
    return data.user;
  };

  const register = async (payload) => {
    const data = await Auth.register({
      email: payload.email,
      password: payload.password,
      first_name: payload.firstName || '',
      last_name: payload.lastName || '',
    });
    localStorage.setItem('ghp_token', data.access_token);
    setUser(data.user);
    return data.user;
  };

  const logout = () => {
    localStorage.removeItem('ghp_token');
    setUser(null);
  };

  const isAdmin = user?.role === 'admin';

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, isAdmin }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
