import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from '@/components/ui/sonner';
import { AuthProvider } from '@/contexts/AuthContext';
import { VendorAuthProvider } from '@/contexts/VendorAuthContext';
import Login from '@/pages/Login';
import Dashboard from '@/pages/Dashboard';
import Marketing from '@/pages/Marketing';
import Terms from '@/pages/Terms';
import Privacy from '@/pages/Privacy';
import License from '@/pages/License';
import VendorLanding from '@/pages/VendorLanding';
import StoreLanding from '@/pages/StoreLanding';
import VendorLogin from '@/pages/VendorLogin';
import VendorDashboard from '@/pages/VendorDashboard';
import VendorPrivacy from '@/pages/VendorPrivacy';
import ProtectedRoute from '@/components/ProtectedRoute';
import ProtectedVendorRoute from '@/components/ProtectedVendorRoute';
import DomainGuard from '@/components/DomainGuard';
import '@/App.css';

function App() {
  return (
    <AuthProvider>
      <VendorAuthProvider>
        <BrowserRouter>
          <DomainGuard>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/vendor-login" element={<VendorLogin />} />
              <Route path="/v/:vendorId" element={<VendorLanding />} />
              <Route path="/v/:vendorId/privacy" element={<VendorPrivacy />} />
              {/* Store lead-gen landing page (Meta/Google Ads funnel). */}
              <Route path="/s/:slug" element={<StoreLanding />} />
              <Route
                path="/dashboard/*"
                element={
                  <ProtectedRoute>
                    <Dashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/vendor-dashboard"
                element={
                  <ProtectedVendorRoute>
                    <VendorDashboard />
                  </ProtectedVendorRoute>
                }
              />
              <Route path="/" element={<Marketing />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/license" element={<License />} />
            </Routes>
          </DomainGuard>
          <Toaster />
        </BrowserRouter>
      </VendorAuthProvider>
    </AuthProvider>
  );
}

export default App;