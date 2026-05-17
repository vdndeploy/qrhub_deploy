import { Navigate } from 'react-router-dom';
import { useVendorAuth } from '@/contexts/VendorAuthContext';

const ProtectedVendorRoute = ({ children }) => {
  const { vendor, loading } = useVendorAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#F96815]"></div>
      </div>
    );
  }

  if (!vendor) {
    return <Navigate to="/vendor-login" replace />;
  }

  return children;
};

export default ProtectedVendorRoute;