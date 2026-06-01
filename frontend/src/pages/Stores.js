import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Plus, Edit, Trash2, Store as StoreIcon, Megaphone } from 'lucide-react';
import HoursEditor, { formatHoursText, ensureHoursShape } from '@/components/HoursEditor';
import {
  normalizeWhatsapp,
  normalizeInstagram,
  normalizeFacebook,
  normalizeTiktok,
} from '@/lib/normalizeSocial';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const Stores = () => {
  const [stores, setStores] = useState([]);
  const [postsCounts, setPostsCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingStore, setEditingStore] = useState(null);
  const [formData, setFormData] = useState(empty());

  useEffect(() => { fetchStores(); }, []);

  const fetchStores = async () => {
    try {
      const { data } = await axios.get(`${API}/stores`, { withCredentials: true });
      setStores(data);
      // Fetch posts counts for each store in parallel
      const counts = {};
      await Promise.all(data.map(async (s) => {
        try {
          const r = await axios.get(`${API}/stores/${s.id}/posts`, { withCredentials: true });
          counts[s.id] = r.data.length;
        } catch { counts[s.id] = 0; }
      }));
      setPostsCounts(counts);
    } catch (e) {
      toast.error('Errore caricamento');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (store = null) => {
    if (store) {
      setEditingStore(store);
      setFormData({
        name: store.name, whatsapp: store.whatsapp || '', whatsapp_message: store.whatsapp_message || '',
        instagram: store.instagram || '', facebook: store.facebook || '', tiktok: store.tiktok || '',
        google_review: store.google_review || '', google_maps_url: store.google_maps_url || '',
        appointment_url: store.appointment_url || '',
        hours_text: store.hours_text || '',
        hours: ensureHoursShape(store.hours),
      });
    } else {
      setEditingStore(null);
      setFormData(empty());
    }
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      // Derive a human-readable hours_text from the structured hours so the
      // landing page (and any legacy consumer) always has a string fallback.
      const generatedText = formatHoursText(formData.hours);
      // Safety-net normalization in case the admin pressed Submit without
      // ever blurring the input (e.g. mobile autofill submit).
      const payload = {
        ...formData,
        whatsapp: normalizeWhatsapp(formData.whatsapp),
        instagram: normalizeInstagram(formData.instagram),
        facebook: normalizeFacebook(formData.facebook),
        tiktok: normalizeTiktok(formData.tiktok),
        hours_text: generatedText || formData.hours_text || '',
        post_title: '', post_text: '', post_media_url: '', post_cta_text: '', post_whatsapp_message: '',
      };
      if (editingStore) {
        await axios.put(`${API}/stores/${editingStore.id}`, payload, { withCredentials: true });
        toast.success('Negozio aggiornato');
      } else {
        await axios.post(`${API}/stores`, payload, { withCredentials: true });
        toast.success('Negozio creato');
      }
      setIsDialogOpen(false);
      fetchStores();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Errore');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Eliminare?')) return;
    try {
      await axios.delete(`${API}/stores/${id}`, { withCredentials: true });
      toast.success('Eliminato');
      fetchStores();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Errore');
    }
  };

  if (loading) return <div className="text-center py-12">Caricamento...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-2xl sm:text-3xl font-bold">Gestione Negozi</h2>
        <Button onClick={() => handleOpenDialog()} className="bg-[#D2FA46] hover:bg-[#bce63d] text-[#0a0a0b]" data-testid="store-new-button">
          <Plus className="h-4 w-4 mr-2" />
          <span className="hidden sm:inline">Nuovo Negozio</span>
          <span className="sm:hidden">Nuovo</span>
        </Button>
      </div>
      {/* Mobile card stack — generous tap targets, edit & delete spaced */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="stores-list">
        {stores.length === 0 ? (
          <div className="bg-white dark:bg-[#131316] rounded-xl border border-gray-200 dark:border-white/10 p-6 text-center text-gray-500 dark:text-[#6a6a72]">
            Nessun negozio. Creane uno per iniziare.
          </div>
        ) : stores.map(s => {
          const social = [s.whatsapp, s.instagram, s.facebook, s.tiktok].filter(Boolean).length;
          return (
            <div key={s.id}
                  className="bg-white dark:bg-[#131316] rounded-2xl border border-gray-200 dark:border-white/10 p-4 shadow-sm"
                  data-testid={`store-card-${s.id}`}>
              <div className="flex items-start gap-3 mb-4">
                <StoreIcon className="h-5 w-5 text-[#D2FA46] flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white truncate">{s.name}</h3>
                  <p className="text-xs text-gray-500 dark:text-[#8a8a92] mt-0.5">
                    {social}/4 social attivi · {postsCounts[s.id] || 0} {(postsCounts[s.id] === 1) ? 'annuncio' : 'annunci'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <Link to={`/dashboard/posts?store=${s.id}`} className="contents">
                  <button
                    type="button"
                    className="flex flex-col items-center justify-center gap-1 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#0f0f12] min-h-[60px] py-2 active:scale-95 transition-transform touch-manipulation"
                    data-testid={`store-m-posts-${s.id}`}
                  >
                    <Megaphone className="h-5 w-5 text-[#D2FA46]" />
                    <span className="text-[10px] font-medium text-gray-700 dark:text-[#a8a8b0]">Annunci</span>
                  </button>
                </Link>
                <button
                  type="button"
                  onClick={() => handleOpenDialog(s)}
                  className="flex flex-col items-center justify-center gap-1 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#0f0f12] min-h-[60px] py-2 active:scale-95 transition-transform touch-manipulation"
                  data-testid={`store-m-edit-${s.id}`}
                >
                  <Edit className="h-5 w-5 text-gray-700 dark:text-[#a8a8b0]" />
                  <span className="text-[10px] font-medium text-gray-700 dark:text-[#a8a8b0]">Modifica</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(s.id)}
                  className="flex flex-col items-center justify-center gap-1 rounded-xl border border-red-200 dark:border-red-500/30 bg-white dark:bg-[#0f0f12] min-h-[60px] py-2 active:scale-95 transition-transform touch-manipulation"
                  data-testid={`store-m-delete-${s.id}`}
                >
                  <Trash2 className="h-5 w-5 text-red-500" />
                  <span className="text-[10px] font-medium text-red-600 dark:text-red-400">Elimina</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl w-[95vw] max-h-[90vh] overflow-y-auto overflow-x-hidden p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>{editingStore ? 'Modifica' : 'Nuovo'} Negozio</DialogTitle>
            <DialogDescription>Configura i social e i contatti del negozio. Gli annunci si gestiscono dal pulsante "Annunci" in tabella.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Nome Negozio *</Label>
              <Input value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} required placeholder="Es. Negozio Centro Milano" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>WhatsApp</Label>
                <Input
                  placeholder="Es. 333 1234567 o +39 333 1234567"
                  value={formData.whatsapp}
                  onChange={(e) => setFormData({...formData, whatsapp: e.target.value})}
                  onBlur={(e) => {
                    const v = normalizeWhatsapp(e.target.value);
                    if (v !== formData.whatsapp) setFormData({...formData, whatsapp: v});
                  }}
                  data-testid="store-whatsapp-input"
                />
                <p className="text-[10px] text-gray-500 dark:text-[#6a6a72] mt-1">Inserisci solo il numero — il link <code>wa.me</code> viene generato in automatico.</p>
              </div>
              <div><Label>Messaggio WhatsApp</Label><Input placeholder="Ciao! Info..." value={formData.whatsapp_message} onChange={(e) => setFormData({...formData, whatsapp_message: e.target.value})} /></div>
              <div>
                <Label>Instagram</Label>
                <Input
                  placeholder="Es. mario_rossi oppure @mario_rossi"
                  value={formData.instagram}
                  onChange={(e) => setFormData({...formData, instagram: e.target.value})}
                  onBlur={(e) => {
                    const v = normalizeInstagram(e.target.value);
                    if (v !== formData.instagram) setFormData({...formData, instagram: v});
                  }}
                  data-testid="store-instagram-input"
                />
              </div>
              <div>
                <Label>Facebook</Label>
                <Input
                  placeholder="Es. mario.rossi.page"
                  value={formData.facebook}
                  onChange={(e) => setFormData({...formData, facebook: e.target.value})}
                  onBlur={(e) => {
                    const v = normalizeFacebook(e.target.value);
                    if (v !== formData.facebook) setFormData({...formData, facebook: v});
                  }}
                  data-testid="store-facebook-input"
                />
              </div>
              <div>
                <Label>TikTok</Label>
                <Input
                  placeholder="Es. mario_rossi oppure @mario_rossi"
                  value={formData.tiktok}
                  onChange={(e) => setFormData({...formData, tiktok: e.target.value})}
                  onBlur={(e) => {
                    const v = normalizeTiktok(e.target.value);
                    if (v !== formData.tiktok) setFormData({...formData, tiktok: v});
                  }}
                  data-testid="store-tiktok-input"
                />
              </div>
              <div><Label>Google Review</Label><Input placeholder="https://g.page/..." value={formData.google_review} onChange={(e) => setFormData({...formData, google_review: e.target.value})} /></div>
              <div className="sm:col-span-2"><Label>Google Maps (Navigazione)</Label><Input placeholder="https://maps.app.goo.gl/..." value={formData.google_maps_url} onChange={(e) => setFormData({...formData, google_maps_url: e.target.value})} /></div>
              <div className="sm:col-span-2">
                <Label>Prenota appuntamento — link Google Calendar</Label>
                <Input
                  placeholder="https://calendar.app.google/..."
                  value={formData.appointment_url}
                  onChange={(e) => setFormData({...formData, appointment_url: e.target.value})}
                  data-testid="store-appointment-url-input"
                />
                <p className="text-[11px] text-gray-500 dark:text-[#6a6a72] mt-1 leading-relaxed">
                  Crea una pagina di "Prenotazione appuntamenti" su Google Calendar (Workspace o Gmail
                  personale): Calendar → ➕ Crea → <strong>Programmazione appuntamenti</strong> →
                  copia il link pubblico e incollalo qui. Sulla landing comparirà un bottone "Prenota appuntamento"
                  che apre direttamente la pagina di prenotazione in una nuova tab.
                </p>
              </div>
            </div>
            <div className="border-t pt-4 space-y-3">
              <div className="text-sm font-semibold text-gray-700 dark:text-[#a8a8b0]">Scheda negozio (pulsante "Store" sulla landing)</div>
              <HoursEditor
                value={formData.hours}
                onChange={(h) => setFormData({ ...formData, hours: h })}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Annulla</Button>
              <Button type="submit" className="bg-[#D2FA46] hover:bg-[#bce63d] text-[#0a0a0b]">{editingStore ? 'Aggiorna' : 'Crea'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const empty = () => ({
  name: '', whatsapp: '', whatsapp_message: '', instagram: '', facebook: '', tiktok: '',
  google_review: '', google_maps_url: '', appointment_url: '', hours_text: '', hours: ensureHoursShape(null),
});

export default Stores;
