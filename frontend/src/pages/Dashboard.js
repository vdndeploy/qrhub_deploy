import { useEffect, useState } from 'react';
import { Routes, Route, Link, useLocation, Navigate, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import Overview from './Overview';
import Vendors from './Vendors';
import Stores from './Stores';
import Files from './Files';
import Settings from './Settings';
import Organizations from './Organizations';
import OrgSettings from './OrgSettings';
import Legal from './Legal';
import MyAccount from './MyAccount';
import Dpa from './Dpa';
import Audit from './Audit';
import { LogOut, BarChart3, Users, Settings as SettingsIcon, Store, FolderOpen, Building2, Sliders, FileText, UserCircle, AlertTriangle, Sun, Moon, Shield } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const Dashboard = () => {
  const { logout, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const isSuper = user?.role === 'super_admin';
  const [dpaNeeded, setDpaNeeded] = useState(false);
  const { isDark, toggle: toggleTheme } = useTheme();

  const isActive = (path) => location.pathname.startsWith(path);

  useEffect(() => {
    if (isSuper) return;
    axios.get(`${API}/me/dpa-status`, { withCredentials: true })
      .then(r => { if (r.data?.required && !r.data?.accepted) setDpaNeeded(true); })
      .catch(() => {});
  }, [isSuper]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0a0a0b]">
      <header className="bg-white dark:bg-[#131316] border-b border-gray-200 dark:border-white/10 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-lg bg-[#D2FA46] flex items-center justify-center flex-shrink-0">
                <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" className="w-5 h-5">
                  <rect x="3" y="3" width="7" height="7" rx="1.2"/>
                  <rect x="14" y="3" width="7" height="7" rx="1.2"/>
                  <rect x="3" y="14" width="7" height="7" rx="1.2"/>
                  <line x1="14" y1="14" x2="21" y2="14"/>
                  <line x1="14" y1="18" x2="18" y2="18"/>
                  <line x1="14" y1="21" x2="21" y2="21"/>
                </svg>
              </div>
              <span className="text-xl sm:text-2xl font-black tracking-tight text-gray-900 dark:text-white">QRHub</span>
            </div>
            <span className="text-xs sm:text-sm text-gray-500 dark:text-[#6a6a72] hidden sm:inline">
              {isSuper ? 'Super Admin' : 'Admin'}
            </span>
          </div>
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            <span className="text-xs sm:text-sm text-gray-600 dark:text-[#8a8a92] hidden md:inline truncate max-w-[180px]">{user?.email}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={toggleTheme}
              data-testid="theme-toggle-button"
              className="flex-shrink-0"
              aria-label={isDark ? 'Passa al tema chiaro' : 'Passa al tema scuro'}
              title={isDark ? 'Passa al tema chiaro' : 'Passa al tema scuro'}
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={logout}
              data-testid="logout-button"
              className="flex-shrink-0"
            >
              <LogOut className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Esci</span>
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-8">
        {dpaNeeded && !location.pathname.startsWith('/dashboard/dpa') && (
          <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3"
                data-testid="dpa-pending-banner">
            <AlertTriangle className="h-5 w-5 text-amber-700 mt-0.5 flex-shrink-0" />
            <div className="flex-1 text-sm">
              <p className="font-semibold text-amber-900">DPA non ancora accettato</p>
              <p className="text-amber-800">
                Prima di poter utilizzare la piattaforma in produzione devi accettare il
                Data Processing Agreement (richiesto dall'Art. 28 GDPR).
              </p>
            </div>
            <Button size="sm" onClick={() => navigate('/dashboard/dpa')}
                    className="bg-amber-700 hover:bg-amber-800 text-white"
                    data-testid="dpa-pending-cta">
              Leggi e accetta
            </Button>
          </div>
        )}
        <nav className="flex gap-1 sm:gap-2 mb-6 sm:mb-8 overflow-x-auto pb-2 -mx-3 px-3 sm:mx-0 sm:px-0 scrollbar-hide" data-testid="dashboard-nav">
          {!isSuper && (
            <>
              <Link to="/dashboard" className="flex-shrink-0">
                <Button
                  variant={isActive('/dashboard') && location.pathname === '/dashboard' ? 'default' : 'ghost'}
                  size="sm"
                  className={isActive('/dashboard') && location.pathname === '/dashboard' ? 'bg-[#D2FA46] hover:bg-[#bce63d] text-[#0a0a0b]' : ''}
                  data-testid="nav-overview"
                >
                  <BarChart3 className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Panoramica</span>
                  <span className="sm:hidden ml-1 text-xs">Home</span>
                </Button>
              </Link>
              <Link to="/dashboard/stores" className="flex-shrink-0">
                <Button
                  variant={isActive('/dashboard/stores') ? 'default' : 'ghost'}
                  size="sm"
                  className={isActive('/dashboard/stores') ? 'bg-[#D2FA46] hover:bg-[#bce63d] text-[#0a0a0b]' : ''}
                  data-testid="nav-stores"
                >
                  <Store className="h-4 w-4 sm:mr-2" />
                  <span className="ml-1 sm:ml-0 text-xs sm:text-sm">Negozi</span>
                </Button>
              </Link>
              <Link to="/dashboard/vendors" className="flex-shrink-0">
                <Button
                  variant={isActive('/dashboard/vendors') ? 'default' : 'ghost'}
                  size="sm"
                  className={isActive('/dashboard/vendors') ? 'bg-[#D2FA46] hover:bg-[#bce63d] text-[#0a0a0b]' : ''}
                  data-testid="nav-vendors"
                >
                  <Users className="h-4 w-4 sm:mr-2" />
                  <span className="ml-1 sm:ml-0 text-xs sm:text-sm">Venditori</span>
                </Button>
              </Link>
              <Link to="/dashboard/media" className="flex-shrink-0">
                <Button
                  variant={isActive('/dashboard/media') || isActive('/dashboard/files') ? 'default' : 'ghost'}
                  size="sm"
                  className={isActive('/dashboard/media') || isActive('/dashboard/files') ? 'bg-[#D2FA46] hover:bg-[#bce63d] text-[#0a0a0b]' : ''}
                  data-testid="nav-media"
                >
                  <FolderOpen className="h-4 w-4 sm:mr-2" />
                  <span className="ml-1 sm:ml-0 text-xs sm:text-sm">Media</span>
                </Button>
              </Link>
              <Link to="/dashboard/organization" className="flex-shrink-0">
                <Button
                  variant={isActive('/dashboard/organization') ? 'default' : 'ghost'}
                  size="sm"
                  className={isActive('/dashboard/organization') ? 'bg-[#D2FA46] hover:bg-[#bce63d] text-[#0a0a0b]' : ''}
                  data-testid="nav-org-settings"
                >
                  <Sliders className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Org.</span>
                  <span className="sm:hidden ml-1 text-xs">Org</span>
                </Button>
              </Link>
            </>
          )}
          {isSuper && (
            <>
              <Link to="/dashboard/organizations" className="flex-shrink-0">
                <Button
                  variant={isActive('/dashboard/organizations') ? 'default' : 'ghost'}
                  size="sm"
                  className={isActive('/dashboard/organizations') ? 'bg-[#D2FA46] hover:bg-[#bce63d] text-[#0a0a0b]' : ''}
                  data-testid="nav-organizations"
                >
                  <Building2 className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Organizzazioni</span>
                  <span className="sm:hidden ml-1 text-xs">Org</span>
                </Button>
              </Link>
              <Link to="/dashboard/settings" className="flex-shrink-0">
                <Button
                  variant={isActive('/dashboard/settings') ? 'default' : 'ghost'}
                  size="sm"
                  className={isActive('/dashboard/settings') ? 'bg-[#D2FA46] hover:bg-[#bce63d] text-[#0a0a0b]' : ''}
                  data-testid="nav-settings"
                >
                  <SettingsIcon className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Deploy</span>
                  <span className="sm:hidden ml-1 text-xs">Deploy</span>
                </Button>
              </Link>
            </>
          )}
          <Link to="/dashboard/legal" className="flex-shrink-0">
            <Button
              variant={isActive('/dashboard/legal') ? 'default' : 'ghost'}
              size="sm"
              className={isActive('/dashboard/legal') ? 'bg-[#D2FA46] hover:bg-[#bce63d] text-[#0a0a0b]' : ''}
              data-testid="nav-legal"
            >
              <FileText className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Note Legali</span>
              <span className="sm:hidden ml-1 text-xs">Legale</span>
            </Button>
          </Link>
          <Link to="/dashboard/audit" className="flex-shrink-0">
            <Button
              variant={isActive('/dashboard/audit') ? 'default' : 'ghost'}
              size="sm"
              className={isActive('/dashboard/audit') ? 'bg-[#D2FA46] hover:bg-[#bce63d] text-[#0a0a0b]' : ''}
              data-testid="nav-audit"
            >
              <Shield className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Audit</span>
              <span className="sm:hidden ml-1 text-xs">Audit</span>
            </Button>
          </Link>
          <Link to="/dashboard/account" className="flex-shrink-0">
            <Button
              variant={isActive('/dashboard/account') ? 'default' : 'ghost'}
              size="sm"
              className={isActive('/dashboard/account') ? 'bg-[#D2FA46] hover:bg-[#bce63d] text-[#0a0a0b]' : ''}
              data-testid="nav-my-account"
            >
              <UserCircle className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Account</span>
              <span className="sm:hidden ml-1 text-xs">Me</span>
            </Button>
          </Link>
        </nav>

        <Routes>
          <Route index element={isSuper ? <Navigate to="/dashboard/organizations" replace /> : <Overview />} />
          <Route path="stores" element={<Stores />} />
          <Route path="vendors" element={<Vendors />} />
          <Route path="files" element={<Files />} />
          <Route path="media" element={<Files />} />
          <Route path="organization" element={<OrgSettings />} />
          <Route path="organizations" element={<Organizations />} />
          <Route path="settings" element={<Settings />} />
          <Route path="legal" element={<Legal />} />
          <Route path="account" element={<MyAccount />} />
          <Route path="dpa" element={<Dpa />} />
          <Route path="audit" element={<Audit />} />
        </Routes>
      </div>
    </div>
  );
};

export default Dashboard;
