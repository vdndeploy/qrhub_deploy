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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Edit, Trash2, QrCode, Eye, Key, Download, ExternalLink, Copy, RotateCcw } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const Vendors = () => {
  const [vendors, setVendors] = useState([]);
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isCredentialsDialogOpen, setIsCredentialsDialogOpen] = useState(false);
  const [selectedVendor, setSelectedVendor] = useState(null);
  const [editingVendor, setEditingVendor] = useState(null);
  const [qrPreviewOpen, setQrPreviewOpen] = useState(false);
  const [qrPreviewUrl, setQrPreviewUrl] = useState('');
  const [qrVendorName, setQrVendorName] = useState('');
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
    fetchVendors();
    fetchStores();
  }, []);

  const fetchVendors = async () => {
    try {
      const { data } = await axios.get(`${API}/vendors`, {
        withCredentials: true,
      });
      setVendors(data);
    } catch (e) {
      toast.error('Errore nel caricamento venditori');
    } finally {
      setLoading(false);
    }
  };

  const fetchStores = async () => {
    try {
      const { data } = await axios.get(`${API}/stores`, {
        withCredentials: true,
      });
      setStores(data);
    } catch (e) {
      console.error('Error fetching stores');
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

      <div className="bg-white dark:bg-[#131316] rounded-lg border border-gray-200 dark:border-white/10 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Bio</TableHead>
              <TableHead className="text-center">
                <Eye className="h-4 w-4 inline" /> Visite
              </TableHead>
              <TableHead className="text-right">Azioni</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {vendors.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-gray-500 dark:text-[#6a6a72] py-8">
                  Nessun venditore. Creane uno per iniziare.
                </TableCell>
              </TableRow>
            ) : (
              vendors.map((vendor) => (
                <TableRow key={vendor.id} data-testid={`vendor-row-${vendor.id}`}>
                  <TableCell className="font-semibold">{vendor.name}</TableCell>
                  <TableCell className="text-sm text-gray-600 dark:text-[#8a8a92]">
                    {vendor.bio || 'N/A'}
                  </TableCell>
                  <TableCell className="text-center">{vendor.total_views}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenCredentialsDialog(vendor)}
                        data-testid={`create-credentials-${vendor.id}`}
                        title={vendor.has_credentials
                          ? `Aggiorna credenziali (${vendor.email})`
                          : 'Crea credenziali accesso'}
                        className={vendor.has_credentials ? 'border-emerald-500 text-emerald-700' : ''}
                      >
                        <Key className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(`${window.location.origin}/v/${vendor.id}?preview=1`, '_blank', 'noopener')}
                        data-testid={`preview-landing-${vendor.id}`}
                        title="Anteprima landing (bypass dominio personalizzato)"
                      >
                        <Eye className="h-4 w-4 text-sky-500" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePreviewQR(vendor)}
                        data-testid={`preview-qr-${vendor.id}`}
                        title="Anteprima QR Code"
                      >
                        <QrCode className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenDialog(vendor)}
                        data-testid={`edit-vendor-${vendor.id}`}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleResetAnalytics(vendor)}
                        data-testid={`reset-analytics-${vendor.id}`}
                        title="Azzera statistiche venditore (utile se il QR viene riassegnato)"
                      >
                        <RotateCcw className="h-4 w-4 text-amber-500" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(vendor.id)}
                        data-testid={`delete-vendor-${vendor.id}`}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
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
                  placeholder={editingVendor ? '(lascia vuoto per usare il codice automatico)' : 'es. gizwindtre'}
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
    </div>
  );
};

export default Vendors;