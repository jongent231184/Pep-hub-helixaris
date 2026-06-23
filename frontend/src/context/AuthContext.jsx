import React, { createContext, useContext, useEffect, useState } from 'react';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    try {
      const raw = localStorage.getItem('ghp_user');
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  });

  useEffect(() => {
    if (user) localStorage.setItem('ghp_user', JSON.stringify(user));
    else localStorage.removeItem('ghp_user');
  }, [user]);

  const login = (email, password) => {
    // Mock login
    const u = { email, name: email.split('@')[0] };
    setUser(u);
    return u;
  };

  const register = (data) => {
    const u = { email: data.email, name: data.firstName || data.email.split('@')[0] };
    setUser(u);
    return u;
  };

  const logout = () => setUser(null);

  return (
    <AuthContext.Provider value={{ user, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
