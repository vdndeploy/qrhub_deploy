import { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const VendorAuthContext = createContext(null);

export const useVendorAuth = () => {
  const context = useContext(VendorAuthContext);
  if (!context) throw new Error('useVendorAuth must be used within VendorAuthProvider');
  return context;
};

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const VendorAuthProvider = ({ children }) => {
  const [vendor, setVendor] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const path = window.location.pathname;
    if (path === '/login' || path === '/vendor-login' || path.startsWith('/v/')) {
      setVendor(false);
      setLoading(false);
      return;
    }
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const { data } = await axios.get(`${API}/vendor-auth/me`, { withCredentials: true });
      setVendor(data);
    } catch (e) {
      setVendor(false);
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    const { data } = await axios.post(
      `${API}/vendor-auth/login`,
      { email, password },
      { withCredentials: true }
    );
    setVendor(data);
    return data;
  };

  const logout = async () => {
    await axios.post(`${API}/vendor-auth/logout`, {}, { withCredentials: true });
    setVendor(false);
  };

  return (
    <VendorAuthContext.Provider value={{ vendor, loading, login, logout, refreshVendor: checkAuth }}>
      {children}
    </VendorAuthContext.Provider>
  );
};