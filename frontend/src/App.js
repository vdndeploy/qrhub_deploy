import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from '@/components/ui/sonner';
import { AuthProvider } from '@/contexts/AuthContext';
import { VendorAuthProvider } from '@/contexts/VendorAuthContext';
import Login from '@/pages/Login';
import Dashboard from '@/pages/Dashboard';
import VendorLanding from '@/pages/VendorLanding';
import VendorLogin from '@/pages/VendorLogin';
import VendorDashboard from '@/pages/VendorDashboard';
import ProtectedRoute from '@/components/ProtectedRoute';
import ProtectedVendorRoute from '@/components/ProtectedVendorRoute';
import '@/App.css';

function App() {
  return (
    <AuthProvider>
      <VendorAuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/vendor-login" element={<VendorLogin />} />
            <Route path="/v/:vendorId" element={<VendorLanding />} />
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
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
          </Routes>
          <Toaster />
        </BrowserRouter>
      </VendorAuthProvider>
    </AuthProvider>
  );
}

export default App;