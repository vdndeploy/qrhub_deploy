import { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Always probe /auth/me at mount, regardless of the current pathname.
  // Why: AuthProvider mounts ONCE per page load. If we'd skipped the probe on
  // the marketing/legal pages, navigating SPA-style to /login afterwards would
  // keep `user=false` forever, making the user think their session expired
  // every time they visited the home page first. A 401 here is expected for
  // anonymous visitors and is silenced so it doesn't pollute the console.
  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const { data } = await axios.get(`${API}/auth/me`, {
        withCredentials: true,
        // 401 is the normal "not logged in" path — don't let axios throw on
        // anything else either, we handle it manually below.
        validateStatus: (s) => s < 500,
      });
      if (data && data.email) setUser(data);
      else setUser(false);
    } catch (e) {
      setUser(false);
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    await axios.post(
      `${API}/auth/login`,
      { email, password },
      { withCredentials: true }
    );
    const { data: me } = await axios.get(`${API}/auth/me`, { withCredentials: true });
    setUser(me);
    return me;
  };

  const logout = async () => {
    await axios.post(`${API}/auth/logout`, {}, { withCredentials: true });
    setUser(false);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
