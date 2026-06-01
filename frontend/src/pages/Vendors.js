import { useState, useEffect } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import MobileActionBtn from '../components/MobileActionBtn';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Edit, Trash2, QrCode, Eye, Key, Download, ExternalLink, Copy, RotateCcw, Printer, Search, X } from 'lucide-react';
import BadgePrintDialog from '@/components/BadgePrintDialog';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const Vendors = () => {
  const [vendors, setVendors] = useState([]);
  const [search, setSearch] = useState('');
  const [stores, setStores] = useState([]);
  const [organization, setOrganization] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isCredentialsDialogOpen, setIsCredentialsDialogOpen] = useState(false);
  const [selectedVendor, setSelectedVendor] = useState(null);
  const [editingVendor, setEditingVendor] = useState(null);
  const [qrPreviewOpen, setQrPreviewOpen] = useState(false);
  const [qrPreviewUrl, setQrPreviewUrl] = useState('');
  const [qrVendorName, setQrVendorName] = useState('');
  const [badgeVendor, setBadgeVendor] = useState(null);
  const [credentialsForm, setCredentialsForm] = useState({
    email: '',
    password: '',
  });
  const [formData, setFormData] = useState({
    name: '',
    bio: '',
    store_id: '',
  });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await Promise.allSettled([fetchVendors(), fetchStores(), fetchOrganization()]);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchStores = async () => {
    try {
      const { data } = await axios.get(`${API}/stores`, { withCredentials: true });
      setStores(data);
    } catch { /* best effort */ }
  };

  const fetchOrganization = async () => {
    try {
      const { data } = await axios.get(`${API}/my-organization`, { withCredentials: true });
      setOrganization(data);
    } catch { /* best effort */ }
  };

  const fetchVendors = async () => {
    try {
      const { data } = await axios.get(`${API}/vendors`, { withCredentials: true });
      setVendors(data);
    } catch {
      toast.error('Errore nel caricamento venditori');
    }
  };

  const handleOpenDialog = (vendor = null) => {
    if (vendor) {
      setEditingVendor(vendor);
      setFormData({
        name: vendor.name,
        bio: vendor.bio,
        store_id: vendor.store_id || '',
        slug: vendor.slug || '',
      });
    } else {
      setEditingVendor(null);
      setFormData({
        name: '',
        bio: '',
        store_id: '',
        slug: '',
      });
    }
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      if (editingVendor) {
        await axios.put(`${API}/vendors/${editingVendor.id}`, formData, {
          withCredentials: true,
        });
        toast.success('Venditore aggiornato');
      } else {
        await axios.post(`${API}/vendors`, formData, {
          withCredentials: true,
        });
        toast.success('Venditore creato');
      }
      setIsDialogOpen(false);
      fetchVendors();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Errore nel salvataggio');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Sei sicuro di voler eliminare questo venditore?'))
      return;

    try {
      await axios.delete(`${API}/vendors/${id}`, { withCredentials: true });
      toast.success('Venditore eliminato');
      fetchVendors();
    } catch (e) {
      toast.error('Errore nell\'eliminazione');
    }
  };

  const handleResetAnalytics = async (vendor) => {
    const msg = `Azzerare tutte le statistiche di "${vendor.name}"?\n\nUtile quando si passa il QR a un nuovo venditore: cancella visite, click e analytics storiche senza eliminare il venditore stesso.\n\nL'operazione è irreversibile.`;
    if (!window.confirm(msg)) return;
    try {
      const { data } = await axios.post(
        `${API}/vendors/${vendor.id}/analytics/reset`,
        {},
        { withCredentials: true }
      );
      toast.success(`Statistiche azzerate (${data.deleted_count} eventi cancellati)`);
      fetchVendors();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Errore azzeramento statistiche');
    }
  };

  const handleDownloadQR = async (id) => {
    try {
      const response = await axios.get(`${API}/vendors/${id}/qr`, {
        withCredentials: true,
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `qr_${id}.png`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success('QR Code scaricato');
    } catch (e) {
      toast.error('Errore nel download QR');
    }
  };

  const handlePreviewQR = async (vendor) => {
    try {
      const response = await axios.get(`${API}/vendors/${vendor.id}/qr`, {
        withCredentials: true,
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      setQrPreviewUrl(url);
      setQrVendorName(vendor.name);
      setSelectedVendor(vendor);
      setQrPreviewOpen(true);
    } catch (e) {
      toast.error('Errore nel caricamento QR');
    }
  };

  const handleDownloadFromPreview = () => {
    const link = document.createElement('a');
    link.href = qrPreviewUrl;
    link.setAttribute('download', `qr_${selectedVendor.id}.png`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    toast.success('QR Code scaricato');
  };

  const handleCloseQrPreview = () => {
    window.URL.revokeObjectURL(qrPreviewUrl);
    setQrPreviewOpen(false);
    setQrPreviewUrl('');
    setQrVendorName('');
    setSelectedVendor(null);
  };

  const handleOpenCredentialsDialog = (vendor) => {
    setSelectedVendor(vendor);
    setCredentialsForm({
      email: vendor.email || `${vendor.name.toLowerCase().replace(/\s+/g, '')}@venditori.example.com`,
      password: '',
    });
    setIsCredentialsDialogOpen(true);
  };

  const handleCreateCredentials = async (e) => {
    e.preventDefault();

    try {
      const res = await axios.post(
        `${API}/vendors/${selectedVendor.id}/credentials`,
        credentialsForm,
        { withCredentials: true }
      );
      toast.success(`Credenziali create per ${selectedVendor.name}: ${res.data.email}`);
      setIsCredentialsDialogOpen(false);
      fetchVendors();
    } catch (err) {
      const detail = err.response?.data?.detail || err.message || 'Errore creazione credenziali';
      toast.error(typeof detail === 'string' ? detail : JSON.stringify(detail));
    }
  };

  // Preview landing helper.
  //
  // iOS Safari and many Android browsers block `window.open` calls that happen
  // INSIDE an async function — even before the first `await` — because the
  // popup-blocker only treats the outermost SYNC click handler as "user
  // gesture". So we open the blank tab in the caller's onClick (sync) and
  // pass the handle in.
  const handlePreviewLanding = async (vendor, win) => {
    try {
      const { data } = await axios.post(
        `${API}/vendors/${vendor.id}/preview-token`,
        {},
        { withCredentials: true }
      );
      const path = (vendor.slug || '').trim() || vendor.id;
      const url = `${window.location.origin}/v/${path}?preview=${encodeURIComponent(data.token)}`;
      if (win && !win.closed) {
        win.location.href = url;
      } else {
        window.location.href = url;
      }
    } catch (e) {
      if (win && !win.closed) win.close();
      toast.error(e.response?.data?.detail || 'Impossibile generare token anteprima');
    }
  };

  // Wrapper used by buttons: opens the blank tab synchronously (so popup
  // blockers see a real user gesture) THEN delegates to the async helper.
  const openPreview = (vendor) => {
    const isDesktop = window.matchMedia('(min-width: 768px)').matches;
    const win = isDesktop ? window.open('about:blank', '_blank') : null;
    handlePreviewLanding(vendor, win);
  };

  if (loading) {
    return <div className="text-center py-12">Caricamento...</div>;
  }

  return (
    <div className="space-y-6" data-testid="vendors-page">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
          Gestione Venditori
        </h2>
        <Button
          onClick={() => handleOpenDialog()}
          className="bg-[#D2FA46] hover:bg-[#bce63d] text-[#0a0a0b]"
          data-testid="create-vendor-button"
        >
          <Plus className="h-4 w-4 mr-2" />
          <span className="hidden sm:inline">Nuovo Venditore</span>
          <span className="sm:hidden">Nuovo</span>
        </Button>
      </div>

      {/* Search filter — case-insensitive across name / email / slug / bio */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-[#6a6a72] pointer-events-none" />
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cerca per nome, email, slug, bio…"
          className="pl-10 h-11 text-base bg-white dark:bg-[#131316]"
          data-testid="vendors-search-input"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-900 dark:hover:text-white"
            aria-label="Cancella ricerca"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Unified card grid — same generous tap targets on every viewport.
          Responsive columns: 1 col mobile, 2 col tablet, 3 col desktop. */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="vendors-list">
        {(() => {
          const q = search.trim().toLowerCase();
          const filtered = q
            ? vendors.filter(v =>
                (v.name || '').toLowerCase().includes(q) ||
                (v.email || '').toLowerCase().includes(q) ||
                (v.slug || '').toLowerCase().includes(q) ||
                (v.bio || '').toLowerCase().includes(q)
              )
            : vendors;

          if (vendors.length === 0) {
            return (
              <div className="bg-white dark:bg-[#131316] rounded-xl border border-gray-200 dark:border-white/10 p-6 text-center text-gray-500 dark:text-[#6a6a72] sm:col-span-2 xl:col-span-3">
                Nessun venditore. Creane uno per iniziare.
              </div>
            );
          }
          if (filtered.length === 0) {
            return (
              <div className="bg-white dark:bg-[#131316] rounded-xl border border-dashed border-gray-300 dark:border-white/15 p-6 text-center text-gray-500 dark:text-[#6a6a72] sm:col-span-2 xl:col-span-3">
                Nessun venditore corrisponde a "<strong>{search}</strong>".
              </div>
            );
          }
          return filtered.map((vendor) => (
            <div key={vendor.id}
                  className="bg-white dark:bg-[#131316] rounded-2xl border border-gray-200 dark:border-white/10 p-4 shadow-sm"
                  data-testid={`vendor-card-${vendor.id}`}>
              <div className="flex items-start gap-3 mb-3">
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white truncate">
                    {vendor.name}
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-[#8a8a92] truncate mt-0.5">
                    {vendor.bio || (vendor.email ? vendor.email : 'Nessuna bio')}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-[#5a5a62] font-medium">Visite</div>
                  <div className="text-xl font-bold text-gray-900 dark:text-white tabular-nums">{vendor.total_views}</div>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2" role="group" aria-label={`Azioni per ${vendor.name}`}>
                <MobileActionBtn icon={Key} label="Login" onClick={() => handleOpenCredentialsDialog(vendor)}
                                  active={vendor.has_credentials}
                                  data-testid={`m-creds-${vendor.id}`} />
                <MobileActionBtn icon={Eye} label="Vedi" tint="#0ea5e9" onClick={() => openPreview(vendor)}
                                  data-testid={`m-preview-${vendor.id}`} />
                <MobileActionBtn icon={QrCode} label="QR" onClick={() => handlePreviewQR(vendor)}
                                  data-testid={`m-qr-${vendor.id}`} />
                <MobileActionBtn icon={Printer} label="Stampa" tint="#6366f1" onClick={() => setBadgeVendor(vendor)}
                                  data-testid={`m-print-${vendor.id}`} />
                <MobileActionBtn icon={Edit} label="Modifica" onClick={() => handleOpenDialog(vendor)}
                                  data-testid={`m-edit-${vendor.id}`} />
                <MobileActionBtn icon={RotateCcw} label="Reset" tint="#f59e0b" onClick={() => handleResetAnalytics(vendor)}
                                  data-testid={`m-reset-${vendor.id}`} />
                <MobileActionBtn icon={Trash2} label="Elimina" tint="#ef4444" onClick={() => handleDelete(vendor.id)}
                                  data-testid={`m-delete-${vendor.id}`} />
              </div>
            </div>
          ));
        })()}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl w-[95vw] max-h-[90vh] overflow-y-auto overflow-x-hidden p-4 sm:p-6" data-testid="vendor-dialog">
          <DialogHeader>
            <DialogTitle>
              {editingVendor ? 'Modifica Venditore' : 'Nuovo Venditore'}
            </DialogTitle>
            <DialogDescription>
              Inserisci i dati del venditore e i link ai social personalizzati
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="name">Nome *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                required
                data-testid="vendor-name-input"
              />
            </div>

            <div>
              <Label htmlFor="bio">Bio</Label>
              <Textarea
                id="bio"
                value={formData.bio}
                onChange={(e) =>
                  setFormData({ ...formData, bio: e.target.value })
                }
                data-testid="vendor-bio-input"
              />
            </div>

            <div>
              <Label htmlFor="vendor-slug">
                Link personalizzato <span className="text-gray-500 dark:text-[#6a6a72] font-normal">(opzionale)</span>
              </Label>
              <div className="flex items-center gap-2 rounded-md border bg-white dark:bg-[#131316] pl-2 focus-within:ring-2 focus-within:ring-[#D2FA46]/30">
                <span className="text-xs text-gray-500 dark:text-[#6a6a72] font-mono truncate hidden sm:inline">{`${window.location.origin}/v/`}</span>
                <span className="text-xs text-gray-500 dark:text-[#6a6a72] font-mono sm:hidden">/v/</span>
                <Input
                  id="vendor-slug"
                  value={formData.slug || ''}
                  onChange={(e) =>
                    setFormData({ ...formData, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })
                  }
                  placeholder={editingVendor ? '(lascia vuoto per usare il codice automatico)' : 'es. mario-rossi'}
                  maxLength={64}
                  className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0 font-mono text-sm"
                  data-testid="vendor-slug-input"
                />
              </div>
              <p className="text-xs text-gray-500 dark:text-[#6a6a72] mt-1">
                Solo lettere minuscole, numeri e trattini (es. <code className="bg-gray-100 dark:bg-[#1a1a1c] px-1 rounded">mario-roma</code>).
                {editingVendor && ' Cambiarlo aggiorna anche il QR; le URL precedenti continuano a funzionare con il codice originale.'}
              </p>
            </div>

            <div>
              <Label htmlFor="store">Negozio *</Label>
              <Select
                value={formData.store_id}
                onValueChange={(value) =>
                  setFormData({ ...formData, store_id: value })
                }
                required
              >
                <SelectTrigger data-testid="vendor-store-select">
                  <SelectValue placeholder="Seleziona negozio" />
                </SelectTrigger>
                <SelectContent>
                  {stores.map((store) => (
                    <SelectItem key={store.id} value={store.id}>
                      {store.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-sm text-gray-500 dark:text-[#6a6a72] mt-1">
                I link social verranno presi dal negozio selezionato
              </p>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
              >
                Annulla
              </Button>
              <Button
                type="submit"
                className="bg-[#D2FA46] hover:bg-[#bce63d] text-[#0a0a0b]"
                data-testid="vendor-submit-button"
              >
                {editingVendor ? 'Aggiorna' : 'Crea'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isCredentialsDialogOpen}
        onOpenChange={setIsCredentialsDialogOpen}
      >
        <DialogContent data-testid="credentials-dialog">
          <DialogHeader>
            <DialogTitle>Crea Credenziali Accesso</DialogTitle>
            <DialogDescription>
              Genera credenziali per {selectedVendor?.name} per accedere alla propria dashboard
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateCredentials} className="space-y-4">
            <div>
              <Label htmlFor="cred-email">Email *</Label>
              <Input
                id="cred-email"
                type="email"
                value={credentialsForm.email}
                onChange={(e) =>
                  setCredentialsForm({ ...credentialsForm, email: e.target.value })
                }
                required
                data-testid="credentials-email-input"
              />
            </div>

            <div>
              <Label htmlFor="cred-password">Password *</Label>
              <Input
                id="cred-password"
                type="text"
                value={credentialsForm.password}
                onChange={(e) =>
                  setCredentialsForm({
                    ...credentialsForm,
                    password: e.target.value,
                  })
                }
                required
                placeholder="Genera una password sicura"
                data-testid="credentials-password-input"
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsCredentialsDialogOpen(false)}
              >
                Annulla
              </Button>
              <Button
                type="submit"
                className="bg-[#D2FA46] hover:bg-[#bce63d] text-[#0a0a0b]"
                data-testid="credentials-submit-button"
              >
                Crea Credenziali
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={qrPreviewOpen} onOpenChange={handleCloseQrPreview}>
        <DialogContent className="max-w-md" data-testid="qr-preview-dialog">
          <DialogHeader>
            <DialogTitle>Anteprima QR Code</DialogTitle>
            <DialogDescription>
              QR Code per {qrVendorName}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="bg-white dark:bg-[#131316] rounded-lg border-2 border-gray-200 dark:border-white/10 p-6 flex items-center justify-center">
              {qrPreviewUrl && (
                <img
                  src={qrPreviewUrl}
                  alt="QR Code Preview"
                  className="w-full max-w-[300px] h-auto"
                  data-testid="qr-preview-image"
                />
              )}
            </div>

            {selectedVendor && (
              <div className="bg-gray-50 dark:bg-[#0a0a0b] rounded-lg p-4 text-sm space-y-2">
                <p className="text-gray-600 dark:text-[#8a8a92]">Link Landing Page:</p>
                <p className="font-mono text-xs break-all text-gray-900 dark:text-white" data-testid="qr-landing-url">
                  {selectedVendor.landing_url || selectedVendor.qr_url}
                </p>
                <div className="flex gap-2 flex-wrap pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const u = selectedVendor.landing_url || selectedVendor.qr_url;
                      window.open(u, '_blank', 'noopener,noreferrer');
                    }}
                    className="h-7 text-xs"
                    data-testid="qr-open-link-button"
                  >
                    <ExternalLink className="h-3.5 w-3.5 mr-1" />
                    Apri link
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      const u = selectedVendor.landing_url || selectedVendor.qr_url;
                      try {
                        await navigator.clipboard.writeText(u);
                        toast.success('Link copiato');
                      } catch {
                        toast.error('Impossibile copiare');
                      }
                    }}
                    className="h-7 text-xs"
                    data-testid="qr-copy-link-button"
                  >
                    <Copy className="h-3.5 w-3.5 mr-1" />
                    Copia link
                  </Button>
                </div>
                {selectedVendor.landing_url && selectedVendor.qr_url && selectedVendor.landing_url !== selectedVendor.qr_url && (
                  <p className="text-[11px] text-emerald-700 pt-1">
                    Il QR usa il tuo dominio personalizzato. Assicurati che i DNS puntino correttamente prima di stampare materiale.
                  </p>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleCloseQrPreview}
            >
              Chiudi
            </Button>
            <Button
              onClick={handleDownloadFromPreview}
              className="bg-[#D2FA46] hover:bg-[#bce63d] text-[#0a0a0b]"
              data-testid="download-qr-from-preview"
            >
              <Download className="h-4 w-4 mr-2" />
              Scarica PNG
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BadgePrintDialog
        open={!!badgeVendor}
        onClose={() => setBadgeVendor(null)}
        vendor={badgeVendor || {}}
        organization={organization}
        landingUrl={badgeVendor?.landing_url}
      />
    </div>
  );
};

export default Vendors;