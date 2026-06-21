import { useEffect, useState } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  Sparkles, Edit, ExternalLink, Eye, MessageCircle, Image as ImageIcon,
  Search, X, FormInput, FolderOpen,
} from 'lucide-react';
import MediaPicker from '@/components/MediaPicker';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * Landings — dedicated tab to configure store lead-gen landing pages.
 *
 * Why separate from /dashboard/stores: the store dialog was getting too tall
 * (core fields + landing config crammed together). Splitting concerns:
 *   - /dashboard/stores      → identity & operational fields (WA / orari / Google links)
 *   - /dashboard/landings    → public-funnel config (image hero, slug, CTA mode, KPIs)
 *
 * Visual layout: one card per store with the landing toggle prominent +
 * "Modifica" button opening the dedicated dialog. Inactive stores are
 * grouped at the bottom so the admin sees first what's live for paid ads.
 */
const Landings = () => {
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const [formData, setFormData] = useState(emptyLanding());
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/stores`, { withCredentials: true });
      setStores(data);
    } catch (e) {
      toast.error('Errore caricamento landing');
    } finally {
      setLoading(false);
    }
  };

  const openEditor = (store) => {
    setEditing(store);
    setFormData({
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
      landing_review_read_url: store.landing_review_read_url || '',
    });
  };

  const closeEditor = () => { setEditing(null); setFormData(emptyLanding()); };

  const handleSave = async (e) => {
    e?.preventDefault?.();
    setSaving(true);
    try {
      // We PUT only the landing fields — the backend update_store endpoint
      // takes the full StoreCreate model, so we MUST also send the rest of
      // the store's identity fields untouched to avoid clearing them.
      const payload = { ...editing, ...formData };
      delete payload.id; delete payload.created_at;
      await axios.put(`${API}/stores/${editing.id}`, payload, { withCredentials: true });
      toast.success('Landing salvata');
      closeEditor();
      await load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Errore nel salvataggio');
    } finally {
      setSaving(false);
    }
  };

  // Direct file → Cloudinary upload for the hero banner. Mirrors Posts.js
  // upload path (POST /api/upload with folder=landings). Keeps the
  // selection inside the form state, so the editor doesn't need to be
  // closed/reopened to "register" the new image.
  const handleHeroUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ''; // allow re-selecting the same file later
    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('folder', 'landings');
    try {
      const { data } = await axios.post(`${API}/upload`, fd, { withCredentials: true });
      setFormData((f) => ({ ...f, landing_hero_image: data.url }));
      toast.success('Banner caricato');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Errore upload immagine');
    } finally {
      setUploading(false);
    }
  };

  const q = search.trim().toLowerCase();
  const filtered = q
    ? stores.filter(s => (s.name || '').toLowerCase().includes(q) || (s.landing_slug || '').toLowerCase().includes(q))
    : stores;
  // Group: active first, inactive after.
  const active = filtered.filter(s => s.landing_enabled);
  const inactive = filtered.filter(s => !s.landing_enabled);

  if (loading) {
    return <div className="py-12 text-center text-sm text-gray-500 dark:text-[#6a6a72]">Caricamento…</div>;
  }

  return (
    <div className="space-y-6" data-testid="landings-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-emerald-500" />
            Landing Lead-Gen
          </h1>
          <p className="text-sm text-gray-500 dark:text-[#8a8a92] mt-1">
            Pagine pubbliche per Meta/Google Ads. Un solo CTA principale, analytics integrate.
          </p>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cerca per nome negozio o slug…"
          className="pl-10 h-11 text-base bg-white dark:bg-[#131316]"
          data-testid="landings-search-input"
        />
        {search && (
          <button type="button" onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-900 dark:hover:text-white">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {stores.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          {active.length > 0 && (
            <Section title="Attive" subtitle="Visibili al pubblico su /s/<slug>">
              <CardGrid items={active} onEdit={openEditor} />
            </Section>
          )}
          {inactive.length > 0 && (
            <Section title="Non attive" subtitle="Landing disabilitate o non ancora configurate" muted>
              <CardGrid items={inactive} onEdit={openEditor} />
            </Section>
          )}
        </>
      )}

      {/* ── Editor dialog ──────────────────────────────────────────── */}
      <Dialog
        open={!!editing}
        onOpenChange={(o) => {
          // Defensive guard: when the MediaPicker (a nested Radix Dialog)
          // opens/closes, Radix dispatches `onOpenChange(false)` on this
          // parent dialog too — the so-called "focus-trap stacking" issue.
          // Ignore those cascading closes so the editor keeps its unsaved
          // form state (incl. the just-selected hero image).
          if (!o && pickerOpen) return;
          if (!o) closeEditor();
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {editing && (
            <form onSubmit={handleSave} className="space-y-5">
              <DialogHeader>
                <DialogTitle>Landing · {editing.name}</DialogTitle>
                <DialogDescription>
                  Configura la pagina pubblica per traffico Meta / Google Ads.
                </DialogDescription>
              </DialogHeader>

              {/* Master toggle */}
              <div className="flex items-center justify-between p-4 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-[#0a0a0b]">
                <div>
                  <div className="font-semibold text-sm text-gray-900 dark:text-white">Pagina pubblica abilitata</div>
                  <p className="text-[11px] text-gray-500 mt-0.5">Quando spenta la pagina /s/&lt;slug&gt; restituisce 404</p>
                </div>
                <label className="inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={!!formData.landing_enabled}
                    onChange={(e) => setFormData({ ...formData, landing_enabled: e.target.checked })}
                    data-testid="landing-enabled-toggle"
                  />
                  <div className="w-12 h-7 bg-gray-300 dark:bg-white/15 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-emerald-500 relative" />
                </label>
              </div>

              {formData.landing_enabled && (
                <>
                  {/* ── Header / Hero banner ─────────────────────────── */}
                  <FormSection title="Header banner" icon={ImageIcon}>
                    <div
                      className="aspect-[16/10] rounded-2xl border-2 border-dashed border-gray-300 dark:border-white/10 bg-gray-50 dark:bg-[#0a0a0b] overflow-hidden relative group"
                      data-testid="landing-hero-preview"
                    >
                      {formData.landing_hero_image ? (
                        <img
                          src={formData.landing_hero_image}
                          alt="Banner landing"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 text-gray-400">
                          <ImageIcon className="h-8 w-8 mb-2" />
                          <p className="text-xs">Nessuna immagine selezionata</p>
                          <p className="text-[10px] mt-1">Formato consigliato: 1200×750 (rapporto 16:10)</p>
                        </div>
                      )}
                      <label
                        htmlFor="landing-hero-upload"
                        className="absolute inset-0 cursor-pointer bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100"
                        data-testid="landing-hero-pick-btn"
                      >
                        <span className="bg-white text-gray-900 px-3 py-1.5 rounded-lg text-xs font-semibold shadow-lg">
                          {formData.landing_hero_image ? 'Cambia immagine' : 'Clicca per caricare'}
                        </span>
                      </label>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <label
                        htmlFor="landing-hero-upload"
                        className={`inline-flex items-center cursor-pointer text-xs font-semibold px-3 py-2 rounded-lg border ${
                          uploading
                            ? 'border-gray-200 bg-gray-100 text-gray-400 cursor-wait'
                            : 'border-emerald-500 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:border-emerald-500/40'
                        }`}
                        data-testid="landing-hero-upload-btn"
                      >
                        <ImageIcon className="h-4 w-4 mr-2" />
                        {uploading ? 'Carico…' : 'Carica nuovo file'}
                        <input
                          id="landing-hero-upload"
                          type="file"
                          accept="image/*"
                          className="sr-only"
                          disabled={uploading}
                          onChange={handleHeroUpload}
                        />
                      </label>
                      <Button type="button" variant="outline" size="sm"
                              onClick={() => setPickerOpen(true)}
                              data-testid="landing-hero-browse-btn">
                        <FolderOpen className="h-4 w-4 mr-2" />
                        Sfoglia libreria
                      </Button>
                      {formData.landing_hero_image && (
                        <Button type="button" variant="outline" size="sm"
                                onClick={() => setFormData((f) => ({ ...f, landing_hero_image: '' }))}
                                data-testid="landing-hero-remove-btn">
                          Rimuovi
                        </Button>
                      )}
                    </div>
                    <p className="text-[10px] text-gray-500 mt-1">
                      L&apos;immagine occupa la parte alta della landing. Titolo &amp; sottotitolo appariranno in overlay nella fascia bassa per non coprire il design.
                    </p>
                  </FormSection>

                  {/* ── Testi sovraimpressione ───────────────────────── */}
                  <FormSection title="Testi in sovraimpressione">
                    <div>
                      <Label>Titolo principale</Label>
                      <Input
                        placeholder="Attiva la tua offerta in 30 secondi"
                        value={formData.landing_title}
                        onChange={(e) => setFormData({ ...formData, landing_title: e.target.value })}
                        data-testid="landing-title-input"
                        maxLength={120}
                      />
                    </div>
                    <div>
                      <Label>Sottotitolo (descrizione breve)</Label>
                      <Input
                        placeholder="Parla con un nostro consulente"
                        value={formData.landing_subtitle}
                        onChange={(e) => setFormData({ ...formData, landing_subtitle: e.target.value })}
                        data-testid="landing-subtitle-input"
                        maxLength={200}
                      />
                    </div>
                  </FormSection>

                  {/* ── Slug ───────────────────────────────────────── */}
                  <FormSection title="URL pubblico">
                    <div className="flex items-center gap-1 max-w-full">
                      <span className="text-sm text-gray-500 flex-shrink-0">/s/</span>
                      <Input
                        placeholder="windtre-castelnuovo-garda"
                        value={formData.landing_slug}
                        onChange={(e) => setFormData({ ...formData, landing_slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })}
                        data-testid="landing-slug-input"
                        className="flex-1 font-mono text-sm"
                      />
                    </div>
                    {formData.landing_slug && (
                      <a href={`/s/${formData.landing_slug}`} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs text-emerald-600 hover:underline font-medium"
                          data-testid="landing-preview-link">
                        <ExternalLink className="h-3 w-3" />
                        Anteprima /s/{formData.landing_slug}
                      </a>
                    )}
                  </FormSection>

                  {/* ── CTA mode picker ──────────────────────────────── */}
                  <FormSection title="Pulsante CTA principale">
                    <div className="grid grid-cols-2 gap-2">
                      <CtaPickButton
                        active={formData.landing_cta_mode === 'whatsapp'}
                        onClick={() => setFormData({ ...formData, landing_cta_mode: 'whatsapp' })}
                        icon={MessageCircle}
                        title="WhatsApp"
                        sub="Click → chat diretta"
                        testId="landing-cta-whatsapp"
                        activeColor="emerald"
                      />
                      <CtaPickButton
                        active={formData.landing_cta_mode === 'html_widget'}
                        onClick={() => setFormData({ ...formData, landing_cta_mode: 'html_widget' })}
                        icon={FormInput}
                        title="Widget HTML"
                        sub="Form partner (WINDTRE)"
                        testId="landing-cta-widget"
                        activeColor="indigo"
                      />
                    </div>

                    {formData.landing_cta_mode === 'whatsapp' && (
                      <div>
                        <Label>Messaggio pre-compilato</Label>
                        <Input
                          placeholder="Ciao! Vorrei info sulle offerte attive."
                          value={formData.landing_whatsapp_message}
                          onChange={(e) => setFormData({ ...formData, landing_whatsapp_message: e.target.value })}
                          data-testid="landing-wa-msg-input"
                          maxLength={600}
                        />
                      </div>
                    )}

                    {formData.landing_cta_mode === 'html_widget' && (
                      <div>
                        <Label>HTML del widget</Label>
                        <textarea
                          rows={6}
                          placeholder="<form action='...'>...</form>  (incolla il widget WINDTRE)"
                          value={formData.landing_html_widget}
                          onChange={(e) => setFormData({ ...formData, landing_html_widget: e.target.value })}
                          data-testid="landing-html-input"
                          maxLength={20000}
                          className="w-full font-mono text-[11px] p-2 border rounded-md bg-white dark:bg-[#0a0a0b] border-gray-300 dark:border-white/10 text-gray-900 dark:text-white"
                        />
                        <p className="text-[10px] text-amber-700 dark:text-amber-300 mt-1">
                          ⚠️ Solo HTML/form. Niente <code>&lt;script&gt;</code> arbitrari.
                        </p>
                      </div>
                    )}
                  </FormSection>

                  {/* ── Recensioni Google: read URL distinto ─────────── */}
                  <FormSection title="Recensioni Google">
                    <CheckboxRow
                      label="Mostra blocco recensioni"
                      checked={formData.landing_show_reviews}
                      onChange={(v) => setFormData({ ...formData, landing_show_reviews: v })}
                      testId="landing-show-reviews"
                    />
                    {formData.landing_show_reviews && (
                      <div>
                        <Label>Link &quot;Leggi le recensioni&quot;</Label>
                        <Input
                          placeholder="https://www.google.com/maps/place/…"
                          value={formData.landing_review_read_url}
                          onChange={(e) => setFormData({ ...formData, landing_review_read_url: e.target.value })}
                          data-testid="landing-review-read-input"
                        />
                        <p className="text-[10px] text-gray-500 mt-1">
                          Incolla il link diretto alla pagina di LETTURA recensioni Google (Maps) — diverso dal link &quot;Lascia recensione&quot; usato altrove. Se vuoto userà il link recensioni del negozio (che apre la form di scrittura).
                        </p>
                      </div>
                    )}
                  </FormSection>

                  {/* ── Sezioni opzionali ────────────────────────────── */}
                  <FormSection title="Sezioni visibili">
                    <div className="grid grid-cols-2 gap-2">
                      <CheckboxRow
                        label="Orari di apertura"
                        checked={formData.landing_show_hours}
                        onChange={(v) => setFormData({ ...formData, landing_show_hours: v })}
                        testId="landing-show-hours"
                      />
                      <CheckboxRow
                        label="Mappa &amp; indirizzo"
                        checked={formData.landing_show_map}
                        onChange={(v) => setFormData({ ...formData, landing_show_map: v })}
                        testId="landing-show-map"
                      />
                    </div>
                  </FormSection>
                </>
              )}

              <DialogFooter>
                <Button type="button" variant="outline" onClick={closeEditor}>Annulla</Button>
                <Button type="submit" disabled={saving}
                        className="bg-emerald-500 hover:bg-emerald-600 text-white"
                        data-testid="landing-save-btn">
                  {saving ? 'Salvataggio…' : 'Salva landing'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <MediaPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(it) => {
          // Defensive: rely on functional setState so we don't drop other
          // unsaved fields if the picker re-opens before this commits.
          // The parent dialog's onOpenChange is guarded by `pickerOpen`
          // so the editor stays open while we set this.
          setFormData((f) => ({ ...f, landing_hero_image: it.url }));
          toast.success('Immagine selezionata');
          // Defer the picker close so React commits formData first.
          setTimeout(() => setPickerOpen(false), 0);
        }}
        title="Banner landing — Sfoglia libreria"
      />
    </div>
  );
};

// ── Small helpers (kept in-file for cohesion) ──────────────────────────────

const EmptyState = () => (
  <div className="rounded-2xl border border-dashed border-gray-300 dark:border-white/15 p-8 text-center bg-gray-50 dark:bg-[#0a0a0b]">
    <Sparkles className="h-10 w-10 mx-auto text-gray-300 dark:text-white/20" />
    <p className="text-sm text-gray-700 dark:text-[#a8a8b0] mt-3 font-semibold">Nessun negozio</p>
    <p className="text-xs text-gray-500 dark:text-[#6a6a72] mt-1">
      Crea prima un negozio dal tab &quot;Negozi&quot;, poi torna qui per attivare la landing.
    </p>
  </div>
);

const Section = ({ title, subtitle, muted, children }) => (
  <div className="space-y-3">
    <div>
      <h2 className={`text-sm font-semibold ${muted ? 'text-gray-500 dark:text-[#6a6a72]' : 'text-gray-900 dark:text-white'}`}>
        {title}
      </h2>
      {subtitle && <p className="text-[11px] text-gray-500 dark:text-[#6a6a72] mt-0.5">{subtitle}</p>}
    </div>
    {children}
  </div>
);

const CardGrid = ({ items, onEdit }) => (
  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
    {items.map((s) => (
      <LandingCard key={s.id} store={s} onEdit={onEdit} />
    ))}
  </div>
);

const LandingCard = ({ store, onEdit }) => {
  const active = !!store.landing_enabled;
  const hasImage = !!store.landing_hero_image;
  return (
    <div
      className={`relative rounded-2xl border overflow-hidden shadow-sm transition-shadow hover:shadow-md ${
        active ? 'border-emerald-300 dark:border-emerald-500/30' : 'border-gray-200 dark:border-white/10 opacity-90'
      }`}
      data-testid={`landing-card-${store.id}`}
    >
      {/* Thumbnail or placeholder header */}
      <div className="relative aspect-[16/9] bg-gradient-to-br from-gray-100 to-gray-200 dark:from-[#1a1a1c] dark:to-[#0a0a0b]">
        {hasImage ? (
          <img src={store.landing_hero_image} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-gray-300 dark:text-white/15">
            <ImageIcon className="h-10 w-10" />
          </div>
        )}
        <div className={`absolute top-2 right-2 inline-flex items-center gap-1 text-[10px] font-semibold uppercase px-2 py-1 rounded-full ${
          active ? 'bg-emerald-500 text-white' : 'bg-gray-200 text-gray-600 dark:bg-white/15 dark:text-white/70'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-white' : 'bg-gray-400'}`} />
          {active ? 'Live' : 'Off'}
        </div>
      </div>

      <div className="p-4 bg-white dark:bg-[#131316]">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate" title={store.name}>
          {store.name}
        </h3>
        {store.landing_slug && (
          <p className="text-[10px] font-mono text-gray-500 dark:text-[#6a6a72] mt-0.5 truncate">
            /s/{store.landing_slug}
          </p>
        )}

        <div className="flex gap-2 mt-3">
          <Button size="sm" variant="outline" className="flex-1"
                  onClick={() => onEdit(store)}
                  data-testid={`landing-edit-${store.id}`}>
            <Edit className="h-3.5 w-3.5 mr-1" />
            Configura
          </Button>
          {active && store.landing_slug && (
            <a href={`/s/${store.landing_slug}`} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center justify-center px-3 rounded-md border border-gray-200 dark:border-white/10 text-gray-700 dark:text-[#a8a8b0] hover:bg-gray-50 dark:hover:bg-white/5"
                title="Apri landing pubblica"
                data-testid={`landing-open-${store.id}`}>
              <Eye className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
};

const FormSection = ({ title, icon: Icon, children }) => (
  <div className="space-y-3 p-4 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#131316]">
    <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
      {Icon && <Icon className="h-4 w-4 text-gray-400" />}
      <span>{title}</span>
    </div>
    {children}
  </div>
);

const CtaPickButton = ({ active, onClick, icon: Icon, title, sub, testId, activeColor }) => {
  const activeCls = activeColor === 'indigo'
    ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300'
    : 'border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`p-3 rounded-xl border-2 text-left transition-all ${
        active ? activeCls : 'border-gray-200 dark:border-white/10 text-gray-600 dark:text-[#a8a8b0]'
      }`}
      data-testid={testId}
    >
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4" />
        <span className="text-sm font-semibold">{title}</span>
      </div>
      <div className="text-[10px] text-gray-500 mt-1">{sub}</div>
    </button>
  );
};

const CheckboxRow = ({ label, checked, onChange, testId }) => (
  <label className="flex items-center gap-2 cursor-pointer select-none" data-testid={testId}>
    <input
      type="checkbox"
      checked={!!checked}
      onChange={(e) => onChange(e.target.checked)}
      className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
    />
    <span className="text-xs text-gray-700 dark:text-[#a8a8b0]" dangerouslySetInnerHTML={{ __html: label }} />
  </label>
);

const emptyLanding = () => ({
  landing_enabled: false,
  landing_slug: '',
  landing_title: '',
  landing_subtitle: '',
  landing_hero_image: '',
  landing_cta_mode: 'whatsapp',
  landing_whatsapp_message: '',
  landing_html_widget: '',
  landing_show_reviews: true,
  landing_show_hours: true,
  landing_show_map: true,
  landing_review_read_url: '',
});

export default Landings;
