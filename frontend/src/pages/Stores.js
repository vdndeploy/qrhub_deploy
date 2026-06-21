import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Edit, Trash2, Store as StoreIcon, Megaphone, Search, X } from 'lucide-react';
import MobileActionBtn from '../components/MobileActionBtn';
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
  const [search, setSearch] = useState('');
  const [postsCounts, setPostsCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingStore, setEditingStore] = useState(null);
  const [formData, setFormData] = useState(empty());
  const navigate = useNavigate();

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
        address: store.address || '',
        phone: store.phone || '',
        // Landing fields — defaults match the backend StoreCreate model so a
        // store that's never had landing config still gets the same blank form.
        landing_enabled: !!store.landing_enabled,
        landing_slug: store.landing_slug || '',
        landing_title: store.landing_title || '',
        landing_subtitle: store.landing_subtitle || '',
        landing_hero_image: store.landing_hero_image || '',
        landing_cta_mode: store.landing_cta_mode || 'whatsapp',
        landing_whatsapp_message: store.landing_whatsapp_message || '',
        landing_html_widget: store.landing_html_widget || '',
        landing_show_reviews: store.landing_show_reviews !== false,
        landing_show_hours: store.landing_show_hours !== false,
        landing_show_map: store.landing_show_map !== false,
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
      {/* Search filter — case-insensitive across name / social handles */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-[#6a6a72] pointer-events-none" />
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cerca negozio per nome, WhatsApp, Instagram…"
          className="pl-10 h-11 text-base bg-white dark:bg-[#131316]"
          data-testid="stores-search-input"
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
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="stores-list">
        {(() => {
          const q = search.trim().toLowerCase();
          const filtered = q
            ? stores.filter(s =>
                (s.name || '').toLowerCase().includes(q) ||
                (s.whatsapp || '').toLowerCase().includes(q) ||
                (s.instagram || '').toLowerCase().includes(q) ||
                (s.facebook || '').toLowerCase().includes(q) ||
                (s.tiktok || '').toLowerCase().includes(q)
              )
            : stores;

          if (stores.length === 0) {
            return (
              <div className="bg-white dark:bg-[#131316] rounded-xl border border-gray-200 dark:border-white/10 p-6 text-center text-gray-500 dark:text-[#6a6a72] sm:col-span-2 xl:col-span-3">
                Nessun negozio. Creane uno per iniziare.
              </div>
            );
          }
          if (filtered.length === 0) {
            return (
              <div className="bg-white dark:bg-[#131316] rounded-xl border border-dashed border-gray-300 dark:border-white/15 p-6 text-center text-gray-500 dark:text-[#6a6a72] sm:col-span-2 xl:col-span-3">
                Nessun negozio corrisponde a "<strong>{search}</strong>".
              </div>
            );
          }
          return filtered.map(s => {
            const social = [s.whatsapp, s.instagram, s.facebook, s.tiktok].filter(Boolean).length;
            return (
              <div key={s.id}
                    className="bg-white dark:bg-[#131316] rounded-2xl border border-gray-200 dark:border-white/10 p-4 shadow-sm min-w-0 overflow-hidden"
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

                <div className="grid grid-cols-3 gap-3" role="group" aria-label={`Azioni per ${s.name}`}>
                  {/* "Annunci" navigates via onClick instead of wrapping the
                      button in a <Link className="contents">. Safari iOS has
                      a long-standing bug where `display: contents` on an
                      anchor inside a CSS grid still emits a layout box, which
                      caused the 3 buttons to overflow to the right of the
                      card on mobile. */}
                  <MobileActionBtn
                    icon={Megaphone}
                    label="Annunci"
                    onClick={() => navigate(`/dashboard/posts?store=${s.id}`)}
                    data-testid={`store-m-posts-${s.id}`}
                  />
                  <MobileActionBtn
                    icon={Edit}
                    label="Modifica"
                    onClick={() => handleOpenDialog(s)}
                    data-testid={`store-m-edit-${s.id}`}
                  />
                  <MobileActionBtn
                    icon={Trash2}
                    label="Elimina"
                    tint="#ef4444"
                    onClick={() => handleDelete(s.id)}
                    data-testid={`store-m-delete-${s.id}`}
                  />
                </div>
              </div>
            );
          });
        })()}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl w-[95vw] max-h-[90vh] overflow-y-auto overflow-x-hidden p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>{editingStore ? 'Modifica' : 'Nuovo'} Negozio</DialogTitle>
            <DialogDescription>Configura i social e i contatti del negozio. Gli annunci si gestiscono dal pulsante "Annunci" sulla card del negozio.</DialogDescription>
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
              <div className="text-sm font-semibold text-gray-700 dark:text-[#a8a8b0]">Scheda negozio (pulsante &quot;Store&quot; sulla landing)</div>
              <HoursEditor
                value={formData.hours}
                onChange={(h) => setFormData({ ...formData, hours: h })}
              />
              <div>
                <Label>Indirizzo</Label>
                <Input
                  placeholder="Via Roma 10, Verona"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  data-testid="store-address-input"
                />
              </div>
              <div>
                <Label>Telefono</Label>
                <Input
                  placeholder="+39 045 1234567"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  data-testid="store-phone-input"
                />
              </div>
            </div>

            {/* La gestione completa della Landing Page (immagine, CTA, slug
                pubblico, widget, KPI funnel) è stata spostata nel tab
                dedicato "Landing" per evitare di rendere questo dialog
                troppo lungo. Qui restano solo i dati negozio core. */}
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
  address: '', phone: '',
  landing_enabled: false, landing_slug: '', landing_title: '', landing_subtitle: '',
  landing_hero_image: '', landing_cta_mode: 'whatsapp', landing_whatsapp_message: '',
  landing_html_widget: '', landing_show_reviews: true, landing_show_hours: true, landing_show_map: true,
});

// Compact checkbox row used inside the landing config (shows/hides
// each section of the public page). Centralized so the 3 rows stay
// visually consistent without verbose JSX.
const CheckboxRow = ({ label, checked, onChange, testId }) => (
  <label className="flex items-center gap-2 cursor-pointer select-none" data-testid={testId}>
    <input
      type="checkbox"
      checked={!!checked}
      onChange={(e) => onChange(e.target.checked)}
      className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
    />
    <span className="text-xs text-gray-700 dark:text-[#a8a8b0]">{label}</span>
  </label>
);

export default Stores;
