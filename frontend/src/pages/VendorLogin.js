import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useVendorAuth } from '@/contexts/VendorAuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { User } from 'lucide-react';

const VendorLogin = () => {
  const navigate = useNavigate();
  const { login } = useVendorAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      await login(email, password);
      toast.success('Accesso effettuato');
      navigate('/vendor-dashboard');
    } catch (error) {
      const msg = error.response?.data?.detail || 'Credenziali non valide';
      toast.error(typeof msg === 'string' ? msg : 'Errore di login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0a0a0b] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-[#D2FA46] rounded-full mb-4">
            <User className="h-8 w-8 text-gray-900 dark:text-white" />
          </div>
          <h1 className="text-4xl font-black tracking-tighter text-gray-900 dark:text-white mb-2">
            QRHub
          </h1>
          <p className="text-gray-600 dark:text-[#8a8a92]">Area Venditore</p>
        </div>

        <div className="bg-white dark:bg-[#131316] rounded-lg border border-gray-200 dark:border-white/10 p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <Label htmlFor="email" data-testid="vendor-login-email-label">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                data-testid="vendor-login-email-input"
                className="mt-2"
              />
            </div>

            <div>
              <Label htmlFor="password" data-testid="vendor-login-password-label">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                data-testid="vendor-login-password-input"
                className="mt-2"
              />
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-[#D2FA46] hover:bg-[#bce63d] text-[#0a0a0b]"
              data-testid="vendor-login-submit-button"
            >
              {loading ? 'Accesso...' : 'Accedi'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default VendorLogin;