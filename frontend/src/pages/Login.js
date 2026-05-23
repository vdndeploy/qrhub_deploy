import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

const Login = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      await login(email, password);
      toast.success('Login effettuato');
      navigate('/dashboard');
    } catch (error) {
      const msg = error.response?.data?.detail || 'Credenziali non valide';
      toast.error(typeof msg === 'string' ? msg : 'Errore di login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0b] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-3">
            <div className="w-12 h-12 rounded-xl bg-[#D2FA46] flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" className="w-7 h-7">
                <rect x="3" y="3" width="7" height="7" rx="1.2"/>
                <rect x="14" y="3" width="7" height="7" rx="1.2"/>
                <rect x="3" y="14" width="7" height="7" rx="1.2"/>
                <line x1="14" y1="14" x2="21" y2="14"/>
                <line x1="14" y1="18" x2="18" y2="18"/>
                <line x1="14" y1="21" x2="21" y2="21"/>
              </svg>
            </div>
          </div>
          <h1 className="text-4xl font-black tracking-tighter text-white mb-2">
            QRHub
          </h1>
          <p className="text-[#8a8a92]">Pannello Amministratore</p>
        </div>

        <div className="bg-[#131316] rounded-lg border border-white/10 p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <Label htmlFor="email" data-testid="login-email-label">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                data-testid="login-email-input"
                className="mt-2"
              />
            </div>

            <div>
              <Label htmlFor="password" data-testid="login-password-label">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                data-testid="login-password-input"
                className="mt-2"
              />
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-[#D2FA46] hover:bg-[#bce63d] text-[#0a0a0b]"
              data-testid="login-submit-button"
            >
              {loading ? 'Accesso...' : 'Accedi'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Login;