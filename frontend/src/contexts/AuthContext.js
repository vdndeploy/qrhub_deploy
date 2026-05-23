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

  // Decide whether the current pathname is a "fully public" page where we want
  // to skip the auth probe entirely (avoids a 401 in the console for plain
  // visitors that have never logged in). Login pages and vendor landings are
  // public BUT we still want to know whether the user is logged in there:
  //   - on /login we redirect already-authenticated admins to /dashboard
  //   - on landings we keep navigation breadcrumbs working
  // so we ALWAYS run checkAuth except on legal/marketing pages where it would
  // be pure noise.
  const path = typeof window !== 'undefined' ? window.location.pathname : '/';
  const isStrictlyPublic = (
    path === '/' || path === '/terms' || path === '/privacy' || path === '/license'
  );

  useEffect(() => {
    if (isStrictlyPublic) {
      setUser(false);
      setLoading(false);
      return;
    }
    checkAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkAuth = async () => {
    try {
      const { data } = await axios.get(`${API}/auth/me`, { withCredentials: true });
      setUser(data);
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
    // Hydrate full user (role, organization_id) from /auth/me
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
